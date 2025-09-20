# AGENTS.md — Working in this Repo (Tauri v2 + Nuxt/Vue)

> Purpose: give AI coding agents (Agent) everything needed to design, code, test, and validate features in a cross‑platform desktop app built with **Tauri v2** (Rust) and **Nuxt/Vue** (TypeScript). Keep responses concise, deterministic, and *actionable*.

---

## 1) Architecture & Tech Stack

* **Frontend**: Nuxt 4 (Vue 3, `<script setup>`), Nuxt UI v4, TypeScript strict, Vite build.
* **Desktop shell**: Tauri v2 (Rust 2021 edition). Webview via wry; event loop via tao.
* **IPC**: `@tauri-apps/api` on the frontend ↔ Rust `#[tauri::command]` on the backend. Prefer typed wrappers.
* **OS targets**: macOS (Apple Silicon & Intel), Windows 10/11 x64, Linux (x86\_64; optionally aarch64).
* **Tests**:

  * Frontend unit: Vitest + Vue Test Utils
  * E2E/smoke: Playwright driving the built app; optional component tests
  * Rust unit/integration: `cargo test`

**Design principle**: business logic that touches the OS (FS, processes, networking outside `fetch`, secrets, keystore) lives in **Rust commands**. UI logic stays in **Vue**.

**Design Library Information**: Use the Nuxt UI documentation from https://ui4.nuxt.com/llms.txt

---

## 2) Repository Layout (expected)

```
/ (repo root)
├─ apps/
│  ├─ desktop/                # Tauri app root (src-tauri + nuxt front)
│  │  ├─ src-tauri/
│  │  │  ├─ Cargo.toml
│  │  │  ├─ src/
│  │  │  │  ├─ main.rs        # Tauri builder & plugin wiring
│  │  │  │  ├─ commands.rs    # Rust commands (split into modules if large)
│  │  │  │  └─ domain/*       # Optional: business/domain modules
│  │  │  └─ tauri.conf.json   # App config (allowlist, bundles, updater)
│  │  ├─ nuxt.config.ts
│  │  ├─ package.json
│  └─ └─ src/                 # Nuxt app source
├─ tests/                     # e2e harness (Playwright)
└─ .github/workflows/         # CI build/test/release
```

If structure differs, **Agent must scan** `tauri.conf.json`, `package.json`, `nuxt.config.ts`, and `Cargo.toml` to auto‑discover paths and scripts.

---

## 3) How to Run Things

**Dev (hot‑reload web + Tauri)**

* `npm dev` or `npm run dev` within `apps/desktop` should:

  1. launch Nuxt dev server
  2. run `tauri dev` with that URL as devPath

**Build (release)**

* `npm build && npm tauri build` → creates platform installers in `src-tauri/target/release/`.

**Tests**

* Frontend unit: `npm test:unit`
* Rust: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
* E2E: `npm test:e2e` (expects Playwright + built app)

Agent: if scripts are missing, propose a patch to `package.json` adding clear scripts and wire CI.

---

## 4) Security & Permissions (Tauri v2)

* **Allowlist**: Only enable APIs needed in `tauri.conf.json` (`fs`, `dialog`, `shell`, `http`, etc.). Default to *deny*. Document any new permission.
* **CSP**: Enforce a non‑permissive Content Security Policy for the frontend (Nuxt `app/head` or `nuxt.config.ts`). No `unsafe-inline` unless hashed; avoid `eval`.
* **IPC Guardrails**:

  * Validate inputs server‑side (Rust) for every command.
  * Never pass raw file system paths from the UI to OS APIs without normalization and allowlisting.
  * For shell/process access, require explicit use‑cases and sanitization. Prefer no shell.
* **Secret handling**: Use OS keychain via plugin when needed; never embed secrets in the client.
* **Auto‑updater / autostart**: If enabled, document platform specifics and user consent flows.

---

## 5) IPC Pattern (Typed)

**Type definitions (shared)**

* Keep request/response schemas stable; version if breaking changes.

**Frontend (TS)**

```ts
// src/composables/useTauri.ts
import { invoke } from '@tauri-apps/api/core'

export async function getAppVersion() {
  return await invoke<string>('get_app_version')
}

export async function readFileSafe(path: string) {
  return await invoke<{ content: string }>('read_file_safe', { path })
}
```

**Rust**

