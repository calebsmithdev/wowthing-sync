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
|  |  ├─ tests/               # Backend, Frontend, and E2E tests
│  │  └─ src/                 # Nuxt app source
└─ .github/workflows/         # CI build/test/release
```

If structure differs, **Agent must scan** `tauri.conf.json`, `package.json`, `nuxt.config.ts`, and `Cargo.toml` to auto‑discover paths and scripts.

---

## 3) How to Run Things

**Dev (hot‑reload web + Tauri)**

* `npm run dev` or `npm run --prefix ./apps/desktop dev` within `apps/desktop` should:

  1. launch Nuxt dev server
  2. run `tauri dev` with that URL as devPath

**Build (release)**

* `npm build && npm tauri build` → creates platform installers in `src-tauri/target/release/`.

**Tests**

* Frontend unit: `npm run --prefix ./apps/desktop test:unit`
* Rust: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
* E2E: `npm run --prefix ./apps/desktop test:e2e` (expects Playwright + built app)

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

## 16) Quick Validation Commands

Use the reproducible validation catalog below. The desktop npm directory is `apps/desktop`; Cargo is a root workspace. Use `npm run --prefix apps/desktop <script>` and Cargo `--locked`. Generate frontend assets before native checks/builds.

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

## 19) Commands to run after tasks

* `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` When updating any Rust code to verify the build runs without compile errors.

## Current repository context and command catalog (2026-10-06)

The desktop app is `apps/desktop`; Cargo is a root workspace with `Cargo.lock` and `target/` at the root. Native frontend assets are read directly from `apps/desktop/.output/public`; CI never depends on an untracked local `dist` symlink. Run all Cargo commands from the repo root with `--locked`. Cargo package version in `apps/desktop/src-tauri/Cargo.toml` is the only release version source; Tauri config intentionally omits `version`. `scripts/release-metadata.mjs` verifies input/tag/lock/build/updater consistency before creating any draft.

Node CI is pinned to **22.22.3**, Rust to **1.97.1** (`rust-toolchain.toml`, rustfmt/clippy). The dependency minimum is Rust 1.90; only the pinned toolchain is tested. Nuxt4/Vue3/NuxtUI4, TypeScript **strict:true**, `@nuxt/eslint`, Vitest and Playwright are configured. Nuxt modules are `@nuxt/ui` and `@nuxt/eslint`. Frontend assets must be generated before standalone Cargo checks.

| Native command | Arguments / result | Typed frontend entry |
| --- | --- | --- |
| `get_sync_status` | `SyncStatus` snapshot, including per-file `uploads` times | `useSync.ts:getSyncStatus` |
| `sync_now` | enqueue manual sync; `Result<(), String>` | `useSync.ts:syncNow` (queued, not completed) |
| `submit_addon_data` | `file_path:String`; validated enqueue, `Result<String,String>` | `useThingApi.ts:submitAddonData` (legacy, returns **Upload queued**) |
| `get_api_key_status` | `ApiKeyStatus` (presence/error only) | native presence diagnostic; UI `useApiKeys.ts` observes sync status |
| `save_api_key` | `key:String`; `ApiKeyStatus` | `useSettings.ts:saveKey` |
| `get_settings` | `SettingsSnapshot` | `useSettings.ts:hydrate` |
| `save_sync_folder` | `folder:String`; validated atomic persistence + worker configuration | `useSettings.ts:saveFolder` |
| `set_autostart` | `enabled:bool`; OS verify + persistence/rollback | `useSettings.ts:setAutostart` |
| `set_notifications` | `enabled:bool`; preference only. The worker sends one summary notification per batch, once the queue drains after a scan | `useSettings.ts:setNotifications` |
| `default_wow_folder` | default folder suggestion; `Result<String,String>` | `useSettings.ts:defaultFolder` |

All native commands are registered in `src-tauri/src/lib.rs`. Settings and credential commands are in `settings.rs` and `credentials.rs`; the app-lifetime polling/queue service is `sync_service.rs`. Commands return actionable errors; bridge initialization failures render in the app. Retry Loading Settings retries a transient IPC hydration failure; unreadable/invalid startup preference files must be repaired followed by an app restart (the valid in-memory store is never overwritten by external edits). Shared plugins hydrate settings, subscribe before sync snapshots and own updater cleanup for the app lifetime. Do not return API keys to frontend state or log them.

UI conventions: the main window is resizable (520×640 default, 440×520 minimum) and follows the OS light/dark appearance. The amber primary uses shade 700 in light mode for contrast (`palette.css`). The design is deliberately flat: hairline-separated rows instead of cards; the header keeps the WoWthing logo and app name beside the tabs. The Status page's headline is the time since the last sync. Accounts are listed with their own last-upload time (`SyncStatus.uploads`, persisted as `account-uploads`) or an inline failure with Retry. `SyncStatusBanner` shows only app-wide problems, plus a summary of account failures on pages other than Status. Settings uses grouped rows, and results render beside the setting that produced them (`useSettings().scope`). Choosing a folder in the OS dialog is the explicit approval and saves immediately. The tray menu shows a live status line from `sync-status` events, plus **Sync Now**. Native smoke/integration scripts (`tests/e2e/native-*.js`) drive the UI by visible text and `#folder-message`; update them when you rename controls.

