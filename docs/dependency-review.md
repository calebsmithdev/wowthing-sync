# Dependency review — 2026-10-17

Weekly maintenance changelog review. Base: `origin/main` @ `1732a95` (v1.1.2).
Candidate: commit `fc1512b` (dependency refresh of `Cargo.lock`,
`apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/package.json` and
`apps/desktop/package-lock.json`) plus commit `9096ca1` (single-instance
compatibility fix in `setup/desktop.rs`); the stable code under review is
`9096ca1`.

**Validation:** all requested local build/test checks passed on `9096ca1`
(macOS ARM64 only); audits retain findings. See
[Validation results](#validation-results). Hosted Windows, Linux and Intel macOS
CI has not run and no CI result is claimed.

Labels used below: **[notes]** = stated explicitly in the cited release
notes/changelog. **[inference]** = my reading of how a note applies to this
repository; not stated by upstream.

## Method and sources

- Old versions: `git show origin/main:Cargo.lock`, `…:apps/desktop/package.json`,
  `…:apps/desktop/package-lock.json`. New versions: `fc1512b`. npm
  transitive old→new list: `/tmp/wowthing-npm-changes.json` (102 entries; 51 are
  per-platform `@rollup/*`, `@rolldown/*`, `@tauri-apps/cli-*` binaries that
  follow their parent). Latest-candidate list: `/tmp/wowthing-npm-latest.json`.
- Release notes: GitHub Releases or in-repo CHANGELOGs of each project (links
  inline). Audits: `/tmp/wowthing-npm-audit.json`,
  `/tmp/wowthing-npm-audit-production.json`, `/tmp/wowthing-cargo-audit-full.json`.
- Repository usage was checked in the files listed under
  [Inspected files](#inspected-files).

## Rust: direct dependency changes

Every changed direct minimum in `apps/desktop/src-tauri/Cargo.toml`:

| Crate | Old → new (min = lock) | Source |
| --- | --- | --- |
| `tauri` | 2.12.3 → 2.12.4 | [CHANGELOG](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri/CHANGELOG.md) |
| `tauri-build` (build-dep) | 2.7.2 → 2.7.3 | [CHANGELOG](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-build/CHANGELOG.md) |
| `tauri-plugin-opener` | 2.7.1 → 2.7.2 | [CHANGELOG](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/opener/CHANGELOG.md) |
| `tauri-plugin-dialog` | 2.8.2 → 2.8.3 | [CHANGELOG](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/dialog/CHANGELOG.md) |
| `tauri-plugin-notification` | 2.6.0 → 2.7.0 | [CHANGELOG](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/notification/CHANGELOG.md) |
| `tauri-plugin-updater` | 2.13.3 → 2.14.0 | [CHANGELOG](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/updater/CHANGELOG.md), [release](https://github.com/tauri-apps/plugins-workspace/releases/tag/updater-v2.14.0) |
| `tauri-plugin-single-instance` | 2.5.3 → 2.5.4 | [CHANGELOG](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/single-instance/CHANGELOG.md) |
| `libc` | 0.2.190 → 0.2.191 | [release](https://github.com/rust-lang/libc/releases/tag/0.2.191) |
| `tokio` | 1.53.2 → 1.53.3 | [release](https://github.com/tokio-rs/tokio/releases/tag/tokio-1.53.3) |

## Rust: transitive changes (all lock changes)

Complete list from diffing `Cargo.lock`: 36 existing crates changed plus 1 new crate (`static_vcruntime`), 37 package changes in total.

| Group | Changes | Source |
| --- | --- | --- |
| Tauri core | `tauri-codegen`, `tauri-macros` 2.7.2→2.7.3; `tauri-plugin` 2.7.1→2.7.2; `tauri-runtime`, `tauri-runtime-wry` 2.12.1→2.12.2; `tauri-utils` 2.10.1→2.10.2; `tauri-plugin-fs` 2.7.0→2.7.1 (via dialog) | CHANGELOGs under [`crates/*`](https://github.com/tauri-apps/tauri/tree/dev/crates), [fs](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/fs/CHANGELOG.md) |
| TLS stack | `rustls` 0.23.45→0.23.46; `rustls-native-certs` 0.8.4→0.8.5; `schannel` 0.1.29→0.1.30; `aws-lc-rs` 1.18.1→1.18.2; `aws-lc-sys` 0.45.0→0.46.0 | [rustls](https://github.com/rustls/rustls/releases/tag/v/0.23.46), [native-certs](https://github.com/rustls/rustls-native-certs/releases/tag/v/0.8.5), [aws-lc-rs](https://github.com/aws/aws-lc-rs/releases/tag/v1.18.2); `schannel` 0.1.30: no release page; [compare v0.1.29…v0.1.30](https://github.com/steffengy/schannel-rs/compare/v0.1.29...v0.1.30) lists a Windows-only "configurable system cert-store builder" addition ([tag](https://github.com/steffengy/schannel-rs/tags)) |
| Build | **new** `static_vcruntime` 3.0.0 (`tauri-build` dependency) | tauri-build 2.7.3 CHANGELOG; crate source [ChrisDenton/static_vcruntime](https://github.com/ChrisDenton/static_vcruntime) (no GitHub releases; tags `2.0`, `3.0`, latest commit "Update to 3.0"; [crates.io](https://crates.io/crates/static_vcruntime)) |
| D-Bus (Linux) | `zbus_names` 4.3.4→4.3.5; `zvariant`, `zvariant_derive` 5.15.0→5.15.1 | [zvariant 5.15.1](https://github.com/z-galaxy/zbus/releases/tag/zvariant-5.15.1) |
| Schema/macros | `schemars` 1.2.2→1.2.3; `syn` 3.0.7→3.0.9; `unicode-ident` 1.0.26→1.0.27 | [schemars](https://github.com/GREsau/schemars/releases/tag/v1.2.3), [syn 3.0.8](https://github.com/dtolnay/syn/releases/tag/3.0.8) (fix parsing of `<-`/`->` in expressions) and [3.0.9](https://github.com/dtolnay/syn/releases/tag/3.0.9) (`Punctuated::retain`), [unicode-ident](https://github.com/dtolnay/unicode-ident/releases/tag/1.0.27) |
| Misc leaf crates | `combine` 4.6.8→4.6.9 (JNI); `defmt`, `defmt-macros` 1.1.1→1.2.0, `defmt-parser` 1.0.0→1.1.0 (via `jiff`); `deranged` 0.5.8→0.5.9, `num_threads` 0.1.7→0.1.8 (via `time`); `equivalent` 1.0.2→1.0.3 (`indexmap`); `zerocopy`, `zerocopy-derive` 0.8.62→0.8.63 | [combine](https://github.com/Marwes/combine/releases/tag/v4.6.9), [defmt](https://github.com/knurling-rs/defmt/releases/tag/defmt-v1.2.0), [deranged](https://github.com/jhpratt/deranged/releases/tag/v0.5.9), [zerocopy](https://github.com/google/zerocopy/releases/tag/v0.8.63); [num_threads](https://github.com/jhpratt/num_threads/releases/tag/v0.1.8) (no release body; [compare v0.1.7…v0.1.8](https://github.com/jhpratt/num_threads/compare/v0.1.7...v0.1.8) shows 32-bit Apple target support removed and a macOS Rosetta thread-count adjustment), [equivalent](https://github.com/indexmap-rs/equivalent/releases/tag/v1.0.3) (no release body; [compare](https://github.com/indexmap-rs/equivalent/compare/v1.0.2...v1.0.3): documentation of trait contracts only); `deranged` 0.5.9 release page is empty (only tag [v0.5.9](https://github.com/jhpratt/deranged/releases/tag/v0.5.9)); `defmt-macros`/`defmt-parser` have no separate release pages and ship in the defmt 1.2.0 workspace release, whose notes include "Bump syn to v3", a parser panic fix for bare-number bitfield specs and a defmt-print EOF fix |

`wry` (0.57.0) and `tao` (0.37.1) are unchanged.

### Notes by crate (release-note content)

- **tauri 2.12.4** [notes]: fixes a panic in IPC/asset protocol handlers on an
  empty request URI path; mobile-only plugin fix; iOS error-message tweak. Nothing
  desktop-API-facing. Also pulled in 2.12.3 text already present in the base.
- **tauri-build 2.7.3** [notes]: switches back to the `static_vcruntime` crate
  (fixes a linking error when the crate calling `tauri_build::build` is used as a
  library); ACL typo suggestions for unknown permission identifiers. [inference]
  The app crate is a `staticlib`/`cdylib`/`rlib` library (`Cargo.toml` `[lib]`),
  so the Windows MSVC link fix is directly relevant; the new crate only matters
  on Windows builds.
- **tauri-utils 2.10.2** [notes]: permission files in `OUT_DIR` are listed
  relative to it, fixing "failed to read plugin permissions" when the target dir
  moves (e.g. restored from a CI cache at another path). [inference] Relevant to
  the cached Rust builds in `.github/workflows/desktop-checks.yml`.
- **tauri-plugin-updater 2.14.0** [notes]: `Update::install` now verifies the
  package bytes before installing; `Updater::check` resolves to `None` instead of
  a target error when the release is not an update and lacks an entry for the
  current target; new `Updater::restore_update` and `Update::verify`; Linux
  AppImage install fixes (cross-device link, corrupt non-AppImage payload
  rejected before touching the installed app, temp-dir fallback); `check()`,
  `download()`, `downloadAndInstall()` no longer replace `headers` on the options
  object; calling `Update.download()` again frees the previous bytes; warning
  logged for non-`https` download URLs; Windows installer launch failures report
  the `ShellExecuteW` reason. 2.13.3 (already in base) is where `minisign-verify`
  0.3 landed and the `Error::Minisign` variant wrapping changed.
- **tauri-plugin-notification 2.7.0** [notes]: on Linux/BSD every notification is
  sent over the plugin's retained D-Bus connection (fixes notifications closing
  immediately on GNOME); adds `NotificationBuilder::on_close` on Linux/BSD.
  2.6.0 (already in base) is where desktop `onAction`/`on_action` was added.
- **tauri-plugin-single-instance 2.5.4** [notes]: on Linux a secondary instance
  that cannot deliver its arguments to the primary now returns a plugin
  initialization error instead of exiting successfully; an invalid `dbus_id`
  returns an error instead of panicking; with no session bus the app launches
  normally without single-instance support and logs a warning. On Windows an
  argument containing `|` is no longer split when forwarded.
- **tauri-plugin-opener 2.7.2** [notes]: fixes a Linux/BSD panic in
  `reveal_item_in_dir` inside an async runtime. The app only uses `openUrl`
  [inference], so no effect expected.
- **tauri-plugin-dialog 2.8.3 / fs 2.7.1** [notes]: dialog only bumps `fs-js`;
  fs fixes colon-containing relative paths, `write-*` permission sets, and
  `requireLiteralLeadingDot` with `allow_directory`. [inference] The app grants
  no frontend fs permissions (AGENTS.md "Security and permissions"), so these are
  transitive-only.
- **rustls 0.23.46** [notes]: security release. GHSAs listed:
  [GHSA-h2v8-394m-p7vv](https://github.com/rustls/rustls/security/advisories/GHSA-h2v8-394m-p7vv)
  (opt-in Brotli cert decompression memory use),
  [GHSA-c8m5-c952-6cm4](https://github.com/rustls/rustls/security/advisories/GHSA-c8m5-c952-6cm4)
  (client session `Debug` leaked secrets),
  [GHSA-w44r-93j7-qv28](https://github.com/rustls/rustls/security/advisories/GHSA-w44r-93j7-qv28)
  (poisoned key-exchange hints),
  [GHSA-vp88-798v-h67f](https://github.com/rustls/rustls/security/advisories/GHSA-vp88-798v-h67f)
  (ECH rejection sent buffered app data; 0.23.44–0.23.45). Plus many hardening
  fixes. [inference] `rustls` is used by `reqwest`, `tauri-plugin-updater`
  and `hyper-rustls` in `Cargo.lock`; whether each GHSA is reachable (ECH and
  Brotli are not enabled by this app's configuration) is not established here.
- **aws-lc-sys 0.46.0** [notes]: bundles AWS-LC v5.11.0 (was v5.7.0), including
  Ed25519 C decoder rejecting non-canonical public keys and an ML-KEM CPU
  feature-detection fix for x86-64 CPUs with AVX2 but no BMI2. aws-lc-rs 1.18.2
  build fixes (jitterentropy `-O0`, `AWS_LC_SYS_CC`). [inference] Source-built C
  code: Windows/Linux CI compilers are the first place a build break would show.
- **rustls-native-certs 0.8.5** [notes]: reads each Unix cert-directory file once.
- **tokio 1.53.3** [notes]: `AsyncFd::new`/`with_interest`/`try_*` deprecated in
  favour of new `register*`; fixes for waker/lock handling and paused-time
  auto-advance on `current_thread` with I/O wakes. [inference] The crate uses
  tokio with `macros, time, rt` only (`Cargo.toml`), so `AsyncFd` deprecation does
  not apply; clippy `-D warnings` would flag it if it did.
- **libc 0.2.191** [notes]: additions (Apple `F_SETNOSIGPIPE`, others); Apple
  Mach API available again on non-macOS targets; FreeBSD `NOTE_PCTRLMASK`
  re-added with a deprecation warning.
- **zvariant 5.15.1** [notes]: marks the crate deprecated in package metadata
  ("merged into zbus 6"). [inference] This is the Linux secret-service path
  (`zbus` 5.19.0 in lock, reached via `keyring`).
- Other leaf crates (`schemars`, `syn`, `unicode-ident`, `combine`, `defmt`,
  `zerocopy`): patch/minor notes with no runtime-visible change for this app.

## npm: direct dependency changes (`apps/desktop/package.json`)

| Package | Old → new (min = lock) | Source |
| --- | --- | --- |
| `nuxt` | 4.6.1 → 4.6.2 | [release](https://github.com/nuxt/nuxt/releases/tag/v4.6.2) |
| `@nuxt/ui` | 4.11.3 → 4.12.0 | [release](https://github.com/nuxt/ui/releases/tag/v4.12.0) |
| `vue` | 3.5.43 → 3.5.44 | [CHANGELOG](https://github.com/vuejs/core/blob/main/CHANGELOG.md#3544-2026-10-13) |
| `postcss` | 8.5.29 → 8.5.30 | [release](https://github.com/postcss/postcss/releases/tag/8.5.30) |
| `@tauri-apps/api` | 2.12.3 → 2.12.4 | [CHANGELOG](https://github.com/tauri-apps/tauri/blob/dev/packages/api/CHANGELOG.md) |
| `@tauri-apps/cli` | 2.12.2 → 2.12.3 | [CHANGELOG](https://github.com/tauri-apps/tauri/blob/dev/packages/cli/CHANGELOG.md) |
| `@tauri-apps/plugin-dialog` | 2.8.2 → 2.8.3 | [CHANGELOG](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/dialog/CHANGELOG.md) |
| `@tauri-apps/plugin-opener` | 2.7.1 → 2.7.2 | [CHANGELOG](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/opener/CHANGELOG.md) |
| `@tauri-apps/plugin-updater` | 2.13.3 → 2.14.0 | [CHANGELOG](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/updater/CHANGELOG.md) |
| `@iconify-json/lucide` | 1.2.142 → 1.2.145 | no changelog; data regenerated by the [iconify/icon-sets](https://github.com/iconify/icon-sets/commits/master/json/lucide.json) bot ("Update N icon sets" commits 2026-10-03…10-16) from [Lucide](https://github.com/lucide-icons/lucide/releases). **Verified by diffing the two published tarballs** ([npm 1.2.142](https://www.npmjs.com/package/@iconify-json/lucide/v/1.2.142) vs [1.2.145](https://www.npmjs.com/package/@iconify-json/lucide/v/1.2.145), `icons.json`): 1942→1966 icons; 25 added (e.g. `certificate`, `folder-user`, `wifi-lock`), 4 existing glyphs redrawn (`barrel`, `music`, `music-2`, `music-4`), `music-3` converted to an alias; none of the 16 lucide icons in `nuxt.config.ts` (`icon.clientBundle.icons`) were changed or removed. |
| `@playwright/test` | 1.64.0 → 1.64.1 | [release](https://github.com/microsoft/playwright/releases/tag/v1.64.1) |
| `eslint` | 10.12.0 → 10.13.0 | [release](https://github.com/eslint/eslint/releases/tag/v10.13.0) |
| `jsdom` | 30.1.2 → 30.1.3 | [release](https://github.com/jsdom/jsdom/releases/tag/v30.1.3) |
| `vitest` | 5.0.3 → 5.0.5 | [5.0.4](https://github.com/vitest-dev/vitest/releases/tag/v5.0.4), [5.0.5](https://github.com/vitest-dev/vitest/releases/tag/v5.0.5) |

### Notes by package

- **Nuxt 4.6.2** [notes]: patch with ~30 fixes (server-island head, route-rule
  case matching, rooted-path URL parsing, SPA loading template location, Vite dev
  fixes, navigation error state). No breaking changes listed.
- **Nuxt UI 4.12.0** [notes]: new `Chart` component, automatic `@nuxtjs/i18n`
  locale, lazy-loaded overlays (`Header`/`Sidebar` menus, `Toaster` toasts,
  search palettes; "up to 27% less JavaScript"), `App` now forwards a `nonce`
  prop, `theme: remove unknown and conflicting classes`, accessibility-label
  fixes. No breaking changes listed. Peer ranges: `typescript ^5.6.3 || ^6 || ^7`,
  `vue-router ^4.5.0 || ^5`. [inference] See Breaking changes for the CSP/palette
  items that deserve a native-smoke look.
- **Vue 3.5.44** [notes]: ~20 bug fixes (compiler `v-html` with `0`/`false`,
  `v-show` transition persisted in production, reactivity watcher fixes,
  SSR/async-setup error propagation). No features.
- **Vitest 5.0.4/5.0.5** [notes]: 5.0.4 enables `fsModuleCache` by default and
  tags cache directories with `CACHEDIR.TAG`; JUnit reporter strips ANSI from all
  XML attributes; browser-mode workers behavior change (browser mode is not used
  here, `vitest.config.ts`). 5.0.5 keeps Vite's default `fs.deny` with the API
  token file, runs hook cleanups when a later hook fails, releases mocks of
  finished files.
- **jsdom 30.1.3** [notes]: large `getComputedStyle()` correctness and
  performance fixes (shorthands, `color-mix()`, nested `@media`); XHR credential
  and cookie handling after cross-origin redirects; selector fixes.
- **ESLint 10.13.0** [notes]: `no-use-before-define` now reports references
  inside IIFEs; `globalThis` added to `no-obj-calls`; `no-unsafe-optional-chaining`
  checks `yield*`. [inference] Can surface new lint findings in existing code if
  those rules are enabled by `@nuxt/eslint`. The final lint run passed.
- **Playwright 1.64.1** [notes]: fixes `_electron.launch` losing the first window
  and a Chromium 155+ regression where a preflighted cross-origin redirect aborts
  with `net::ERR_ABORTED` whenever any route is registered. [inference]
  `tests/e2e/smoke.spec.ts:10,62,112` register `page.route('https://**', …)`, so
  the second fix is the relevant one; Electron is not used.
- **postcss 8.5.30** [notes]: fix for source-map `</style>` escaping.
- **@tauri-apps/api 2.12.4 / plugin-dialog / plugin-opener** [notes]: docs only /
  fs-js bump / Linux reveal fix. **@tauri-apps/cli 2.12.3** [notes]: updates NSIS
  to 3.13, fixes NSIS leaving `uninstall.exe` behind, iOS xcode-script fix.
  **tauri 2.12.3** (already in base crate) fixes NSIS downgrade blocking in
  silent/passive/update modes when `allowDowngrades` is false.
- **@tauri-apps/plugin-updater 2.14.0**: see Rust notes; the JS `headers` fix and
  memory-release fix apply to `check()`/`downloadAndInstall()`.

## npm: notable transitive changes (from `/tmp/wowthing-npm-changes.json`)

| Package | Old → new | Parent / note | Source |
| --- | --- | --- | --- |
| `@floating-ui/vue` | 1.1.11 → **2.0.1** (major) | Nuxt UI/Reka UI positioning. **[notes]** 2.0.0 drops `vue-demi`, ends Vue 2 / Vue <3.3 support. App uses Vue 3.5. | [2.0.0](https://github.com/floating-ui/floating-ui/releases/tag/%40floating-ui/vue%402.0.0), [2.0.1](https://github.com/floating-ui/floating-ui/releases/tag/%40floating-ui/vue%402.0.1) |
| `@asamuzakjp/dom-selector` | 9.2.4 → **10.0.4** (major) | jsdom selector engine. Notes list internal refactors (traversal methods moved, subject extraction via AST) and no migration text; 10.0.1 has no body ([compare](https://github.com/asamuzaK/domSelector/compare/v10.0.0...v10.0.1)); 10.0.2 accepts an empty string for `|=` attribute selectors; 10.0.3 fixes `extractSubjects`; 10.0.4 fixes "preceding logic" (sibling combinators, per the PR title only). | [v10.0.0](https://github.com/asamuzaK/domSelector/releases/tag/v10.0.0), [10.0.1](https://github.com/asamuzaK/domSelector/releases/tag/v10.0.1), [10.0.2](https://github.com/asamuzaK/domSelector/releases/tag/v10.0.2), [10.0.3](https://github.com/asamuzaK/domSelector/releases/tag/v10.0.3), [v10.0.4](https://github.com/asamuzaK/domSelector/releases/tag/v10.0.4) |
| `reka-ui` | 2.10.5 → 2.11.0 | Nuxt UI primitives. New components (TagGroup, Field/Form), `loop` navigation, Checkbox `max`, etc. | [v2.11.0](https://github.com/unovue/reka-ui/releases/tag/v2.11.0) |
| `undici` | 8.11.2 → 8.12.2 | **[notes]** 8.12.2 fixes 4 high and several medium advisories (TLS 1.2 renegotiation DoS GHSA-qrxm-fqhp-jwvm; dropped `Agent` TLS options GHSA-2m5v-pch6-74hx; cross-origin redirect cache poisoning GHSA-4w7w-5xrc-9h26; excessive `Content-Encoding` DoS GHSA-xjj6-f33q-929c). Also in 8.12.2: medium fixes for the `decompress` interceptor, SRI algorithm-token case, unbounded EventSource parser state and WebSocket PONG buffering. 8.12.0 [notes]: ~50 fixes (HTTP/1 204/304 and `strictContentLength` handling, cache/dns/pool fixes, zstd window limit of 8 MB, experimental `milo` parser, error when WebAssembly is unavailable); 8.12.1: restores the `build:wasm` script. [inference] Build/dev-time tooling in this repo. | [v8.12.0](https://github.com/nodejs/undici/releases/tag/v8.12.0), [v8.12.1](https://github.com/nodejs/undici/releases/tag/v8.12.1), [v8.12.2](https://github.com/nodejs/undici/releases/tag/v8.12.2) |
| `devalue` | 6.0.2 → 6.0.3 | Perf, Node engine lowered to >=18, `.js` type-import extensions. | [v6.0.3](https://github.com/sveltejs/devalue/releases/tag/v6.0.3) |
| `@nuxt/devtools` (+`-kit`, `-wizard`) | 3.4.2 → 3.4.3 | **[notes]** requires the dev auth token for server config and storage mounts. Also removes the previous critical `simple-git` audit chain (parent report). | [v3.4.3](https://github.com/nuxt/devtools/releases/tag/v3.4.3) |
| `@nuxt/{kit,schema,nitro-server,vite-builder,vite-server}` | 4.6.1 → 4.6.2 | Same release as `nuxt`. | Nuxt 4.6.2 |
| `unhead`, `@unhead/vue`, `@unhead/bundler` | 3.4.2 → 3.4.3 | Fixes (numeric template params incl. `0`, negative robots directives). | [v3.4.3](https://github.com/unjs/unhead/releases/tag/v3.4.3) |
| `@vue/*` compiler/runtime packages | 3.5.43 → 3.5.44 | Same release as `vue`. | Vue 3.5.44 |
| `rolldown` + `@rolldown/binding-*`, `@oxc-project/types` | 1.2.13 → 1.2.14; 0.153.0 → 0.154.0 | Nuxt's bundler peer. New `output.charset`; code-splitting, tree-shaking and sourcemap fixes (1.2.14). `@oxc-project/types` 0.154.0 [notes] lists three **breaking** parser/AST changes (comment attachment storage, node IDs assigned during parsing); [inference] these are internal to the rolldown/oxc pairing, which npm resolved together. | [rolldown v1.2.14](https://github.com/rolldown/rolldown/releases/tag/v1.2.14), [oxc crates_v0.154.0](https://github.com/oxc-project/oxc/releases/tag/crates_v0.154.0) |
| `rollup` + `@rollup/rollup-*` | 4.64.5 → 4.64.8 | Chunk-hash and relative-import-resolution fixes (4.64.8). 4.64.6: stop tree-shaking side effects in class instance fields; top-level-await detection for async `for…of`/disposal. 4.64.7: Linux watch fix for missing files sharing a directory. 4.64.8: chunk hash changes with sourcemap comments; relative-import resolution edge cases. No breaking changes listed. | [4.64.6](https://github.com/rollup/rollup/releases/tag/v4.64.6), [4.64.7](https://github.com/rollup/rollup/releases/tag/v4.64.7), [4.64.8](https://github.com/rollup/rollup/releases/tag/v4.64.8) |
| `@vitest/mocker`, `@vitest/spy` | 5.0.3 → 5.0.5 | Same release as `vitest`. | Vitest 5.0.5 |
| `playwright`, `playwright-core` | 1.64.0 → 1.64.1 | Same release as `@playwright/test`. | Playwright 1.64.1 |
| `cssnano` | 9.6.0 → 9.9.0 | **[notes]** 9.8.0: `postcss-normalize-url` stops rewriting URLs; `postcss-svgo` removed from the presets (output changes for inline SVG data URIs; `svgo` option ignored). 9.9.0: presets/plugins bundled into the single `cssnano` package (fewer dependency-tree packages; `overrides` pinning an individual plugin no longer apply). 9.6.0/9.7.0/9.4.0–9.5.0: further minification features and fixes. [inference] Nuxt uses cssnano to minify production CSS, so built CSS bytes can differ; check the generated CSS and CSP behavior in the production build. | [CHANGELOG](https://github.com/cssnano/cssnano/blob/master/packages/cssnano/CHANGELOG.md), [releases](https://github.com/cssnano/cssnano/releases) |
| `mime` | 4.1.0 → 4.1.1 | **[notes]** fix: normalize content types in `getAllExtensions`. | [v4.1.1](https://github.com/broofa/mime/releases/tag/v4.1.1) |
| `vite-plugin-vue-tracer` | 1.5.0 → 1.6.0 | **[notes]** devtools fixes only (tracer activation subscriptions, focus on activation). | [v1.6.0](https://github.com/antfu/vite-plugin-vue-tracer/releases/tag/v1.6.0) |
| `bare-url` | 2.5.4 → 2.5.5 | No release page; [compare v2.5.4…v2.5.5](https://github.com/holepunchto/bare-url/compare/v2.5.4...v2.5.5): Windows extended-length paths handled in `pathToFileURL`, threat-model doc. | [compare](https://github.com/holepunchto/bare-url/compare/v2.5.4...v2.5.5) |
| `@tiptap/y-tiptap` | 3.0.9 → 3.0.10 | No changelog; published from the [tiptap monorepo `packages/y-tiptap`](https://github.com/ueberdosis/tiptap/commits/main/packages/y-tiptap); the 2026-10-13 commit is "Integrate y-tiptap and fix structural relative positions (#8475)". Transitive of Nuxt UI's optional editor stack [inference]. | [commit](https://github.com/ueberdosis/tiptap/commit/dd62145) |

### Grouped platform binary packages

Per-platform optional packages follow their parent exactly; the install only uses
the host's binary. Same release notes as the parent:

| Group | Packages changed | Version | Notes |
| --- | --- | --- | --- |
| `@rollup/rollup-*` | 25 | 4.64.5 → 4.64.8 | rollup 4.64.6–4.64.8 (above) |
| `@rolldown/binding-*` | 15 | 1.2.13 → 1.2.14 | [rolldown v1.2.14](https://github.com/rolldown/rolldown/releases/tag/v1.2.14) |
| `@tauri-apps/cli-*` | 11 | 2.12.2 → 2.12.3 | [CLI CHANGELOG](https://github.com/tauri-apps/tauri/blob/dev/packages/cli/CHANGELOG.md) |

`vite` (8.3.4), `nitropack` (2.13.4) and `@nuxt/eslint` (1.17.0) did not change.

## Breaking changes

No direct major upgrade was retained. These behavior changes required a
compatibility fix or focused validation:

1. **single-instance 2.5.4, Linux — secondary-instance failure is now a plugin
   initialization error. APPLIED compatibility fix in `9096ca1`.** [notes] A
   secondary instance that cannot deliver its arguments to the primary now
   returns a plugin initialization error instead of exiting successfully; with
   no session bus the plugin still returns `Ok` and the app launches without
   single-instance support (warning logged). The base code discarded the result
   (`let _ = app.plugin(tauri_plugin_single_instance::init(…))`), which would
   have let a failed secondary instance continue and start a second app with a
   second sync worker. `apps/desktop/src-tauri/src/setup/desktop.rs:14-16` now
   propagates the error with `?`, so setup stops before the worker is created
   (`lib.rs:62` `setup_desktop(handle)?` precedes `SyncService::start`). The
   no-bus fallback is unchanged. Confirmed by an independent reviewer; not a
   compile break. Final-code validation is recorded under Validation results.
2. **updater 2.14.0 — install now verifies bytes itself.** [notes]
   `apps/desktop/src-tauri/src/updater_fixture.rs:72-86` calls `download()` and
   then `install(bytes)`, and `:76-79` matches
   `Error::Minisign(minisign_verify::Error::InvalidSignature)`. [inference] The
   `Error::Minisign` shape is documented as changed in 2.13.3 (already in base),
   so this match should be unaffected; the extra verification in `install` is
   redundant for the fixture's valid-signature path. Whether the 2.14.0
   `check()` → `None` change alters `useUpdater.ts:49` behavior for a
   target-missing manifest is not verified; the code already handles a falsy
   `update` (`:50-55`).
3. **Nuxt UI 4.12.0 — runtime CSS/script injection rechecked locally.**
   [notes] lazy-loaded `Toaster`/menu overlays and removed "unknown and
   conflicting" theme classes. AGENTS.md ("Security and permissions") requires
   re-running native smoke after UI changes because of production CSP. The static
   palette hook `apps/desktop/nuxt.config.ts:11-12` filters the plugin whose path
   contains `/@nuxt/ui/dist/runtime/plugins/colors`; the 4.12.0 source tree still
   has `src/runtime/plugins/colors.ts` ([4.12.0 tree](https://github.com/nuxt/ui/tree/v4.12.0/src/runtime/plugins)),
   and the generated build, browser smoke and both native harnesses passed
   without CSP errors. Hosted platform checks remain outstanding.
4. **@floating-ui/vue 2.0.0 (major) and dom-selector 10.0.0 (major)** are
   transitive majors. [notes] The only stated breaking change is dropping
   `vue-demi`/Vue 2 for floating-ui, which does not apply to Vue 3.5. dom-selector
   lists no breaking change. Risk is limited to unit tests that use jsdom selectors
   and to popover/menu positioning in the UI.

## Recommended changes

Security, deprecations, configuration and migrations. The single-instance item
is already applied (`9096ca1`); the others are not applied by this document.

- **TypeScript 7 is held (typescript stays `^5.9.3`).** Evidence: installing
  `typescript@7.0.2` and running `nuxt typecheck` with `vue-tsc` 3.3.13 fails
  with `ERR_PACKAGE_PATH_NOT_EXPORTED: Package subpath './lib/tsc' is not
  defined by "exports"` in `typescript/package.json`
  (`/tmp/wowthing-typescript7-typecheck.log`). Upstream agrees:
  [TypeScript 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#typescript-and-embedded-languages)
  says Vue-based workflows likely cannot yet use TypeScript 7 (no stable
  programmatic API), and the vue-tsc maintainers close
  [#6156](https://github.com/vuejs/language-tools/issues/6156),
  [#6124](https://github.com/vuejs/language-tools/issues/6124) and
  [#5381](https://github.com/vuejs/language-tools/issues/5381) pointing to
  `typescript-native-bridge` until the 7.1 plugin interface lands. Peer ranges
  (`vue-tsc` `>=5.0.0`, Nuxt UI `^7`) allow 7 on paper but are not sufficient.
  Revisit when vue-tsc declares TS 7 support (track
  [PR #6170](https://github.com/vuejs/language-tools/pull/6170)).
- **`@types/node` stays on 22** (`package.json:51`) to match the supported Node
  line (`^22.22.3 || ^24.15.0 || >=26`); latest is 26.6.5. Vitest's peer range
  (`^22.0.0 || >=24.0.0`) accepts 22.
- **Single-instance init result — APPLIED (`9096ca1`).**
  `setup/desktop.rs:14-16` propagates `app.plugin(single_instance::init(…))`
  with `?` instead of discarding it, matching the 2.5.4 behavior [notes] that a
  secondary instance failing to reach the primary is an error. The documented
  no-session-bus fallback (plugin returns `Ok`, app continues without
  single-instance support) is retained.
- **Updater**: 2.14.0 logs a warning for non-`https` update URLs; confirm the
  `tauri.conf.json` endpoints are `https` (`plugins.updater.endpoints`, line 50).
  Linux AppImage updater fixes (cross-device link, bad payload rejection) are
  relevant to the shipped AppImage target documented in AGENTS.md
  ("AppImage compatibility baseline").
- **Dev-only audit items** (npm): the 12 findings (11 high, 1 low;
  `/tmp/wowthing-npm-audit*.json`, identical in the production set) are
  `nuxt`/`@nuxt/*` → `nitropack` → `listhen` → `node-forge`, and
  `micromatch`/`braces`/`fast-glob`/`globby`, plus a low `esbuild` item.
  `npm audit fix --force` proposes **`nuxt@4.1.3` (a downgrade); do not apply**.
  The previous critical `simple-git` chain is gone via `@nuxt/devtools` 3.4.3.
  Reachability (source-checked): `braces`/`micromatch` receive constants and
  repository config, not user data; `node-forge` via `listhen` is used for
  dev-server certificate creation/signing, not verification; the `esbuild` item
  applies to `serve` on Windows, while `fontless` uses `transform`. No new
  app vulnerability was demonstrated; the findings are residual dev-tooling risk.
  The 12 package findings represent 3 underlying advisories.
- **Cargo audit** (full run, `/tmp/wowthing-cargo-audit-full.json`, 608
  dependencies, exit 1 for findings, complete JSON, empty stderr; the earlier
  yanked-registry timeout was recovered by `cargo fetch` and a retry, so yanked
  status is covered): three `zip` 4.6.1 vulnerabilities —
  [RUSTSEC-2026-0367](https://rustsec.org/advisories/RUSTSEC-2026-0367),
  [0368](https://rustsec.org/advisories/RUSTSEC-2026-0368),
  [0369](https://rustsec.org/advisories/RUSTSEC-2026-0369) (extract-time SUID/SGID
  preservation, symlink target escape, Unix permissions applied through
  symlinks), reached only through `tauri-plugin-updater`. RustSec lists
  `patched >= 9.0.0` for all three, but the upstream advisory for 0369
  ([GHSA-4684-h2q9-2vcp](https://github.com/zip-rs/zip2/security/advisories/GHSA-4684-h2q9-2vcp))
  lists the patched version as **9.0.1** (vulnerable `<= 9.0.0`); do not treat
  9.0.0 as fixing every item. Warnings: `proc-macro-error` 1.0.4 unmaintained
  (RUSTSEC-2024-0370) and `glib` 0.18.5 unsound (RUSTSEC-2024-0429), both via
  Tauri's Linux GTK stack; no yanked-crate warning appears in the report. The
  updater's `zip` version is not selectable from this manifest; updater 2.14.0
  still resolves 4.6.1. Reachability (source-checked): `zip` is used only by the
  updater, via Windows-only `ZipArchive::extract`, after signature verification;
  the Unix SUID/permission sinks are cfg-excluded. The Windows symlink-target
  concern remains qualified: no unsigned-archive path was found. `glib` is
  Linux-only and no `VariantStrIter` consumer was found; `proc-macro-error` is a
  compile-time maintenance warning. Residual risk is not dismissed: it stays until
  the updater moves to a patched `zip`.
- **Playwright 1.64.1**: no config change required; the Chromium 155+ route fix
  may remove flakiness in the three `page.route` specs [inference].

## Improvements and opportunities

- `tauri-plugin-notification` 2.7.0 `NotificationBuilder::on_close` (Linux/BSD)
  could report dismissal for the batch summary in `sync_service.rs:120-141`;
  not needed today.
- Nuxt UI 4.12.0 `App` forwards `nonce`; `src/app.vue:2` uses `<UApp>`. If dev
  nonce handling (`nuxt.config.ts:40`, `TAURI_DEV_NONCE`) needs a Nuxt UI-side
  hook, this is the supported prop [notes: "App: forward `nonce` prop"].
- Vitest 5.0.4 enabled `fsModuleCache` by default; confirm the CI cache and the
  JUnit artifact path (`.github/workflows/desktop-checks.yml:28`) are unaffected.
- `Updater::restore_update` / `Update::verify` (updater 2.14.0) could replace the
  hand-rolled flow in `updater_fixture.rs` if the fixture is simplified later.
- Single-instance 2.5.4 `|`-argument fix and invalid-Unicode argument handling
  (2.5.3, in base) support the `--autostart` handling in `window_lifecycle`;
  no change needed.

## Unchanged notable dependencies and held majors

| Item | Version | Status |
| --- | --- | --- |
| `keyring` | `=3.6.3` pinned, features `apple-native`, `windows-native`, `sync-secret-service`, `crypto-rust` | Held. [4.2.0](https://github.com/open-source-cooperative/keyring-rs/releases/tag/v4.2.0) is the latest stable; a trial resolution failed because 4.x does not provide the `apple-native` feature (its features are named `*-keyring-store`). Migration needs a separate change. Restored to 3.6.3. |
| `typescript` | `^5.9.3` | Held (see Recommended changes). Latest 7.0.2. |
| `@types/node` | `^22.20.5` | Held on 22 by design. Latest 26.6.5. |
| `tauri` 3.x | alpha only (`tauri-v3.0.0-alpha.5`, 2026-10-14) | Not considered; [releases](https://github.com/tauri-apps/tauri/releases). |
| `reqwest` | 0.13.5 | Unchanged; latest stable on crates.io. |
| `wry` / `tao` | 0.57.0 / 0.37.1 | Unchanged. |
| `notify` 8.2.0, `cap-std` 4.0.3, `minisign-verify` 0.3.0, `same-file`, `dunce`, `tempfile`, `chrono`, `serde`, `base64` 0.23.1, `log`, `httpdate` | — | Unchanged; at latest stable per crates.io when checked. |
| `tauri-plugin-autostart` 2.7.0, `-process` 2.4.0, `-os` 2.4.0, `-log` 2.10.1 | — | Unchanged; at latest stable per crates.io when checked (os/process/autostart/log). |
| `@nuxt/eslint` 1.17.0, `vue-router` 5.4.0, `vue-tsc` 3.3.13, `tailwindcss`/`@tailwindcss/vite` 4.3.3, `@vitejs/plugin-vue` 6.0.10, `@vue/test-utils` 2.5.1, `autoprefixer` 10.6.1, `dayjs` 1.11.23, `@iconify-json/heroicons` 1.2.3, `@tauri-apps/plugin-os`/`-process` 2.4.0 | — | Unchanged; equal to the latest-candidate list. |
| `zbus` (5.19.0, 4.4.0), `zvariant` 5.x | — | zbus 6.0.0 exists and `zvariant` is now deprecated into it; follows `keyring`/Tauri's secret-service and tray stacks, not a direct dependency. |

Toolchain pins are unchanged: Node 22.22.3, Rust 1.97.1, crate MSRV 1.90.

## Verified facts and assumptions

Verified (read from files or upstream pages):
- Old/new versions in the tables above, from git objects and the working tree.
- Release-note statements marked [notes] were read from the linked pages.
- The lucide and heroicons icon names listed in `nuxt.config.ts` (`icon.clientBundle.icons`)
  all exist in the upstream `lucide.json` / `heroicons.json` at the default branch.
- TypeScript 7.0.2 trial failed typecheck as logged (supplied by maintainer).
- `zip` 4.6.1 is only depended on by `tauri-plugin-updater` in `Cargo.lock`.
- The lucide icon-data diff above was computed from the two published npm tarballs.

Assumptions / inference (marked [inference] above): how each note applies to
this repository; reachability of any advisory; Nuxt UI palette-plugin filter
still matching across platforms; Linux single-instance runtime behavior
(source-verified, not executed locally).

## Inspected files

`AGENTS.md`; `Cargo.toml`; `Cargo.lock` (old and new); `apps/desktop/package.json`,
`package-lock.json` (old, via git); `apps/desktop/src-tauri/Cargo.toml`;
`src-tauri/src/lib.rs` (notification `on_action`, line 68);
`setup/desktop.rs`; `updater_fixture.rs`; `sync_service.rs`;
`apps/desktop/src/composables/useUpdater.ts`; `src/app.vue`;
`apps/desktop/nuxt.config.ts`; `vitest.config.ts`; `tsconfig.json`;
`tests/e2e/smoke.spec.ts` (route usage); `.github/workflows/desktop-checks.yml`;
the previous `docs/dependency-review.md` (replaced).

## Research gaps

Changelog coverage is complete for every changed package: each has either a
release/CHANGELOG entry or a named compare/source/tarball page cited above. What
remains:

- `marketing/` is not part of this dependency update (no lock change). It was
  scanned separately; see [Marketing site scan](#marketing-site-scan).
- Packages with no authored release notes (coverage is commit/compare level
  only): `schannel` 0.1.30, `num_threads` 0.1.8, `equivalent` 1.0.3, `deranged`
  0.5.9, `bare-url` 2.5.5, `@tiptap/y-tiptap` 3.0.10, `@iconify-json/lucide`
  1.2.145 (verified by tarball diff instead), `static_vcruntime` 3.0.0 (new
  crate; source and tag only), and `dom-selector` 10.0.1 / `10.0.4`
  (bodies list one PR title each).
- Vue 3.5.44, Nuxt 4.6.2, Nuxt UI 4.12.0, Reka UI 2.11.0 and Vitest were read from
  their release lists, not commit by commit.
- The jsdom 30.1.3 notes list no explicit breaking change, but their
  `getComputedStyle()` fixes change computed values; effects on
  `tests/unit/*` were not examined.
- cssnano 9.8–9.9 output changes are not determined from the notes; the local
  production generate, browser smoke and native smoke passed with no CSP errors.
- Windows/Linux/Intel-macOS behavior of every upgrade (aws-lc-sys C build,
  `static_vcruntime`, single-instance, notification D-Bus) depends on the hosted
  CI matrix, which has not run.
- Signed updater installation and real OS credential stores were never exercised.

## Marketing site scan

Not a dependency update here (`marketing/` locks are unchanged). Scanned
alongside for exposure: `release-assets.mjs`, `useDownloads`, config and static
pages. The API token is a request header and is not serialized; the `v-html`
content is static and trusted. Its 6 release-asset tests pass. `npm audit`
(`/tmp/wowthing-marketing-audit.json`) reports 12 package findings (10 high,
2 critical), including an old `simple-git` chain. No exploit path was
established. A separate site lock remediation remains an opportunity.

## Filed issues (not fixed here)

- [#67](https://github.com/calebsmithdev/wowthing-sync/issues/67): accumulated
  upload history can exceed the 1 MiB settings load limit and block restart.
- [#68](https://github.com/calebsmithdev/wowthing-sync/issues/68): failures for
  removed accounts are retained.

## Validation results

Stable code `9096ca1` (only this document changed afterward). macOS ARM64,
Node 22.22.3, Rust 1.97.1 (pins unchanged). Per-check log:
`/tmp/wowthing-final-*.log`, summary `/tmp/wowthing-final-validation.json`.

| Check | Command | Result |
| --- | --- | --- |
| Install | `npm ci --prefix apps/desktop --include=dev` | pass |
| Lint, typecheck | `npm run --prefix apps/desktop lint` / `typecheck` | pass |
| Frontend unit | `npm run --prefix apps/desktop test:unit` | 63 tests, 13 files pass |
| Generate | `npm run --prefix apps/desktop generate` | pass |
| Rust format, lint | `cargo fmt --all -- --check`; `cargo clippy --locked --all-targets -- -D warnings` | pass |
| Rust tests | `cargo test --locked` | 61 pass, 1 ignored (endurance) |
| Rust check | `cargo check --locked` | pass |
| Script tests | `node --test scripts/*.test.mjs` | 31 pass, 3 skipped (2 Linux AppDir, 1 RPM) |
| Release metadata | `node scripts/release-metadata.mjs verify` | pass |
| Browser smoke | `npm run --prefix apps/desktop test:e2e` | 3 pass |
| Native smoke | `npm run --prefix apps/desktop test:native` | pass, `errors:[]` |
| Native integration | `npm run --prefix apps/desktop test:integration` | pass, `errors:[]` |
| Debug build | `npm run --prefix apps/desktop tauri -- build --debug --no-bundle -- --locked` | pass |
| Outdated | `npm outdated` | only `typescript` and `@types/node` (held) |

Failure trials (not in the final diff):

- TypeScript 7.0.2: `nuxt typecheck` failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`
  for `./lib/tsc`; reverted.
- `keyring` 4.2: dependency resolution failed because the `apple-native` feature
  is absent; restored that package to 3.6.3.
- npm resolver recovery: a temporary npm 11 normalize, an npm 10 lock-only
  install, then a pinned clean `npm ci` passed.

Audits: full `cargo audit` completed with exit 1 and 3 findings (`zip` 4.6.1)
plus `proc-macro-error`/`glib` warnings, no yanked warning. Desktop `npm audit`
(full and production): 12 package findings (11 high, 1 low), 3 underlying
advisories.

Not run: hosted Windows, Linux and Intel macOS CI; signed updater install;
OS credential stores. No normal app was launched; no CI-green claim is made.