```rust
// src-tauri/src/commands.rs
use tauri::State;

#[tauri::command]
pub async fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub async fn read_file_safe(path: String) -> Result<serde_json::Value, String> {
    // normalize + allowlist example (replace with real policy)
    use std::path::PathBuf;
    let p = PathBuf::from(&path);
    if !p.starts_with(dirs::home_dir().ok_or("no home dir")?) { return Err("path not allowed".into()); }
    let content = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({"content": content}))
}
```

**Wiring commands**

```rust
// src-tauri/src/main.rs
mod commands;

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().build())
    .invoke_handler(tauri::generate_handler![
      commands::get_app_version,
      commands::read_file_safe,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri app");
}
```

---

## 6) Nuxt/Vue Conventions

* Vue SFCs use `<script setup lang="ts">` and the Composition API.
* State: OS calls via composables wrapping IPC.
* UI components in `/components`. Pages in `/pages`.
* Strict TypeScript and ESLint + Prettier configs enforced (`npm lint` must pass pre‑commit).
* No dynamic `eval` or inline scripts/styles.

---

## 7) Testing & Validation Strategy

**Frontend unit (Vitest)**

* Test composables, stores, and components in isolation.
* Mock `@tauri-apps/api` using an adapter interface; verify IPC payload shape and error handling.

**Rust**

* Unit test command helpers; use integration tests for filesystem/network abstractions with temp dirs.

**E2E (Playwright)**

* Launch built app via Playwright; assert window title, menus, and core flows.
* Provide fixtures for OS‑specific paths. Keep tests idempotent.

**Sample checks Agent must run for each PR**

* `npm typecheck && npm lint && npm test:unit`
* `cargo fmt -- --check && cargo clippy -- -D warnings && cargo test`
* Build the app for the current OS and run `tests/e2e` minimal smoke.

**Artifacts to attach to PR**

* Screenshot(s) of the feature.
* Logs or terminal output of the test runs.
* Playwright trace (on failure).

---

## 8) CI/CD (Expectations)

* GitHub Actions workflow matrix: `os: [macos-latest, windows-latest, ubuntu-24.04]`.
* Cache Rust crates, node\_modules, and Playwright browsers.
* Jobs: lint → unit tests (TS/Rust) → build (per OS) → e2e smoke.
* Draft release on tag with platform artifacts; notarize/sign if configured (macOS/Windows).

---

## 9) Code Review Checklist (for Agent)

1. **Type safety**: TS/Rust types match across IPC; no `any` leaks.
2. **Security**: no broad FS/shell access; validate all inputs; safe defaults.
3. **State mgmt**: no hidden globals; avoid race conditions; abort controllers for async.
4. **UX**: graceful error messages; non‑blocking spinners; keyboard access.
5. **Perf**: avoid heavy work on UI thread; use Rust for CPU/IO‑heavy tasks.
6. **Tests**: unit + at least one Playwright path; negative test for error cases.
7. **Docs**: updated `AGENTS.md` snippets.

---

## 10) Common Tasks (Playbooks)

**Add a new OS capability**

1. Define Rust API in `commands/feature.rs` with input/output types.
2. Wire command in `main.rs` via `generate_handler!`.
3. Add TS wrapper in `src/composables/useFeature.ts`.
4. Add a small UI in `pages/dev/feature.vue` (guarded route) to interactively test.
5. Add unit tests (Rust + Vitest) and one Playwright smoke.

**Create a persistent setting**

* Use a typed settings store (e.g., JSON in app data dir via Rust, or a Tauri plugin). Provide `get/set` Rust commands; wrap in a Pinia store.

**File dialogs & FS**

* Use Tauri `dialog` to choose files; pass safe paths to a *Rust* function that reads/writes.

---

## 11) Config Conventions

* **`tauri.conf.json`**: strict allowlist, windows/mac/linux bundle config, icons, updater/autostart toggles.
* **`nuxt.config.ts`**: SSR false unless explicitly required for pre‑render; CSP; aliases; env.
* **`.env`**: runtime flags. Never commit secrets.

Agent should parse these files and adjust commands accordingly.

---

## 12) Developer UX Utilities

* Hidden **Debug Panel** route (e.g., `/__debug`) exposing:

  * app/version, platform, paths, permission states

---

## 13) How Agent Should Work Here (Operating Mode)

* Prefer **small, surgical diffs** with full context (file path, before/after, tests).
* When adding IPC: include TS wrapper, Rust command, wiring, and tests in one PR.
* Provide **copy‑paste‑ready** code blocks and exact commands to run validation.
* If uncertain about structure, first propose a **repo scan patch** that prints discovered config (no secrets) to help self‑orient.