### Reproducible validation

```bash
npm ci --prefix apps/desktop
npm run --prefix apps/desktop lint
npm run --prefix apps/desktop typecheck
npm run --prefix apps/desktop test:unit
npm run --prefix apps/desktop generate
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
cargo check --locked
node --test scripts/*.test.mjs
node scripts/release-metadata.mjs verify
cd apps/desktop
npx playwright install chromium
npm run test:e2e
npm run test:native
npm run test:native:dev # isolated native fixture, fresh dev CSP nonce, port3015
npm run tauri -- build --debug --no-bundle -- --locked
# macOS bundle without distribution credentials:
npm run tauri -- build --debug --bundles app --no-sign --config '{"bundle":{"createUpdaterArtifacts":false}}' -- --locked
```

`npm run tauri:dev` uses `scripts/tauri-dev.mjs`: fresh per-launch script/style nonce, loopback-only Nuxt dev server, port3015 by default, port+1 HMR. Occupied ports are refused before starting; set `TAURI_DEV_PORT` to another unused port. Use this wrapper for desktop development so dev CSP and Vite/Nuxt nonces agree. Do not use `await using`; explicit updater `try/finally` close is necessary for older system webviews. Keep the disposable polyfill and ES2022 build target.

### Test matrix and limits

| Platform | Configured CI | Locally executed here |
| --- | --- | --- |
| macOS ARM64 (`macos-15`) | lint/type/unit/Rust checks, browser smoke, native WKWebView smoke, production debug binary | All checks, production/development native smoke, macOS app bundle |
| macOS Intel (`macos-15-intel`) | Same matrix checks | Not executed locally |
| Windows x64 (`windows-2022`) | Same, native WebView2 smoke | Not executed locally |
| Linux x64 (`ubuntu-24.04`) | Same, native WebKitGTK under Xvfb; GTK/WebKit/dbus development libraries | Not executed locally |

Browser `test:e2e` serves generated assets with strict CSP and an adapter injected **only by `scripts/smoke-server.mjs`**. It checks explicit drafts/save failures, folder/save, update state, navigation-visible failures and manual sync. It proves UI behavior, not native OS integration. `test:native` builds with **smoke-test** feature, replacing the entire native builder before any real preferences/credentials/sync/updater/autostart/notification setup. It exercises the real platform webview, generated assets, production CSP, real native fixture IPC, routing, saves/update/manual events and checks JS/CSP failures. The fixture accepts only a synthetic key, cannot upload, and is absent from production builds. Native automation uses an initialization script and completion command; macOS does **not** claim unsupported tauri-driver coverage. The smoke does not prove real credential prompts, OS autostart/notifications, tray menus or signed updater installation; those require platform/manual testing with explicit fixtures. Never launch the normal native app as a test, since that accesses the user's real data.

Rust tests use temp directories and fake credential/OS adapters; production-worker integration additionally uses real reqwest against a loopback HTTP server. No test contacts wowthing.org. They cover missing/empty/replaced/mixed-invalid collectors, path traversal/symlink/FIFO/size defenses, coalescing, retry classification/backoff, partial results/post-upload failures, config/shutdown cancellation, migration, atomic settings and rollback. Frontend unit tests cover listener/snapshot ordering, component buttons and updater cleanup/races. Browser traces/screenshots are ignored local QA artifacts; screenshots for this run are stored in `/tmp`. Release builds gate signed artifacts on all checks and both smoke layers; local development requires no signing credentials.

