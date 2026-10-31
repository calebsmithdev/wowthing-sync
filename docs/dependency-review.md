# Dependency review — 2026-10-31

Weekly maintenance changelog review. Base: `origin/main` @ `d42156d` (v1.1.3).
Stable code under review: `27b3f64`. Only this report changed after that commit.
App version stays 1.1.3; Node 22.22.3 and Rust 1.97.1 pins are unchanged.

**Validation:** every requested local check passed on `27b3f64` (macOS ARM64 only);
see [Validation results](#validation-results). Hosted Windows, Linux and Intel macOS
results are not claimed here.

Labels used below: **[notes]** = stated in the cited release notes or changelog.
**[inference]** = how a note applies to this repository; not stated upstream.

## Rust: direct dependency changes

Every changed minimum in `apps/desktop/src-tauri/Cargo.toml`, plus the lock-only
Tauri plugin moves. Minimums equal lock versions.

| Crate | Old → new | Source |
| --- | --- | --- |
| `tauri` | 2.12.4 → 2.12.5 | [CHANGELOG](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri/CHANGELOG.md) |
| `tauri-build` (build-dep) | 2.7.3 → 2.7.4 | [CHANGELOG](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-build/CHANGELOG.md) |
| `tauri-plugin-dialog` | 2.8.3 → 2.8.4 | [CHANGELOG](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/dialog/CHANGELOG.md) |
| `tauri-plugin-notification` | 2.7.0 → 2.8.0 | [CHANGELOG](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/notification/CHANGELOG.md) |
| `tauri-plugin-single-instance` | 2.5.4 → 2.5.5 | [CHANGELOG](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/single-instance/CHANGELOG.md) |
| `tauri-plugin-updater` | 2.14.0 → 2.14.1 | [CHANGELOG](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/updater/CHANGELOG.md) |
| `notify` | 8.2.0 → 8.2.1 | [release](https://github.com/notify-rs/notify/releases/tag/notify-8.2.1) |
| `tokio` | 1.53.3 → 1.54.1 | [CHANGELOG](https://github.com/tokio-rs/tokio/blob/master/tokio/CHANGELOG.md) |
| `log` | 0.4.34 → 0.4.35 | [repository](https://github.com/rust-lang/log); changelog not retrieved, see [Research gaps](#research-gaps) |

## Rust: transitive changes (all lock changes)

`Cargo.lock` has 68 package-level changes.

| Group | Changes | Source |
| --- | --- | --- |
| Tauri core | `tauri-codegen`, `tauri-macros` 2.7.3→2.7.4; `tauri-runtime-wry` 2.12.2→2.12.3; `tauri-winres` 0.3.6→0.3.7 | [`crates/*`](https://github.com/tauri-apps/tauri/tree/dev/crates) |
| Webview/window | `wry` 0.57.0→0.57.1; `tao` 0.37.1→0.37.2 | [wry](https://github.com/tauri-apps/wry/blob/dev/CHANGELOG.md), [tao](https://github.com/tauri-apps/tao/blob/dev/CHANGELOG.md) |
| Updater/archive | `zip` 4.6.1→**9.1.3** (major); new `typed-path` 0.13.0, `utf_types` 1.0.0; removed `arbitrary`, `derive_arbitrary` | [zip CHANGELOG](https://github.com/zip-rs/zip2/blob/master/CHANGELOG.md) |
| Dialog | `rfd` 0.16.0→0.17.2 | [CHANGELOG](https://github.com/PolyMeilex/rfd/blob/master/CHANGELOG.md) |
| File watching | `notify-types` 2.1.0→2.2.0; new `objc2-core-services` 0.3.2; removed `fsevent-sys` | notify 8.2.1 release |
| TLS | `aws-lc-rs` 1.18.2→1.19.0; `aws-lc-sys` 0.46.0→0.47.0; `rustls-webpki` 0.103.15→0.103.16; `webpki-root-certs` 1.0.9→1.0.11; `openssl-probe` 0.2.1→0.2.2 | [aws-lc-rs](https://github.com/aws/aws-lc-rs/releases/tag/v1.19.0), [webpki](https://github.com/rustls/webpki/releases/tag/v/0.103.16) |
| Compression/image (build-time via `tauri-codegen`) | `brotli` 9.0.0→9.1.1; `brotli-decompressor` 6.0.1→6.2.0; `ico` 0.5.0→0.6.0; removed `png` 0.17.16 | [brotli](https://github.com/dropbox/rust-brotli), [ico](https://github.com/mdsteele/rust-ico) |
| ICU/Unicode | `icu_*` 2.3→2.4; `tinystr`, `utf8_iter`, `yoke`, `zcheapstr`, `zerovec`, `zerovec-derive` patch/minor | [ICU4X 2.4](https://github.com/unicode-org/icu4x/releases/tag/icu%402.4.0) |
| Wasm bindings | `wasm-bindgen*` 0.2.129→0.2.130; `js-sys`, `web-sys` 0.3.106→0.3.107; `wasm-bindgen-futures` 0.4.79→0.4.80 | Not used by the desktop targets [inference] |
| Misc | `base64` 0.22.1 and `rand` 0.9.5 (+`rand_chacha`, `rand_core`) removed as duplicates; `cc`, `crc32fast`, `encoding_rs`, `erased-serde`, `find-msvc-tools`, `open` 5.4.5, `plist` 1.10.3, `rustix` 1.1.6, `smallvec`, `uuid` 1.29.0, `xattr` 1.7.0 | [open](https://github.com/Byron/open-rs/releases/tag/v5.4.5), [uuid](https://github.com/uuid-rs/uuid/releases/tag/v1.29.0), [xattr](https://github.com/Stebalien/xattr/releases/tag/v1.7.0) |

### Notes by crate

- **tauri 2.12.5 / tauri-cli 2.12.4** [notes]: NSIS installers now block downgrades
  over a newer MSI-installed version in silent, passive and update modes when
  `allowDowngrades` is false; `choowHowToInstall` language string renamed; CLI moves to
  `zip` 9 for the three RUSTSEC findings. [inference] No custom NSIS language file or
  `allowDowngrades` setting exists in this repo.
- **tauri-plugin-updater 2.14.1** [notes]: `zip` 9; `Error::Extract` now wraps `zip` 9's
  `ZipError` on Windows; `base64` 0.23. [inference] This closes the three advisories
  listed in the previous review. App code never matches `Error::Extract`.
- **zip 9.x** [notes]: extraction hardening, including not following symlinks during
  file creation (9.1.2) and `FILE_FLAG_OPEN_REPARSE_POINT` truncation protection
  (9.1.3); ZIP64 overflow rejection and large-symlink OOM fixes (9.0.0). The 7.0.0
  breaking section removes feature flags only.
- **notify 8.2.1** [notes]: MSRV 1.85; macOS moves from `fsevent-sys` to `objc2`
  bindings; FSEvents stream startup errors now propagate from `watch`; inotify cleans
  up deleted paths; `FsEventWatcher` no longer crashes unwatching an empty path.
- **tauri-plugin-single-instance 2.5.5** [notes]: the lock is released in
  `cleanup_before_exit` instead of on `RunEvent::Exit`; Windows race fixed where a
  secondary instance could fail to exit if `FindWindowW` missed the event window.
- **tokio 1.54.0/1.54.1** [notes]: MSRV 1.85; zero-capacity constructors now panic;
  timer and scheduler fixes. 1.54.1 reverts "remove the runtime handle from timers".
  [inference] The app enables only `macros`, `time`, `rt`.
- **wry 0.57.1** [notes]: macOS activates only when a new webview is both visible and
  focused; macOS drag-path panic fixed; Linux download-state isolation.
- **tao 0.37.2** [notes]: macOS abort on non-file drags fixed; macOS Objective-C
  callbacks are `extern "C-unwind"`; macOS memory growth from window churn fixed;
  Linux null-display undefined behavior fixed.
- **rfd 0.17.x** [notes]: `tokio` and `async-std` features removed; xdg-portal paths
  are now URL-decoded (0.17.1). [inference] The dialog plugin stays on GTK3.
- **tauri-plugin-notification 2.8.0** [notes]: Android chronometer support, `rand`
  0.10. Nothing desktop-facing.
- **rustls-webpki 0.103.16** [notes]: rejects certificate paths containing a small set
  of distrusted intermediate public keys.
- **aws-lc-rs 1.19.0 / aws-lc-sys 0.47.0** [notes]: new APIs; bundles AWS-LC 5.12.0.
  [inference] C build; hosted Windows/Linux compilers are the first real test.
- **open 5.4.5** [notes]: `that_detached` observes each launcher for 250 ms, so a
  launcher that fails immediately falls through to the next one. [inference] Reaches
  this app through the opener plugin; About links and Open Logs Folder may return
  slightly later but should fail less often.

## npm: direct dependency changes (`apps/desktop/package.json`)

| Package | Old → new | Source |
| --- | --- | --- |
| `typescript` | 5.9.3 → **6.0.3** (major) | [announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/), [v6.0.3](https://github.com/microsoft/TypeScript/releases/tag/v6.0.3) |
| `nuxt` | 4.6.2 → 4.6.3 | [release](https://github.com/nuxt/nuxt/releases/tag/v4.6.3) |
| `eslint` | 10.13.0 → 10.14.0 | [release](https://github.com/eslint/eslint/releases/tag/v10.14.0) |
| `vue-tsc` | 3.3.13 → 3.3.14 | [CHANGELOG](https://github.com/vuejs/language-tools/blob/master/CHANGELOG.md) |
| `postcss` | 8.5.30 → 8.5.32 | [8.5.31](https://github.com/postcss/postcss/releases/tag/8.5.31), [8.5.32](https://github.com/postcss/postcss/releases/tag/8.5.32) |
| `autoprefixer` | 10.6.1 → 10.6.2 | [release](https://github.com/postcss/autoprefixer/releases/tag/10.6.2) |
| `@tauri-apps/cli` | 2.12.3 → 2.12.4 | [CHANGELOG](https://github.com/tauri-apps/tauri/blob/dev/packages/cli/CHANGELOG.md) |
| `@tauri-apps/plugin-dialog` | 2.8.3 → 2.8.4 | Same as the Rust plugin |
| `@tauri-apps/plugin-updater` | 2.14.0 → 2.14.1 | Same as the Rust plugin |
| `@iconify-json/lucide` | 1.2.145 → 1.2.149 | No changelog. Published tarballs diffed: 1966→2078 icons; `archive-restore`, `bold`, `circle-parking-off`, `square-parking-off` became aliases; 19 glyphs redrawn. None of the 16 lucide icons named in `nuxt.config.ts:18` changed. |

## npm: notable transitive changes

The lock has 210 changed, 9 added and 8 removed entries. 51 changes are per-platform
`@rollup/*` (25), `@rolldown/*` (15) and `@tauri-apps/cli-*` (11) binaries that follow
their parent. 37 are `@tiptap/*` packages from Nuxt UI's optional editor stack.

| Package | Old → new | Note | Source |
| --- | --- | --- | --- |
| `nitropack` | 2.13.4 → 2.13.5 | String matchers normalize `\` to `/`; this required the test change below. | [release](https://github.com/nitrojs/nitro/releases/tag/v2.13.5) |
| `vite` | 8.3.4 → 8.3.5 | Chunk import-map and bundled-dev fixes. | [CHANGELOG](https://github.com/vitejs/vite/blob/main/packages/vite/CHANGELOG.md) |
| `rolldown` | 1.2.14 → 1.2.16 | Code-splitting, chunk ordering and tree-shaking fixes; `@oxc-project/types` 0.154→0.156. | [1.2.15](https://github.com/rolldown/rolldown/releases/tag/v1.2.15), [1.2.16](https://github.com/rolldown/rolldown/releases/tag/v1.2.16) |
| `rollup` | 4.64.8 → 4.67.2 | Sourcemap fixes, async-disposal tree-shaking fix, android-x64 build. | [CHANGELOG](https://github.com/rollup/rollup/blob/master/CHANGELOG.md) |
| `@nuxt/icon` | 2.5.1 → 2.6.2 | Client iconify runtime is lazy-loaded; layer-relative custom collection `dir` (not used here). | [2.6.0](https://github.com/nuxt/icon/releases/tag/v2.6.0), [2.6.2](https://github.com/nuxt/icon/releases/tag/v2.6.2) |
| `@nuxtjs/color-mode` | 4.0.1 → 4.1.0 | Non-critical client work deferred until after hydration. | [release](https://github.com/nuxt-modules/color-mode/releases/tag/v4.1.0) |
| `node-forge` | 1.4.0 → 1.4.2 | **[notes]** security release, including an RSA-PKCS signature forgery fix and a PEM ReDoS fix. | [CHANGELOG](https://github.com/digitalbazaar/forge/blob/main/CHANGELOG.md) |
| `undici` | 8.12.2 → 8.12.3 | h2 stalled-connection and pool context fixes. | [release](https://github.com/nodejs/undici/releases/tag/v8.12.3) |
| `h3` | 2.0.2 → 2.0.8 | Server-only fixes. [inference] Not shipped in the SPA. | [releases](https://github.com/h3js/h3/releases) |
| `motion-v` / `framer-motion` / `motion-dom` | 2.6.0 → 2.9.0 / 14.0.0 → 14.7.1 | Nuxt UI animation; Reorder keyboard support and drag fixes. | [2.9.0](https://github.com/motiondivision/motion-vue/releases/tag/v2.9.0) |
| `es-module-lexer` | 2.3.2 → 3.0.4 (+ nested 2.3.2) | **Major.** Tagged-union build records. Used by `impound`; `vite-node`/`vitest` keep nested 2.3.2 [notes for API]. | [3.0.0](https://github.com/guybedford/es-module-lexer/releases/tag/3.0.0) |
| `diff` | 8.0.4 → 9.0.0 | **Major.** Only via `@nuxt/devtools-wizard`; devtools are disabled (`nuxt.config.ts:6`). | [release notes](https://github.com/kpdecker/jsdiff/blob/master/release-notes.md) |
| `image-meta` | 0.2.2 → 0.3.1 | Minor with one flagged change: the largest image of multi-image files is reported. Used by Nuxt tooling [inference]. | [0.3.0](https://github.com/unjs/image-meta/releases/tag/v0.3.0) |
| `serialize-javascript` | 7.1.2 → 7.1.4 | Concise-method serialization fix. | [7.1.4](https://github.com/yahoo/serialize-javascript/releases/tag/v7.1.4) |
| `unstorage`, `crossws`, `srvx`, `unplugin`, `jose`, `@nuxt/devtools` | see lock | Patch/minor, server or dev tooling. | [unstorage](https://github.com/unjs/unstorage/releases/tag/v1.17.6), [crossws](https://github.com/h3js/crossws/releases/tag/v0.4.17), [srvx](https://github.com/h3js/srvx/releases/tag/v1.0.8), [unplugin](https://github.com/unjs/unplugin/releases/tag/v3.7.0), [jose](https://github.com/panva/jose/releases/tag/v6.2.14), [devtools](https://github.com/nuxt/devtools/releases/tag/v3.4.4) |

The six nested `@tailwindcss/oxide-wasm32-wasi/node_modules/*` lock entries are gone.
The parent keeps its bundled dependencies and `cpu: wasm32`, so CI runners don't
install it. All native platform entries are preserved. `npm ci --dry-run` on npm
10.9.8 validated the lock for linux/x64, win32/x64 and both macOS architectures.

`@nuxt/ui` 4.12.0, `vue` 3.5.44, `vitest` 5.0.5, `jsdom` 30.1.3, `@playwright/test`
1.64.1, `tailwindcss` 4.3.3 and `vue-router` 5.4.0 did not change.

## Breaking changes

1. **TypeScript 6.0 (major, adopted).** [notes] Default changes (`types` now `[]`,
   `rootDir` now `.`), plus deprecations of `--baseUrl`, `target: es5`, `outFile`,
   `--moduleResolution node`/`classic` and others. Command-line files alongside a
   `tsconfig.json` are now an error. [inference] `apps/desktop/tsconfig.json:4-10`
   sets `target`, `module`, `strict` and `types` explicitly, and the generated Nuxt
   tsconfig uses `moduleResolution: Bundler` with no `baseUrl`. Lint and typecheck pass.
   A deliberate type error in `src/constants.ts` still failed `nuxt typecheck` with
   `TS2322`, so type checking was not silently disabled.
2. **Nitro 2.13.5 string matcher (test change required, applied).** [verified in
   source] It replaces `\` with `/` before matching, which fixes the hazard
   `scripts/nuxt-runtime.test.mjs` pinned. The test asserted Nitro did **not** inline
   the path and failed with `Cannot read properties of null (reading 'external')`. It
   now asserts `['nuxt/dist']` inlines the Windows path, and a positive control proves
   the fixture reaches the externalization path. Nuxt's shipped `NUXT_DIST_RE` matcher
   is still checked.
3. **zip 4.6.1 → 9.1.3 inside the updater (major, transitive).** [notes] On Windows,
   `Error::Extract` wraps the new `ZipError`. [inference] No repo code matches it, but
   this is the extraction path production Windows updates use and it isn't exercised
   locally or by any automated tier: `tauri.conf.json:40` sets `v1Compatible`, while
   `scripts/updater-install.mjs:49` overrides to `createUpdaterArtifacts: true`. A
   manual release check for this path was added to `docs/ci-validation.md`. The v1.1.3
   `.nsis.zip` is a single Stored entry, and neither lock enables a zip decompressor;
   no failure is expected, but none of this is proof. Because the installed updater
   does the extracting, the first real exposure is the release **after** the next one.
4. **notify 8.2.1 macOS backend replacement.** [notes] A semver patch that replaces
   the FSEvents binding and propagates stream startup errors. [inference]
   `CollectorWatcher::start` (`sync_service.rs:281-315`) falls back to one-second
   polling when `watch` returns an error, so this improves on a watcher that used to
   look healthy. Real-worker tests passed on macOS.
5. **single-instance 2.5.5 lock timing.** [notes] [inference] `lib.rs:101-104` runs
   worker shutdown in `RunEvent::Exit`, and the lock is now released afterwards. A
   launch during shutdown is absorbed by the exiting instance. This is upstream's
   intent and avoids two workers overlapping.

Transitive majors `es-module-lexer` 3 and `diff` 9 are not imported by app code.

## Recommended changes

- **Windows update path, before the next release:** make `scripts/updater-install.mjs`
  use `v1Compatible` on Windows so the harness and production ship the same format.
  This is untested, and needs a hosted Windows run. The manual check is the stopgap.
- **`apps/desktop/nuxt.config.ts:45` `envPrefix: ['VITE_', 'TAURI_']`:** consider removing
  `TAURI_`. No app code reads one through Vite, and no leak exists today: the generated
  output has no env object. It's a latent risk because release builds hold
  `TAURI_SIGNING_PRIVATE_KEY`, and a future bare `import.meta.env` reference could embed
  it. Whether the CLI passes that variable to `beforeBuildCommand` wasn't established.
- **`apps/desktop/tsconfig.json:5`:** `DOM.Iterable` can go; [notes] TS 6's `dom` lib
  includes it.
- **Dev server:** Nuxt 4.6.3 fixes five advisories, including
  [GHSA-x287-wcfc-q46c](https://github.com/nuxt/nuxt/security/advisories/GHSA-x287-wcfc-q46c),
  [GHSA-648h-gw55-m2g7](https://github.com/nuxt/nuxt/security/advisories/GHSA-648h-gw55-m2g7) and
  [GHSA-3xf4-9g3c-4h4w](https://github.com/nuxt/nuxt/security/advisories/GHSA-3xf4-9g3c-4h4w).
  [inference] These matter for `npm run tauri:dev`, which binds to loopback. No action
  beyond taking this update.
- **Audits:** see [Audit results](#audit-results). Don't run `npm audit fix --force`: it
  would downgrade `nuxt` to 4.1.3 and `@vue/test-utils` to 2.4.11.
- **marketing/** isn't part of this update. Its lock audits at 20 package findings
  (2 critical, 3 high, 12 moderate, 3 low); a separate refresh is worthwhile.

## Improvements and opportunities

- `tauri-plugin-updater` `Update::verify` / `Updater::restore_update` (2.14.0) could
  simplify `updater_fixture.rs` if the fixture is reworked.
- tao's macOS window-churn memory fix and wry's focus gating need no change; the window
  is reused rather than recreated.
- TS 6 `es2025` target/lib and `Temporal` types are available if the frontend needs them.
- `aws_lc_rs::try_fips_self_test()` and other aws-lc-rs additions aren't relevant here.
- TS 6's `--stableTypeOrdering` can help compare results when a TS 7 trial is next
  possible [notes].

## Held back

| Item | Version | Status |
| --- | --- | --- |
| `typescript` 7 | latest 7.0.2; staying on `^6.0.3` | **Failed trial.** `nuxt typecheck` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` from `vue-tsc`'s `resolveTscPath` and `eslint` crashes in `typescript-estree`, whose peer range is `<6.1.0`. |
| `keyring` 4 | latest 4.2.0; `=3.6.3` at `Cargo.toml:41` | **Compiles, held for behavior.** The previous reason (missing `apple-native`) no longer applies: default `v1` mode passes `cargo check --all-targets` on macOS with no code change. Held because the source shows (1) `Entry::new` caches store initialization in a `LazyLock`, so an unavailable store stays failed until restart, which conflicts with `credentials.rs` retry guidance and login launches where Secret Service may start late; (2) Linux moves from the sync `dbus-secret-service` backend to `zbus`; (3) upstream directs apps to `keyring-core` instead. Existing keys may still resolve (same `service`/`username` attributes on Linux), but this can't be proved here because real credential stores must not be touched. No advisory requires the move. |
| `@types/node` 26 | `^22.20.5` at `package.json:51` | Held by design to match the Node 22 pin. Latest 26.6.6. |
| `notify` 9 | 9.0.0-rc.7 | Prerelease; not considered. |
| `tauri` 3 | alpha | Not considered. |

Toolchain pins are unchanged.

## Audit results

- **`cargo audit`** (0.22.2, the CI version, 603 dependencies): **0 vulnerabilities**,
  down from 3. The `zip` findings RUSTSEC-2026-0367/0368/0369 are resolved. Warnings:
  `proc-macro-error` unmaintained (RUSTSEC-2024-0370), `glib` 0.18.5 unsound
  (RUSTSEC-2024-0429), and new unmaintained notices for `zbus_names`
  (RUSTSEC-2026-0371), `zvariant` (0370) and `zvariant_derive` (0372), because they
  merged into zbus 6. All arrive through Tauri's Linux stack or `keyring`.
- **`npm audit`** (desktop): **0 critical, 0 high**, 41 moderate and 3 low packages,
  down from 11 high. They trace to 4 advisories. The production set reports the same
  advisories across 19 packages, but npm counts build tooling such as `nitropack` as
  production here; the app ships a static SPA.
  - [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) `glob` AbortSignal bypass (moderate)
  - [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) `minimatch` globparts DoS (moderate)
  - [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) `deepmerge` prototype poisoning (low)
  - [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) `esbuild` Windows dev-server file read (low)

  [inference] All sit in build, lint and dev tooling, and their inputs are repository
  config rather than user data. No separate issue was filed, because no reachable app
  impact was established. The residual risk stays until upstream parents move.

## Filed issues (not fixed here)

- [#74](https://github.com/calebsmithdev/wowthing-sync/issues/74): quitting during an
  upload deadlocks the app (source-verified, not reproduced at runtime).
- [#75](https://github.com/calebsmithdev/wowthing-sync/issues/75): Linux deb/rpm Launch
  at Login shows enabled but never starts the app.
- [#76](https://github.com/calebsmithdev/wowthing-sync/issues/76): Linux deb/rpm installs
  are offered an AppImage update that can never install.
- [#77](https://github.com/calebsmithdev/wowthing-sync/issues/77): publishing a release
  redeploys the marketing site from the tag commit.

## Research gaps

- No authored notes were retrieved for `log` 0.4.35, `brotli` 9.1.x, `ico` 0.6.0,
  `seroval` 1.7.5, `@tanstack/*` or `unrouting` 0.3.x. `rand`/`png` removals and the
  `icu_*`, `wasm-bindgen`, `cc` and similar leaf updates were read at group level only.
  `@tiptap/*` 3.32 notes weren't reviewed; it's an optional editor stack this app doesn't
  use [inference]. `plist` 1.10.3 was read from commit titles.
- Nuxt, Vite and rolldown were read from their release notes, not commit by commit.
- Windows, Linux and Intel macOS behavior of every upgrade depends on hosted CI.
- zip 9 extraction was reviewed by reading source; it hasn't been executed.
- Signed updater installation and real OS credential stores were never exercised.

## Validation results

Stable code `27b3f64`, macOS ARM64, Node 22.22.3, Rust 1.97.1. All steps ran from one
script against the committed tree, which was clean before and after.

| Check | Command | Result |
| --- | --- | --- |
| Install | `npm ci --prefix apps/desktop --include=dev` | pass |
| Lint, typecheck | `npm run --prefix apps/desktop lint` / `typecheck` | pass |
| Frontend unit | `npm run --prefix apps/desktop test:unit` | 65 tests, 13 files pass |
| Generate | `npm run --prefix apps/desktop generate` | pass |
| Rust format, lint | `cargo fmt --all -- --check`; `cargo clippy --locked --all-targets -- -D warnings` (default and `integration-test`) | pass |
| Rust tests | `cargo test --locked` | 77 pass, 1 ignored (endurance) |
| Rust check | `cargo check --locked` | pass |
| Script tests | `node --test scripts/*.test.mjs` | 31 pass, 3 skipped (Linux-only) |
| Release metadata | `node scripts/release-metadata.mjs verify` | pass |
| Browser smoke | `npm run --prefix apps/desktop test:e2e` | 4 pass |
| Native smoke | `npm run --prefix apps/desktop test:native` | pass, `errors:[]` |
| Native integration | `npm run --prefix apps/desktop test:integration` | pass, `errors:[]` |
| Debug build | `npm run --prefix apps/desktop tauri -- build --debug --no-bundle -- --locked` | pass; no normal app launched |
| Outdated | `npm outdated` | only `typescript` and `@types/node` (held) |

Failures found and resolved before the final run:

- **`cargo test --locked` aborted with SIGABRT** on `0dbb8c8`, and also on base
  `d42156d`, so it isn't caused by this update. The T3 Code desktop app sends
  `GET /` probes to new localhost ports, and the mock server's `.unwrap()` panicked on
  a request with no `Content-Length`. `worker_integration.rs` now drops such requests.
  An upload lacking the header would still fail its test, because the client sees an
  error and nothing is recorded.
- **`node --test scripts/*.test.mjs`** failed on `0dbb8c8`: see Breaking changes item 2.

Failure trials, not in the final diff: TypeScript 7.0.2 (see Held back).

Not run: hosted Windows, Linux and Intel macOS CI; signed updater install; OS
credential stores; the production app.