---

## 14) Adding/Refining Tests (playwright/vitest)

**Vitest mock for Tauri**

```ts
// test/mocks/tauri.ts
export const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
```

**Playwright smoke**

```ts
// tests/e2e/smoke.spec.ts
import { _launchApp } from './utils'

test('opens main window', async ({}) => {
  const app = await _launchApp()
  const title = await app.firstWindow().title()
  expect(title).toMatch(/.+/)
  await app.close()
})
```

Agent must ensure tests run cross‑platform and are hermetic.

---

## 15) How to Improve This AGENTS.md

When opening a PR, Agent should:

1. **Auto‑discover context** and append to this doc:

   * Enumerate `tauri.conf.json` allowlist, plugins, updater settings.
   * List available npm scripts, TS config strictness, and Nuxt modules.
   * Extract Rust toolchain (from `rust-toolchain.toml`) and crate features.
2. **Add a Command Catalog**

   * Generate a table of all `#[tauri::command]` with signatures and linked TS wrappers.
3. **Populate a Test Matrix**

   * OS × Node × Rust versions actually used in CI; note missing coverage.
4. **Threat Model Notes**

   * Identify new OS surface area introduced; document mitigations in this file.
5. **DX Gaps**

   * If a debug panel or IPC mocks are missing, propose and link sections to code.

Agent SHOULD submit a patch that adds these subsections under clearly marked headers and update the table of contents.

---

## 16) Quick Validation Commands (copy/paste)

```bash
# Type/lint/test (frontend)
npm run --prefix ./apps/desktop typecheck && npm run  --prefix ./apps/desktoplint && npm run --prefix ./apps/desktop test:unit

# Rust
cargo fmt -- --check && cargo clippy -- -D warnings && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml

# Build desktop app (current OS)
npm run --prefix ./apps/desktop build && npm run --prefix ./apps/desktop tauri build

# Vue Unit Tests
npm run --prefix ./apps/desktop test:unit
```

---

## 17) Known Pitfalls

* Tauri dev path vs dist path mismatch → ensure `tauri.conf.json > build > beforeDevCommand`/`devPath` are correct.
* CSP blocks inline scripts/styles → prefer hashed or move logic to JS.
* Windows path separators vs POSIX → normalize in Rust.
* Long‑running Rust tasks blocking UI → offload to threads or async with progress events.

---

## 18) Definition of Done (per feature)

* Functionally implemented across OSes targeted for the feature.
* IPC types validated end-to-end; security reviewed.
* Unit tests + e2e smoke covering happy path and one failure.
* Docs updated: this file (if relevant) and help/README.
* CI green; artifacts build for at least the current OS.

---

## Command Catalog

| Command | Rust signature | Frontend wrapper | Error cases / notes |
| --- | --- | --- | --- |
| `submit_addon_data` | `pub async fn submit_addon_data(app: tauri::AppHandle, file_path: &str) -> Result<String, String>` (`apps/desktop/src-tauri/src/thing_api.rs:14`) | `submitAddonData(filePath: string): Promise<string>` (`apps/desktop/src/composables/useThingApi.ts:1`) | Returns `Err` when the LUA file cannot be read, the WoWthing API replies non-200, or response text conversion fails; currently panics if the persisted store lacks an `api-key` entry. |

---

## Discovered Context

* Tauri config (`apps/desktop/src-tauri/tauri.conf.json`): allowlist section absent (defaults apply); plugins = `fs` (requireLiteralLeadingDot=false) and `updater` (GitHub endpoint, Windows passive install, bundled pubkey); updater artifacts set to `v1Compatible`; bundle targets = `all`; no autostart wiring in config.
* Nuxt config (`apps/desktop/nuxt.config.ts`): modules = `@nuxt/ui`; SSR disabled (`ssr: false`); no CSP defined in `app` head; no custom path aliases declared; Vite uses Tailwind plugin with strict HMR port 3001.
* Rust crate (`apps/desktop/src-tauri/Cargo.toml`): default feature `custom-protocol` mapped to `tauri/custom-protocol`; additional plugins via dependencies (store, persisted-scope, fs+watch, shell, process, dialog, os, notification, log, tray-icon feature, reqwest with json+socks); platform-gated deps include autostart, updater, single-instance; `rust-toolchain` file not present in repo root.