### Baseline validation record before expanded CI (2026-10-06)

On macOS ARM64 with Node22.22.3/Rust1.97.1: clean `npm ci`, lint, strict typecheck, **25 Vitest tests**, generate, cargo fmt/clippy(all-targets)/**29 Rust tests**/check(default and smoke feature), **4 Node script tests**, one Chromium UI smoke and real WKWebView production/development smoke all passed. Native smoke reported `errors:[]`, one synthetic key save and manual sync event. Final debug unsigned `.app` was built with updater artifact generation disabled only by local CLI override at `target/debug/bundle/macos/Wowthing Sync.app`; bundle version verified1.0.7. Browser screenshots: `/tmp/wowthing-settings-reviewed.png`, `/tmp/wowthing-dashboard-reviewed.png`. Windows/Linux/Intel macOS CI is configured but has not run in this local session. Real credential-store prompts and signed update installation were deliberately not exercised.

### Security and permissions

Native plugins: shell, process, dialog, OS, notification, log, desktop autostart/updater/single-instance. Frontend capabilities are core defaults, dialog open, process restart, updater defaults, OS defaults, log defaults, narrowly configured shell open and notification permission query. There are **no frontend FS/store/autostart/notification mutation grants**. Shell open accepts only the fixed GitHub releases/latest URL via the plugin regex; normal WoWthing footer links use webview anchors.

All collector operations use a canonical held `cap-std` directory capability under the selected WoW root, only `WTF/Account/<account>/SavedVariables/WoWthing_Collector.lua`, regular nonempty files <=32MiB and <=1000 account entries. Relative capability opens confine symlink races; Unix nonblocking opens reject FIFOs without hanging. Scan errors for individual accounts stay visible and do not prevent healthy account uploads. Native filesystem events wake capability-based scans, with 30-second metadata reconciliation and five-minute content reverification. Watcher setup/runtime failures fall back to one-second polling and 30-second content reverification. Event bursts coalesce into one pending wake; access events and unrelated addon files are ignored. A sequential debounced queue retains writes observed after an upload and drains ready files without a fixed inter-upload delay. HTTP client has explicit 10s connect/30s request timeout, <=3 temporary-failure attempts; long Retry-After stops retries. Config generations cancel stale uploads and suppress stale results; shutdown cancellation is bounded.

API keys use explicit `keyring` native Apple/Windows/Linux secret-service backends, cached in Rust memory. Legacy `.settings.dat` plaintext keys are removed only after secure write/readback verification; locked/unavailable backend errors retain the legacy entry and permit Retry Sync, with no plaintext upload fallback. Preferences migrate existing JSON and commit through synced atomic replacement. Local and PR fixtures never read user data or contact an OS credential store; explicitly opted-in nightly/release hosted probes use unique synthetic entries with cleanup. Linux requires Secret Service plus dbus at runtime; failures are actionable.

Production CSP has self/hashed bundled scripts, external CSS, local SVG icons, IPC-only connections and no unsafe-eval/unsafe-inline. Tauri injects hashes/nonces for generated static scripts. Nuxt UI's runtime palette plugin is replaced by static `palette.css` (keep aligned with `app.config.ts`); icons bundle locally in SVG mode. Development uses a fresh nonce via the dev wrapper and Nitro render hook. Future UI changes must rerun native smoke to catch runtime CSS/script injection.

Autostart reflects actual OS state, verifies changes before saving, and attempts OS rollback on persistence failure. Desktop notification APIs do not expose actual delivery consent truthfully: UI reports unknown and points to OS settings; background failures never prompt. Update controller is shared for background/manual/tray events, serializes checks/installs, closes resources before relaunch and suppresses late teardown callbacks. `__debug` remains a development diagnostic page; there is no general-purpose FS/secret diagnostic endpoint.

### CI improvement 1: production worker integration

