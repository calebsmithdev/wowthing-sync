# Dependency review — 2026-11-14

Base: `origin/main` at `8d02692`. Branch: `chore/deps-2026-11-14`.
The worktree was clean before starting. Fetch succeeded; switching to main was
refused because another worktree holds it, so this branch starts directly from
fetched origin/main. The other checkout was not changed.

Node **22.22.3** and Rust **1.97.1** pins are unchanged. The crate minimum becomes
**1.91** because locked notify-types 2.3.0 requires it; only the pinned toolchain
was tested. App version remains **1.1.3**. No production app or real credential
store was accessed. Upstream notes below are facts from linked sources; repo
impact and suggestions are our inferences from inspected code.

## Direct dependency changes

| Ecosystem | Dependency | Before → after |
| --- | --- | --- |
| npm | `@tailwindcss/vite` | 4.3.3 → 4.3.5 |
| npm | `@tauri-apps/plugin-opener` | 2.7.2 → 2.7.3 |
| npm | `nuxt` | 4.6.3 → 4.6.4 |
| npm | `postcss` | 8.5.32 → 8.5.33 |
| npm | `tailwindcss` | 4.3.3 → 4.3.5 |
| npm | `vue` | 3.5.44 → 3.5.45 |
| npm | `vue-router` | 5.4.0 → 5.5.1 |
| npm | `@iconify-json/lucide` | 1.2.149 → 1.2.154 |
| npm | `@playwright/test` | 1.64.1 → 1.65.1 |
| npm | `@vitejs/plugin-vue` | 6.0.10 → 6.0.11 |
| npm | `eslint` | 10.14.0 → 10.15.0 |
| npm | `jsdom` | 30.1.3 → 31.0.1 |
| npm | `vitest` | 5.0.5 → 5.1.0 |
| Cargo | `tauri-plugin-opener` | 2.7.2 → 2.7.3 |
| Cargo | `tauri-plugin-notification` | 2.8.0 → 2.8.1 |
| Cargo | `tauri-plugin-log` | 2.10.1 → 2.10.2 |
| Cargo | `notify` | 8.2.1 → 8.2.2 |

## Breaking changes