`cargo test --locked real_worker` starts the actual SyncService thread with a WorkerIo OS boundary, temp collector capabilities, production HTTP request/retry code against a loopback server and atomic Preferences. It covers new/replaced files, rapid writes, writes during upload, mixed-invalid accounts, configuration/shutdown cancellation, HTTP retries/timeouts and persistence after restart. `cargo test --locked real_worker_long_run -- --ignored` runs 30 sequential changes for the nightly tier. These tests require localhost bind permission but never access a real credential store or external upload endpoint.

### CI improvement 2: unsigned packages and upgrade fixture

`npm run --prefix apps/desktop test:packages` builds unsigned debug macOS `.app`, Windows NSIS installer or Linux deb/RPM/AppImage packages. `test:packages:release` uses release mode for nightly checks. Production and instrumented packages are staged separately after clean bundle rebuilds; marker/architecture audits and extracted-versus-built executable SHA256 equality prevent instrumented binary substitution. Distribution builds explicitly reject either harness feature; marker inspection also works independently of that build flag. Production packages are inspected without launching their real settings/credentials. Only the distinct `com.calebsmithdev.wowthing-ci-isolated` package is launched, against a loopback endpoint and temporary prior-version synthetic JSON; the actual credential migration, atomic preferences and production worker execute. The harness is compiled out of shipping artifacts. Windows installation requires a disposable GitHub-hosted runner. macOS version, PE version, deb/RPM metadata and linked dependencies are checked; AppImage identity is tied to the just-built executable hash and harness runtime version. Locally validated unsigned ARM64 `.app` extraction/launch/upgrade with no JS/CSP errors. Other package formats remain CI-only until those matrix runs execute.

### CI improvement 3: expanded native UI paths

`npm run --prefix apps/desktop test:integration` retains the fast `test:native` and browser fixtures, and adds real-webview UI paths with production settings commands and the actual worker. It checks a transient hydration retry, explicit failed API save with draft retention and retry, invalid/valid folder saves, navigation while HTTP is active, actual close/hide/reopen plus the shared production tray dispatcher, and updater failure/success with real Tauri ResourceTable cleanup before synthetic relaunch. Final native and HTTP reports require every path, including newly written collector bytes reaching the loopback server. No real updater install or OS state change is claimed here; those belong to release/OS tiers. The current official cross-platform embedded WebDriver approach (`@wdio/tauri-service`) was evaluated; this smaller in-process compile-time harness preserves all platform webviews without exposing an automation server in production. ARM64 WKWebView run passed with resourcesClosed/windowLifecycle/updater=true and errors=[].

### CI improvement 4: disposable OS adapter probes

`scripts/os-integration.mjs` and the dedicated `wowthing-os-test` binary refuse local/self-hosted execution: `WOWTHING_OS_TESTS=1`, `GITHUB_ACTIONS=true`, and `RUNNER_ENVIRONMENT=github-hosted` must all hold. A random, scoped app/service/account identity exercises production keyring write/read/update/delete plus verified cleanup, and the actual Tauri autostart plugin register/query/remove. Cleanup repeats in a separate bounded process after failure, scoped to that identity. Linux nightly starts an ephemeral DBus Secret Service; a separate invalid DBus-address probe must observe an unavailable backend (absence never silently passes). Windows tests explicitly reject file/directory reparse escapes and exercise Unicode/spaces collector paths; symlink privilege failure is reported as missing coverage. These real OS probes are compiled and reviewed locally, but intentionally never launched against this user's credential store or login settings. Notification delivery/consent and minimum consumer OS versions remain release manual checks, not automated success claims.

### CI improvement 5: diagnostics and process supervision

Every supervised command can persist JSON status plus bounded stdout/stderr. Native smoke/integration require exactly one valid completion report and record explicit failure reasons when missing, malformed or timed out. `scripts/process-runner.mjs` creates an owned POSIX process group or uses bounded Windows `taskkill /T /F`, checks cleanup failures, and awaits process closure; a deadline always fails even if a handler exits successfully. Fixture removal is withheld if process closure cannot be confirmed. An executable test verifies descendant termination and missing-command reports. CI preserves native reports, frontend JUnit output/browser traces/screenshots where available, package inventories and OS/architecture/runner/toolchain/WebView metadata with `always()` uploads. Crash collection filters only our executable names and current-run timestamps; no environment/secret dumps are collected. Windows WebView registry metadata uses Microsoft's documented runtime client identifier; no minimum OS claim follows from runner metadata.