- **TypeScript 7.0.2 (considered, held at 6.0.3):** 7 replaces the compiler with a native implementation and does not expose the compiler API. Microsoft explicitly recommends Vue/Volar and compiler-API tools stay on 6.0. This affects Nuxt’s `typecheck` script (`apps/desktop/package.json:15`) and `vue-tsc`; hold at 6.0.3 based on the previous recorded failed trial and unchanged upstream compatibility requirements. [7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), [7.0.2 release](https://github.com/microsoft/TypeScript/releases/tag/v7.0.2).
- **jsdom 30.1.3 → 31.0.1:** 31 switches optional canvas support from `canvas` to `@napi-rs/canvas` >=1.0.13; introduces an integrated CSS engine, changing computed values/serialization; blocking resources can cause JSDOM constructors to return partially parsed documents (await DOMContentLoaded/load where applicable). The unit environment is jsdom (`apps/desktop/vitest.config.ts:16`); no canvas dependency or explicit resource-loading JSDOM construction was found in the desktop tests, so passing unit tests are the relevant compatibility evidence. 31.0.1 fixes invalid/out-of-range tabIndex parsing and improves style/focus/detached-tree performance. [31.0.0](https://github.com/jsdom/jsdom/releases/tag/v31.0.0), [31.0.1](https://github.com/jsdom/jsdom/releases/tag/v31.0.1).
- **Vue Router 5.4.0 → 5.5.1:** experimental matcher misses now return null; MatchMiss no longer extends Error. Repo uses Nuxt pages (`apps/desktop/src/app.vue:4`) and ordinary `useRoute` (`apps/desktop/src/components/SyncStatusBanner.vue:29`); no `vue-router/experimental` imports/custom matchers found, so no code migration. Stable behavior also changes scroll restoration storage to sessionStorage with in-memory fallback. [CHANGELOG](https://github.com/vuejs/router/blob/main/packages/router/CHANGELOG.md).
- **notify 8.2.1 → 8.2.2:** minimum Rust rises 1.85→1.88; transitive **notify-types 2.2.0→2.3.0** raises it again to 1.91. Pinned Rust 1.97.1 suffices; crate `rust-version` should accurately become 1.91 (not a toolchain pin change). Watcher at `apps/desktop/src-tauri/src/sync_service.rs:294` uses the compatible stable API. [notify release](https://github.com/notify-rs/notify/releases/tag/notify-8.2.2), [notify-types release](https://github.com/notify-rs/notify/releases/tag/types-2.3.0).
- **Playwright 1.64.1 → 1.65.1:** runner respects TypeScript useDefineForClassFields; actions wait until elements are not inert; runs with no matching tests across all shards now fail. Existing smoke is function-based (`apps/desktop/tests/e2e/smoke.spec.ts:6`), with no constructor-parameter field initializers or inert controls found, so no source change indicated. 1.65.1 fixes decorated static fields under useDefineForClassFields:false. [1.65](https://github.com/microsoft/playwright/releases/tag/v1.65.0), [1.65.1](https://github.com/microsoft/playwright/releases/tag/v1.65.1).
- **rustls-pki-types 1.15.1 → 1.16.0:** rejects DNS final labels that are hex numbers and strips trailing dots from DnsName/ServerName. Fixed upload hostname `wowthing.org` (`apps/desktop/src-tauri/src/commands/submit_addon_data.rs:4`) is unaffected. [release](https://github.com/rustls/pki-types/releases/tag/v/1.16.0).

## Recommended changes

- **Nuxt 4.6.3 → 4.6.4 is a security update:** eight Nuxt advisories plus three Nitro advisories via nitropack 2.13.6. Keep the upgrade. Production SSR errors now omit arbitrary message/data; webpack/rspack enforce allowedHosts; workspaceDir detection narrows; Nitro cached routes cache GET/HEAD only and exclude private/cookie responses; route rules match encoded slashes and constrain wildcard redirects/proxies. Desktop is generated SPA (`apps/desktop/nuxt.config.ts:8`), dev server uses Vite; no custom SSR error/route-rule migration indicated. Recheck any future hosted SSR use separately. [release](https://github.com/nuxt/nuxt/releases/tag/v4.6.4).
- **ESLint 10.14.0 → 10.15.0** raises minimatch minimum to 11.0.1 for CVE-2026-118764; also fixes TypeScript-aware autofixes/rules. Keep lock refreshed and run lint; no new config required. [release](https://github.com/eslint/eslint/releases/tag/v10.15.0).
- **webpki-root-certs 1.0.11 → 1.0.12** tracks Mozilla trust removals: Buypass Class 2/3, DigiCert Trusted Root G4, QuoVadis Root CA 1/3 G3, Certigna Root CA. The real remote upload certificate chain is not tested by local loopback fixtures; do not claim verified real-endpoint trust. No trust override is recommended. [release](https://github.com/rustls/webpki-roots/releases/tag/v/1.0.12).
- Retain current strict CSP/static palette handling (`apps/desktop/nuxt.config.ts:9`), because framework upgrades do not remove this repo’s runtime style restrictions. Validate generated assets and isolated webview smoke where applicable.

## Improvements / opportunities

| Package(s) | Upstream change | Concrete repository implication | Source |
| --- | --- | --- | --- |
| Vue 3.5.44→3.5.45 | Compiler boolean-binding/lexical-scope fixes, stopped-scope cleanup, async component/Suspense/KeepAlive lifecycle and HMR fixes | Keep regular Vue composition patterns; this benefits async page cleanup under `NuxtPage` (`src/app.vue:4`), no migration required | [CHANGELOG](https://github.com/vuejs/core/blob/main/CHANGELOG.md) |
| Tailwind CSS and @tailwindcss/vite 4.3.3→4.3.5 | Symlink source detection, ignored-directory watch performance, group/peer invalidation speed, Safari @property fallback correction, color-mix/parser/typing fixes | CSS generation/plugin at `nuxt.config.ts:1` benefits directly; no Next/Turbopack adoption needed | [4.3.4](https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.3.4), [4.3.5](https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.3.5) |
| PostCSS 8.5.32→8.5.33 | Corrects unquoted URL parsing, source-map comment line breaks and important types | Build-time CSS fixes under `nuxt.config.ts:68`; no config required | [release](https://github.com/postcss/postcss/releases/tag/8.5.33) |
| @vitejs/plugin-vue 6.0.10→6.0.11 | Reloads reverted script edits after template edits; removes vapor multi-root marker | Unit Vue compiler plugin (`vitest.config.ts:7`) compatible; improves future hot reload workflow | [CHANGELOG](https://github.com/vitejs/vite-plugin-vue/blob/plugin-vue@6.0.11/packages/plugin-vue/CHANGELOG.md) |
| Vitest 5.0.5→5.1.0 | --last-failed / --since-last-run, node timers fakes, mock cycle/teardown fixes | Use --last-failed for local diagnosis; retain full run in required validation (`vitest.config.ts:15`) | [release](https://github.com/vitest-dev/vitest/releases/tag/v5.1.0) |
| @iconify-json/lucide 1.2.149→1.2.154 | Generated icon collection refresh; latest inspected data commit adds six icons (2046→2052) and revises question-mark artwork; upstream publishes data-update commits rather than package-specific release notes | Explicit local SVG list (`nuxt.config.ts:18`) limits shipped assets; verify generation still resolves all selected icons. Exact per-version artwork delta not documented upstream | [collection history](https://github.com/iconify/icon-sets/commits/master/json/lucide.json), [latest inspected commit](https://github.com/iconify/icon-sets/commit/d0290276f8f74436ebcfa5f8ff38a8dcc91a0ef5) |
| Rust + npm opener 2.7.2→2.7.3 | Automatic link opening honors base target=_blank | Existing explicit openUrl calls (`src/pages/settings.vue:150`, `src/components/UpdateBanner.vue:54`) need no change; no base target configured | [CHANGELOG](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/opener/CHANGELOG.md) |
| tauri-plugin-notification 2.8.0→2.8.1 | Android13 permission requests resolve when already granted | Desktop notification implementation (`src-tauri/src/sync_service.rs:147`) unaffected | [CHANGELOG](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/notification/CHANGELOG.md) |
| tauri-plugin-log 2.10.1→2.10.2 | KeepSome same-second rotations now use unique names and count legacy .log.bak files against retention cap | Repo uses KeepOne (`src-tauri/src/setup/logs.rs:21`), so fixed bug not exercised; KeepSome is now safer if multi-file retention is later wanted | [release](https://github.com/tauri-apps/plugins-workspace/releases/tag/log-v2.10.2) |
| notify 8.2.2 / notify-types 2.3.0 | Prevent Windows watch shutdown rearming reused closed handles/deadlock; per-watch user_data attributes | Improves configuring/replacing watcher (`sync_service.rs:276`); user_data unnecessary for current single watch | [notify](https://github.com/notify-rs/notify/releases/tag/notify-8.2.2), [types](https://github.com/notify-rs/notify/releases/tag/types-2.3.0) |
| Wry 0.57.1→0.57.2 | macOS nil-URL panic fixed, unavailable NSOpenPanel cancels upload; Windows long-path drops/focus fixes; Linux multipart short-read fix; Android crash/leak fixes; dom_query0.29 | Native shell gains robustness without app API changes. Validate WKWebView via isolated harness; Windows/Linux await CI. No app file-input upload feature to change | [CHANGELOG](https://github.com/tauri-apps/wry/blob/dev/CHANGELOG.md) |
| zip 9.1.3→9.5.1 | Parallel/streaming extraction APIs, root-dir extraction filter, metadata/copy fixes, extraction allocation reductions | Transitive updater extraction benefits; no direct app ZIP calls. Avoid implementing app-specific extraction just to adopt new API | [CHANGELOG](https://github.com/zip-rs/zip2/blob/master/CHANGELOG.md) |
| notify-rust 4.18.2→4.19.0 | macOS replies; zbus6 | Transitive notification stack (`sync_service.rs:147`); Linux compile/runtime CI important, no direct backend config | [release](https://github.com/hoodie/notify-rust/releases/tag/v4.19.0) |
| rustls-webpki 0.103.16→0.103.17 | Adds issuer SPKI and SCT timestamp introspection | Production reqwest client (`commands/submit_addon_data.rs:13`) needs no manual certificate code | [release](https://github.com/rustls/webpki/releases/tag/v/0.103.17) |
| rustls-pki-types 1.16.0 | Faster DNS validation; into_owned avoids copies | Automatically benefits transport; no app-level use needed | [release](https://github.com/rustls/pki-types/releases/tag/v/1.16.0) |

All repository paths in the table are relative to `apps/desktop/`.

Research limits: exact Lucide package-version artwork delta is not documented by package release notes; data commit history was inspected. Remaining ordinary lock-only transitive crates were inventoried by parent, but this research pass does not assert their individual release notes were read. Unchanged Tauri core/tao/reqwest/keyring/cap-std/Nuxt UI have no old-to-new range in this update.

## Held back and follow-ups

- **TypeScript 7.0.2:** retain 6.0.3. The [previous maintenance trial](https://github.com/calebsmithdev/wowthing-sync/blob/8d02692/docs/dependency-review.md#held-back) recorded
  `ERR_PACKAGE_PATH_NOT_EXPORTED` in vue-tsc and a typescript-estree crash; current
  Microsoft guidance still says Vue/Volar and compiler-API tooling need TS 6.
  This run restored TS 6 before successful installation/validation; it does not
  claim a new completed TS 7 test run.
- **keyring 4.2.0:** retain exact 3.6.3. The latest major is unchanged since the
  previous review. Cached 4.2.0 `src/v1.rs:107` still memoizes store initialization
  in `LazyLock<Result<()>>`, conflicting with retry-after-unlock guidance in
  `apps/desktop/src-tauri/src/credentials.rs:29` and fresh Entry creation at line 40.
  A separate keyring-core/backend migration with isolated recovery tests is needed;
  no real-store migration was attempted.
- **@types/node 26.6.6:** keep 22.20.5 to match the Node 22 pin.
- Prerelease notify 9 and Tauri 3 are excluded. crates.io stable-version queries
  covered every direct Cargo dependency; keyring is the only newer stable major.
  Installed cargo-outdated failed internally with Cargo 1.83 / edition2024, so the
  crates.io API was used instead. Final npm outdated lists only the two holds above.

## Validation results

macOS ARM64, Node 22.22.3 / Rust 1.97.1. Logs for this run are in
`/tmp/wowthing-maintenance-2026-11-14/` (local artifacts, not portable PR links).

| Check | Result |
| --- | --- |
| npm lint | PASS |
| npm typecheck | PASS |
| npm test:unit | PASS: 65 tests, 13 files (jsdom 31) |
| npm generate | PASS: generated static SPA |
| cargo fmt --all -- --check | PASS |
| cargo clippy --locked --all-targets -- -D warnings | PASS |
| cargo test --locked | PASS: 77 passed, 1 intentionally ignored |
| cargo check --locked | PASS |
| node --test scripts/*.test.mjs | PASS: 31 passed, 3 skipped |
| node scripts/release-metadata.mjs verify | PASS: 1.1.3 |
| Standard npm test:e2e | BLOCKED: matching Chromium 159 download failed, missing executable |
| Browser smoke with installed Chromium 158 | PASS: all 4 unchanged tests via external temporary config |
| Isolated native smoke | FAIL: 45-second timeout, blank native window; cause unresolved |

The browser fallback changes only launchOptions.executablePath in an untracked
external config, retaining the repo's tests, strict-CSP smoke server and synthetic
adapter. It is **not** evidence for the matching Chromium 159 build. Light/dark
first launch, minimum window, update error, settings, dashboard and About error
screenshots were captured under the local browser-artifacts directory. No new UI
or production/native credential, autostart, notification or updater-install claim
is made. Windows, Linux and Intel macOS await CI.

Native smoke built the isolated smoke-test executable, but repeated permitted runs
also timed out. A blank dark window appeared with no dialog and no fixture
completion/JS report. The main thread sample was idle in the AppKit event loop;
no Rust deadlock was apparent, but startup failure remains unlocalized. This has
not been established as a dependency regression or a host-only failure. Screenshot
`native.png` and `native-sample.txt` are in the local evidence directory. Supervision
confirmed processClosed/treeClosed and no remaining test-owned processes. The PR
is a draft pending this native failure and matching-browser validation.

Failure output and recovery:

```text
native-smoke exceeded 45000ms deadline
  Native process report: timedOut=true, processClosed=true, treeClosed=true.
npm install: ETIMEDOUT / syscall read / errno -60
  Retry with cached downloads and longer fetch timeout succeeded.
Chromium download: Failed to install browsers / Download failure, code=1
npm test:e2e: browserType.launch: Executable doesn't exist
  Chromium 158 fallback: 4 passed (12.1s).
```

Initial script tests before npm installation failed on missing yaml / CLI and
sandbox process restrictions; the final installed, permitted run passed. An early
Cargo check before generated assets existed failed at frontendDist; check and
Clippy after generation passed. These are setup failures, not hidden passing runs.

## Audit and verified repository scan

- **cargo-audit 0.22.2:** 0 vulnerabilities; 8 warning instances (7 unmaintained,
  1 unsound). Database commit `4ef2df8e806a65e2f1ecc14f56f51249062b23d6`.
  Embedded database fetch failed; Git CLI clone plus `--db ... --no-fetch` succeeded.
  Existing warnings are proc-macro-error, zbus_names/zvariant/zvariant_derive
  (multiple versions) and glib VariantStrIter unsoundness. These come through the
  Linux/Tauri/keyring stack; no app use of VariantStrIter was found. Warnings are
  retained visibly; zero vulnerabilities does not mean zero advisories.
- **npm audit (all):** 25 package findings, **18 moderate / 7 low / 0 high / 0 critical**.
  Baseline: 30 (27 moderate / 3 low). Production-only graph: 11 (4 moderate / 7 low).
  Counts include inherited dependency chains and can shift when upstream data changes.
  Remaining advisory roots: deepmerge prototype poisoning, minimatch globparts DoS,
  glob cancellation bypass and esbuild Windows dev-server file reads. The generated
  desktop SPA has no Node server; no verified app call path accepting attacker input
  into these APIs was found. npm audit fix applied compatible lock updates but did
  not clear the findings. Forced fixes propose framework/test-tool downgrades and
  were not applied. See [deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4),
  [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249),
  [glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4),
  [esbuild](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr).
- Independent read-only scan covered Rust IPC validation, collector capabilities and
  path handling, credentials/settings, worker cancellation and queues, frontend
  controllers, scripts/process supervision, release signing, workflows, capabilities
  and CSP. No new verified code issue found. Existing issues
  [#75](https://github.com/calebsmithdev/wowthing-sync/issues/75),
  [#76](https://github.com/calebsmithdev/wowthing-sync/issues/76) and
  [#77](https://github.com/calebsmithdev/wowthing-sync/issues/77) already cover the
  Linux packaging/autostart/updater and marketing release-deploy concerns.
  Open and closed issues were checked; **no new issues** were created.
- Independent dependency review found no actionable issue: manifests/locks, engines,
  source registries, pins, unchanged capability/CSP and updater/minisign consistency.
- Knowledgebase consultation was unavailable; local code and prior dependency review
  evidence were used. No retrieved material supplied authorization.

## Locked Rust version changes

| Crate | Before | After |
| --- | --- | --- |
| async-executor | 1.14.0 | 1.14.1 |
| async-lock | 3.4.2 | 3.5.0 |
| bit-set | 0.8.0 | 0.11.1 |
| bit-vec | 0.8.0 | 0.10.2 |
| brotli-decompressor | 6.2.0 | 6.3.1 |
| bumpalo | 3.20.3 | 3.20.4 |
| cc | 1.10.0 | 1.11.2 |
| constant_time_eq | added | 0.6.1 |
| crc32fast | 1.5.3 | 1.5.5 |
| cssparser | 0.37.0 | 0.38.0 |
| ctor | 1.0.13 | 1.0.14 |
| defmt | 1.2.0 | removed |
| defmt-macros | 1.2.0 | removed |
| defmt-parser | 1.1.0 | removed |
| dom_query | 0.28.0 | 0.29.0 |
| errno | 0.3.14 | 0.3.15 |
| flate2 | 1.1.10 | 1.1.11 |
| html5ever | 0.39.0 | 0.40.1 |
| itoa | 1.0.18 | 1.0.19 |
| jiff | 0.2.38 | 0.2.43 |
| jiff-core | 0.1.1 | 0.1.5 |
| jiff-static | 0.2.38 | 0.2.43 |
| link-section | added | 0.19.4 |
| markup5ever | 0.39.0 | 0.40.0 |
| mime | 0.3.17 | 0.3.18 |
| mio | 1.2.4 | 1.2.5 |
| notify | 8.2.1 | 8.2.2 |
| notify-rust | 4.18.2 | 4.19.0 |
| notify-types | 2.2.0 | 2.3.0 |
| phf | 0.13.1 | 0.14.0 |
| phf_codegen | 0.13.1 | 0.14.0 |
| phf_generator | 0.13.1 | 0.14.0 |
| phf_macros | 0.13.1 | 0.14.0 |
| phf_shared | 0.13.1 | 0.14.0 |
| rustls-pki-types | 1.15.1 | 1.16.0 |
| rustls-webpki | 0.103.16 | 0.103.17 |
| selectors | 0.38.0 | 0.41.0 |
| serde_spanned | 1.1.2 | 1.1.3 |
| servo_arc | 0.4.3 | 0.5.0 |
| smallvec | 1.16.4 | 1.16.5 |
| string_cache | 0.9.0 | 0.11.0 |
| string_cache_codegen | 0.6.1 | 0.11.2 |
| syn | 3.0.9 | 3.0.10 |
| tauri-plugin-log | 2.10.1 | 2.10.2 |
| tauri-plugin-notification | 2.8.0 | 2.8.1 |
| tauri-plugin-opener | 2.7.2 | 2.7.3 |
| toml | 1.1.8+spec-1.1.0 | 1.2.1+spec-1.1.0 |
| toml_datetime | 1.1.2+spec-1.1.0 | 1.1.3+spec-1.1.0 |
| toml_edit | 0.25.17+spec-1.1.0 | 0.25.19+spec-1.1.0 |
| toml_writer | 1.1.3+spec-1.1.0 | 1.2.0+spec-1.1.0 |
| uuid | 1.29.0 | 1.29.2 |
| web_atoms | 0.2.6 | 0.3.0 |
| webpki-root-certs | 1.0.11 | 1.0.12 |
| winnow | 1.0.4 | 1.0.5 |
| wry | 0.57.1 | 0.57.2 |
| zbus | 5.19.0 | 6.3.0 |
| zbus_macros | 5.19.0 | 6.3.0 |
| zbus_utils | added | 6.1.0 |
| zip | 9.1.3 | 9.5.1 |
| zruntime | added | 0.2.3 |

## Locked npm changes

| Package path | Before | After |
| --- | --- | --- |
| `node_modules/@asamuzakjp/css-color` | 7.1.9 | removed |
| `node_modules/@asamuzakjp/dom-selector` | 10.0.5 | removed |
| `node_modules/@babel/core` | 7.29.7 | 7.29.13 |
| `node_modules/@babel/core/node_modules/semver` | 6.3.1 | 6.3.2 |
| `node_modules/@babel/generator` | 7.29.12 | 7.29.14 |
| `node_modules/@babel/helper-compilation-targets` | 7.29.7 | 7.29.13 |
| `node_modules/@babel/helper-compilation-targets/node_modules/semver` | 6.3.1 | 6.3.2 |
| `node_modules/@babel/helper-create-class-features-plugin` | 7.29.12 | 7.29.13 |
| `node_modules/@babel/helper-create-class-features-plugin/node_modules/semver` | 6.3.1 | 6.3.2 |
| `node_modules/@babel/helper-member-expression-to-functions` | 7.29.7 | 7.29.14 |
| `node_modules/@babel/helper-module-transforms` | 7.29.7 | 7.29.14 |
| `node_modules/@babel/helper-skip-transparent-expression-wrappers` | 7.29.7 | 7.29.13 |
| `node_modules/@babel/helper-string-parser` | 7.29.11 | 7.29.14 |
| `node_modules/@babel/helpers` | 7.29.10 | 7.29.14 |
| `node_modules/@babel/parser` | 7.29.12 | 7.29.14 |
| `node_modules/@babel/traverse` | 7.29.12 | 7.29.14 |
| `node_modules/@babel/types` | 7.29.11 | 7.29.14 |
| `node_modules/@bramus/specificity` | 2.4.3 | removed |
| `node_modules/@csstools/color-helpers` | 6.1.2 | removed |
| `node_modules/@csstools/css-calc` | 3.4.3 | removed |
| `node_modules/@csstools/css-color-parser` | 4.2.7 | removed |
| `node_modules/@csstools/css-parser-algorithms` | 4.0.2 | removed |
| `node_modules/@csstools/css-syntax-patches-for-csstree` | 1.1.16 | removed |
| `node_modules/@eslint/config-array` | 0.23.5 | 0.23.6 |
| `node_modules/@eslint/config-array/node_modules/minimatch` | added | 11.0.8 |
| `node_modules/@iconify-json/lucide` | 1.2.149 | 1.2.154 |
| `node_modules/@isaacs/cliui` | 8.0.2 | removed |
| `node_modules/@isaacs/cliui/node_modules/emoji-regex` | 9.2.2 | removed |
| `node_modules/@isaacs/cliui/node_modules/string-width` | 5.1.2 | removed |
| `node_modules/@isaacs/cliui/node_modules/wrap-ansi` | 8.1.0 | removed |
| `node_modules/@isaacs/nonrecursive-glob-match` | added | 1.1.0 |
| `node_modules/@napi-rs/lzma-linux-x64-gnu` | 1.5.1 | removed |
| `node_modules/@nuxt/kit` | 4.6.3 | 4.6.4 |
| `node_modules/@nuxt/nitro-server` | 4.6.3 | 4.6.4 |
| `node_modules/@nuxt/schema` | 4.6.3 | 4.6.4 |
| `node_modules/@nuxt/vite-builder` | 4.6.3 | 4.6.4 |
| `node_modules/@nuxt/vite-server` | 4.6.3 | 4.6.4 |
| `node_modules/@pkgjs/parseargs` | 0.11.0 | removed |
| `node_modules/@playwright/test` | 1.64.1 | 1.65.1 |
| `node_modules/@rollup/rollup-android-arm-eabi` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-android-arm64` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-android-x64` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-darwin-arm64` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-darwin-x64` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-freebsd-arm64` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-freebsd-x64` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-linux-arm-gnueabihf` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-linux-arm-musleabihf` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-linux-arm64-gnu` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-linux-arm64-musl` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-linux-loong64-gnu` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-linux-loong64-musl` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-linux-ppc64-gnu` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-linux-ppc64-musl` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-linux-riscv64-gnu` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-linux-riscv64-musl` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-linux-s390x-gnu` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-linux-x64-gnu` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-linux-x64-musl` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-openbsd-x64` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-openharmony-arm64` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-win32-arm64-msvc` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-win32-ia32-msvc` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-win32-x64-gnu` | 4.67.2 | 4.68.3 |
| `node_modules/@rollup/rollup-win32-x64-msvc` | 4.67.2 | 4.68.3 |
| `node_modules/@tailwindcss/node/node_modules/tailwindcss` | added | 4.3.3 |
| `node_modules/@tailwindcss/postcss/node_modules/tailwindcss` | added | 4.3.3 |
| `node_modules/@tailwindcss/vite` | 4.3.3 | 4.3.5 |
| `node_modules/@tailwindcss/vite/node_modules/@tailwindcss/node` | added | 4.3.5 |
| `node_modules/@tailwindcss/vite/node_modules/@tailwindcss/oxide` | added | 4.3.5 |
| `node_modules/@tailwindcss/vite/node_modules/@tailwindcss/oxide-android-arm64` | added | 4.3.5 |
| `node_modules/@tailwindcss/vite/node_modules/@tailwindcss/oxide-darwin-arm64` | added | 4.3.5 |
| `node_modules/@tailwindcss/vite/node_modules/@tailwindcss/oxide-darwin-x64` | added | 4.3.5 |
| `node_modules/@tailwindcss/vite/node_modules/@tailwindcss/oxide-freebsd-x64` | added | 4.3.5 |
| `node_modules/@tailwindcss/vite/node_modules/@tailwindcss/oxide-linux-arm-gnueabihf` | added | 4.3.5 |
| `node_modules/@tailwindcss/vite/node_modules/@tailwindcss/oxide-linux-arm64-gnu` | added | 4.3.5 |
| `node_modules/@tailwindcss/vite/node_modules/@tailwindcss/oxide-linux-arm64-musl` | added | 4.3.5 |
| `node_modules/@tailwindcss/vite/node_modules/@tailwindcss/oxide-linux-x64-gnu` | added | 4.3.5 |
| `node_modules/@tailwindcss/vite/node_modules/@tailwindcss/oxide-linux-x64-musl` | added | 4.3.5 |
| `node_modules/@tailwindcss/vite/node_modules/@tailwindcss/oxide-wasm32-wasi` | added | 4.3.5 |
| `node_modules/@tailwindcss/vite/node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/@emnapi/core` | added | 1.11.3 |
| `node_modules/@tailwindcss/vite/node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/@emnapi/runtime` | added | 1.11.3 |
| `node_modules/@tailwindcss/vite/node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/@emnapi/wasi-threads` | added | 1.2.3 |
| `node_modules/@tailwindcss/vite/node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/@napi-rs/wasm-runtime` | added | 1.2.2 |
| `node_modules/@tailwindcss/vite/node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/@tybys/wasm-util` | added | 0.10.3 |
| `node_modules/@tailwindcss/vite/node_modules/@tailwindcss/oxide-wasm32-wasi/node_modules/tslib` | added | 2.8.1 |
| `node_modules/@tailwindcss/vite/node_modules/@tailwindcss/oxide-win32-arm64-msvc` | added | 4.3.5 |
| `node_modules/@tailwindcss/vite/node_modules/@tailwindcss/oxide-win32-x64-msvc` | added | 4.3.5 |
| `node_modules/@tailwindcss/vite/node_modules/lightningcss` | added | 1.33.0 |
| `node_modules/@tailwindcss/vite/node_modules/lightningcss-android-arm64` | added | 1.33.0 |
| `node_modules/@tailwindcss/vite/node_modules/lightningcss-darwin-arm64` | added | 1.33.0 |
| `node_modules/@tailwindcss/vite/node_modules/lightningcss-darwin-x64` | added | 1.33.0 |
| `node_modules/@tailwindcss/vite/node_modules/lightningcss-freebsd-x64` | added | 1.33.0 |
| `node_modules/@tailwindcss/vite/node_modules/lightningcss-linux-arm-gnueabihf` | added | 1.33.0 |
| `node_modules/@tailwindcss/vite/node_modules/lightningcss-linux-arm64-gnu` | added | 1.33.0 |
| `node_modules/@tailwindcss/vite/node_modules/lightningcss-linux-arm64-musl` | added | 1.33.0 |
| `node_modules/@tailwindcss/vite/node_modules/lightningcss-linux-x64-gnu` | added | 1.33.0 |
| `node_modules/@tailwindcss/vite/node_modules/lightningcss-linux-x64-musl` | added | 1.33.0 |
| `node_modules/@tailwindcss/vite/node_modules/lightningcss-win32-arm64-msvc` | added | 1.33.0 |
| `node_modules/@tailwindcss/vite/node_modules/lightningcss-win32-x64-msvc` | added | 1.33.0 |
| `node_modules/@tauri-apps/plugin-opener` | 2.7.2 | 2.7.3 |
| `node_modules/@typescript-eslint/eslint-plugin` | 8.72.1 | 8.72.2 |
| `node_modules/@typescript-eslint/parser` | 8.72.1 | 8.72.2 |
| `node_modules/@typescript-eslint/project-service` | 8.72.1 | 8.72.2 |
| `node_modules/@typescript-eslint/scope-manager` | 8.72.1 | 8.72.2 |
| `node_modules/@typescript-eslint/tsconfig-utils` | 8.72.1 | 8.72.2 |
| `node_modules/@typescript-eslint/type-utils` | 8.72.1 | 8.72.2 |
| `node_modules/@typescript-eslint/types` | 8.72.1 | 8.72.2 |
| `node_modules/@typescript-eslint/typescript-estree` | 8.72.1 | 8.72.2 |
| `node_modules/@typescript-eslint/utils` | 8.72.1 | 8.72.2 |
| `node_modules/@typescript-eslint/visitor-keys` | 8.72.1 | 8.72.2 |
| `node_modules/@vercel/nft` | 1.11.0 | 1.11.2 |
| `node_modules/@vercel/nft/node_modules/glob` | added | 14.0.6 |
| `node_modules/@vercel/nft/node_modules/minimatch` | added | 11.0.8 |
| `node_modules/@vercel/nft/node_modules/path-scurry` | added | 3.0.0 |
| `node_modules/@vitejs/plugin-vue` | 6.0.10 | 6.0.11 |
| `node_modules/@vitest/mocker` | 5.0.5 | 5.1.0 |
| `node_modules/@vitest/spy` | 5.0.5 | 5.1.0 |
| `node_modules/@vue/compiler-core` | 3.5.44 | 3.5.45 |
| `node_modules/@vue/compiler-dom` | 3.5.44 | 3.5.45 |
| `node_modules/@vue/compiler-sfc` | 3.5.44 | 3.5.45 |
| `node_modules/@vue/compiler-ssr` | 3.5.44 | 3.5.45 |
| `node_modules/@vue/reactivity` | 3.5.44 | 3.5.45 |
| `node_modules/@vue/runtime-core` | 3.5.44 | 3.5.45 |
| `node_modules/@vue/runtime-dom` | 3.5.44 | 3.5.45 |
| `node_modules/@vue/server-renderer` | 3.5.44 | 3.5.45 |
| `node_modules/@vue/shared` | 3.5.44 | 3.5.45 |
| `node_modules/ansi-regex` | 6.5.0 | 6.6.0 |
| `node_modules/archiver` | 7.0.1 | 8.0.0 |
| `node_modules/archiver-utils` | 5.0.2 | removed |
| `node_modules/archiver-utils/node_modules/balanced-match` | 1.0.2 | removed |
| `node_modules/archiver-utils/node_modules/brace-expansion` | 2.1.7 | removed |
| `node_modules/archiver-utils/node_modules/glob` | 10.5.0 | removed |
| `node_modules/archiver-utils/node_modules/is-stream` | 2.0.1 | removed |
| `node_modules/archiver-utils/node_modules/lru-cache` | 10.4.3 | removed |
| `node_modules/archiver-utils/node_modules/minimatch` | 9.0.9 | removed |
| `node_modules/archiver-utils/node_modules/path-scurry` | 1.11.1 | removed |
| `node_modules/archiver/node_modules/is-stream` | added | 4.0.1 |
| `node_modules/bare-buffer` | added | 3.7.2 |
| `node_modules/bare-path` | 3.1.2 | 3.1.3 |
| `node_modules/bare-url` | 2.5.5 | 2.5.7 |
| `node_modules/bcp-47` | added | 2.1.2 |
| `node_modules/bcp-47-match` | added | 2.0.3 |
| `node_modules/bidi-js` | 1.1.0 | removed |
| `node_modules/cjs-module-lexer` | added | 2.3.0 |
| `node_modules/cliui/node_modules/emoji-regex` | 10.6.0 | removed |
| `node_modules/color-convert` | 2.0.1 | removed |
| `node_modules/color-name` | 1.1.4 | removed |
| `node_modules/compress-commons` | 6.0.2 | 7.0.1 |
| `node_modules/compress-commons/node_modules/is-stream` | 2.0.1 | 4.0.1 |
| `node_modules/crc32-stream` | 6.0.0 | 7.0.1 |
| `node_modules/eastasianwidth` | 0.2.0 | removed |
| `node_modules/emoji-regex` | 8.0.0 | 10.6.0 |
| `node_modules/encodeurl` | 2.0.1 | 2.0.3 |
| `node_modules/eslint` | 10.14.0 | 10.15.0 |
| `node_modules/eslint-plugin-import-x` | 4.17.1 | 4.18.1 |
| `node_modules/eslint-plugin-vue` | 10.12.0 | 10.12.1 |
| `node_modules/eslint/node_modules/minimatch` | added | 11.0.8 |
| `node_modules/foreground-child` | 3.3.1 | removed |
| `node_modules/glob` | 13.0.6 | 13.0.7 |
| `node_modules/is-alphabetical` | added | 2.0.1 |
| `node_modules/is-alphanumerical` | added | 2.0.1 |
| `node_modules/is-core-module` | 2.17.0 | 2.18.0 |
| `node_modules/is-decimal` | added | 2.0.1 |
| `node_modules/is-fullwidth-code-point` | 3.0.0 | removed |
| `node_modules/jackspeak` | 3.4.3 | removed |
| `node_modules/jsdom` | 30.1.3 | 31.0.1 |
| `node_modules/lodash` | 4.18.1 | removed |
| `node_modules/nitropack` | 2.13.5 | 2.13.6 |
| `node_modules/nitropack/node_modules/unenv` | added | 2.0.0-rc.24 |
| `node_modules/node-forge` | 1.4.2 | 1.4.3 |
| `node_modules/nuxt` | 4.6.3 | 4.6.4 |
| `node_modules/package-json-from-dist` | 1.0.1 | removed |
| `node_modules/parse5` | 8.0.1 | 8.1.1 |
| `node_modules/parse5-parser-stream` | added | 8.1.1 |
| `node_modules/parse5/node_modules/entities` | 8.1.0 | 9.0.0 |
| `node_modules/playwright` | 1.64.1 | 1.65.1 |
| `node_modules/playwright-core` | 1.64.1 | 1.65.1 |
| `node_modules/postcss` | 8.5.32 | 8.5.33 |
| `node_modules/readdir-glob` | 1.1.3 | 3.0.0 |
| `node_modules/readdir-glob/node_modules/balanced-match` | 1.0.2 | removed |
| `node_modules/readdir-glob/node_modules/brace-expansion` | 2.1.7 | removed |
| `node_modules/readdir-glob/node_modules/minimatch` | 5.1.9 | removed |
| `node_modules/require-from-string` | 2.0.2 | removed |
| `node_modules/resolve` | 1.22.13 | 1.22.14 |
| `node_modules/rollup` | 4.67.2 | 4.68.3 |
| `node_modules/rollup-plugin-visualizer` | 7.1.1 | 7.1.3 |
| `node_modules/seroval` | 1.7.5 | 1.8.1 |
| `node_modules/string-width-cjs` | 4.2.3 | removed |
| `node_modules/string-width-cjs/node_modules/ansi-regex` | 5.0.1 | removed |
| `node_modules/string-width-cjs/node_modules/strip-ansi` | 6.0.1 | removed |
| `node_modules/strip-ansi-cjs` | 6.0.1 | removed |
| `node_modules/strip-ansi-cjs/node_modules/ansi-regex` | 5.0.1 | removed |
| `node_modules/tailwindcss` | 4.3.3 | 4.3.5 |
| `node_modules/tar` | 7.5.22 | 7.5.23 |
| `node_modules/unenv` | 2.0.0-rc.24 | 2.0.0-rc.25 |
| `node_modules/unrouting` | 0.3.1 | 0.3.2 |
| `node_modules/vitest` | 5.0.5 | 5.1.0 |
| `node_modules/vue` | 3.5.44 | 3.5.45 |
| `node_modules/vue-bundle-renderer` | 2.4.0 | 2.5.0 |
| `node_modules/vue-router` | 5.4.0 | 5.5.1 |
| `node_modules/vue-router/node_modules/chokidar` | added | 6.0.0 |
| `node_modules/vue-router/node_modules/local-pkg` | added | 2.0.0 |
| `node_modules/vue-router/node_modules/quansync` | added | 1.0.0 |
| `node_modules/wrap-ansi-cjs` | 7.0.0 | removed |
| `node_modules/wrap-ansi-cjs/node_modules/ansi-regex` | 5.0.1 | removed |
| `node_modules/wrap-ansi-cjs/node_modules/ansi-styles` | 4.3.0 | removed |
| `node_modules/wrap-ansi-cjs/node_modules/string-width` | 4.2.3 | removed |
| `node_modules/wrap-ansi-cjs/node_modules/strip-ansi` | 6.0.1 | removed |
| `node_modules/wrap-ansi/node_modules/emoji-regex` | 10.6.0 | removed |
| `node_modules/zip-stream` | 6.0.1 | 7.0.5 |