### CI improvement 6: common checks and required gate

PRs, nightly and release call `.github/workflows/desktop-checks.yml`; `.github/actions/setup-desktop` pins Node/Rust setup and shares native prerequisites. Frontend lint/type/unit/static formatting run once; OS-sensitive Rust domain/real-worker tests, both native UI layers, browser behavior and unsigned packages run on all four real hosted runners. Frontend assets are passed as an artifact before standalone Cargo checks. Main CI has no workflow-level path exclusions and also handles merge queues. `Required Desktop CI` runs with `always()` and rejects failure/cancelled/skipped/missing required results, including failed matrix jobs via the common aggregate. YAML structure/DAG checks and actionlint complement executable gate negative tests. Official first-party action commits were verified before pinning; hosted runners support their Node24 action runtime while app tooling remains Node22.22.3.

Repository administrators must enable the exact required status **Required Desktop CI** in main's branch rule/ruleset (require successful checks and, if desired, up-to-date branches/merge queue). YAML cannot configure this repository setting; no admin rule was changed here. Release signed build/staging waits for the same common checks; only the draft job has contents:write. Secret-free checks never inherit release secrets.

### Expanded CI tiers and isolation (2026-10-06)

See [docs/ci-validation.md](docs/ci-validation.md) for the required check,
production/harness artifact guarantee, tier matrix, signing secret names and
consumer-OS manual release checklist. Nightly/release use optimized packages,
real worker endurance, disposable actual OS adapters, dependency audits and
actual signed test-key updater installation/relaunch. Local real OS stores are
never probed. The standalone `signature-audit` feature builds only a read-only
Minisign verifier; it is rejected in distribution builds. Native integration
may enable its actual updater adapter only inside the compiled isolated builder.

### Expanded local validation record (2026-10-06)

macOS ARM64: lint/typecheck/25 Vitest tests, Chromium smoke, fast native smoke,
32 Rust tests plus the separately executed real-worker endurance test, default
and integration clippy, signature-audit check, 13 script contracts and actionlint
passed. Optimized production `.app` inspection/extraction/hash/version checks
passed without launch; the separately identified optimized worker/UI package
launched and migrated synthetic preferences. Actual signed updater installation
passed in debug and optimized mode: typed invalid-signature rejection, exact
installed candidate hash and runtime package version 1.0.8 after relaunch.
The standalone verifier accepts valid signatures and rejects modified bytes and
wrong signed versions. Local OS probe entry points refused before OS changes.

Current end-to-end dependency audit reports show 13 npm advisories in both
all/production dependency sets (4 critical, 8 high, 1 low); RustSec reports no
vulnerabilities. The audit script exits 1 and retains JSON, so nightly/release
validation currently fails on those existing npm findings. They were not waived
or automatically downgraded. Windows/Linux/Intel execution, actual OS store
probes and real distribution signing still require hosted/manual evidence.

### Background performance (2026-10-07)

The native `notify` watcher observes the selected `WTF/Account` tree only as a
change hint; event paths never authorize reads. Recursive symlink following is
disabled where the backend supports it. Discovery, file limits and uploads still
use the held `ApprovedRoot` capability. Periodic reconciliation covers missed
events/new directories; same-metadata changes missed by events are detected by
the five-minute content verification. Failed watchers keep the polling fallback
until the folder is configured again. No new frontend filesystem permissions.

Successful uploads persist `last-success` and `account-uploads` in one synced
atomic transaction, including in the isolated integration builder. The Status
page's ten-second relative-time clock pauses while hidden/minimized and refreshes
immediately on return. A native `window-visibility` boolean event complements
document visibility, with initial visibility queried through existing core
permissions. Automatic updater checks run at startup and six hours after the
previous check completes; manual/tray checks remain immediate.

Validated locally on macOS ARM64: lint/typecheck, 37 frontend tests, 40 Rust
tests (nightly endurance excluded), default/integration clippy, Cargo check,
Chromium smoke, native smoke and native integration including display-timer
stop/resume on hide/reopen, 25 script tests (platform RPM test skipped), release
metadata verification and the production debug build. Windows/Linux watcher
and visibility behavior still require the hosted CI matrix.
