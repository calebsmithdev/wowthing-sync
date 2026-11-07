# Dependency review — 2026-11-07

Weekly maintenance from `main` at `8d02692`. App version 1.1.3, Node 22.22.3 and
Rust 1.97.1 are unchanged. Only dependency manifests, locks and this report change.
No production app or real credential store was used. Upstream notes are linked
below; repository impact statements are inferences unless supported by a check.

## Breaking changes

- **jsdom 30.1.3 → 31.0.0 (adopted major):** replaces optional `canvas` with
  `@napi-rs/canvas`, replaces CSS/selector/computed-style implementation, and allows
  partially parsed documents while blocking script resources load. CSS serialization
  and computed values can change; `load` fires on window only. Tests use jsdom in
  `apps/desktop/vitest.config.ts:16`, mount Vue components and do not enable canvas
  or load script resources. All 65 tests pass without code changes. Future tests
  loading documents should await DOMContentLoaded after checking readyState.
  [Release notes](https://github.com/jsdom/jsdom/releases/tag/v31.0.0).
- **Playwright 1.64.1 → 1.65.0:** class fields follow useDefineForClassFields;
  actions wait for non-inert targets; accessible names exclude unrendered text;
  cookie matching follows RFC 6265; proxy credentials only answer proxy challenges;
  request params append and JSON content-type handling changes; CSS imports must
  exist; empty sharded runs fail; blob output is cleaned. This repo uses function
  tests and visible locators (`apps/desktop/tests/e2e/smoke.spec.ts:6`), no page-object
  classes, proxy credentials, request params, blob reports or sharding. Node 22
  remains supported (Node 20 no longer tested). Browser smoke results are below.
  [Release notes](https://github.com/microsoft/playwright/blob/v1.65.0/docs/src/release-notes-js.md).
- **Nuxt 4.6.3 → 4.6.4 security patch:** production server errors strip details
  from untrusted errors; Host checks and devServer.allowedHosts expand to webpack
  and rspack; workspace detection only widens to explicit workspaces/git roots;
  encoded slash route matching and Nitro cache/proxy rules change. The app is a
  static SPA (`apps/desktop/nuxt.config.ts:8`) using Vite, loopback development
  (`:65`) and no server cache/proxy rules. Generate/typecheck verify worktree
  discovery. No config migration required here.
  [Release notes](https://github.com/nuxt/nuxt/releases/tag/v4.6.4).

## Recommended changes

- Take Nuxt 4.6.4 / Nitro 2.13.6: upstream calls this a security release fixing
  eight Nuxt and three Nitro advisories. These affect development/build/server
  paths; the shipped frontend is static. Keep loopback binding and strict CSP.
- Take async-executor 1.14.1: fixes a use-after-free during Executor destruction
  introduced in 1.14.0. MIME 0.3.18 removes recursive parsing stack overflow, and
  flate2 1.1.11 fixes decoder progress/flush and incomplete-stream handling. These
  are transitive fixes; they do not establish a reachable vulnerability in this app.
- Keep keyring 3.6.3 pending a deliberate lifecycle migration: tagged 4.2.0 still
  caches store initialization failure in a LazyLock<Result<()>>, so later Entry::new
  cannot recover before restart. This conflicts with retry guidance at
  `apps/desktop/src-tauri/src/credentials.rs:29` and repeated entry creation at `:40`.
  Linux also changes from dbus to zbus. No advisory requires this migration.
  [4.2.0 implementation](https://github.com/open-source-cooperative/keyring-rs/blob/v4.2.0/src/v1.rs),
  [release](https://github.com/open-source-cooperative/keyring-rs/releases/tag/v4.2.0).
- Retain TypeScript 6.0.3. The latest remains 7.0.2, the exact version whose trial
  failed last week in vue-tsc (ERR_PACKAGE_PATH_NOT_EXPORTED) and typescript-estree
  (supported range <6.1.0). vue-tsc and the ESLint integration have not changed;
  this run reuses the prior evidence rather than repeating the same failed trial.
  [Prior maintenance evidence](https://github.com/calebsmithdev/wowthing-sync/blob/8d02692/docs/dependency-review.md#held-back).
- Keep @types/node 22.20.5 aligned with the Node 22 pin; latest 26.6.6 is intentionally
  held. Prerelease Tauri 3 / notify 9 are not adopted. No toolchain bump is required.

## Improvements / opportunities

- Vue 3.5.45 fixes Suspense disposal, async component cleanup and out-in transition
  handling, and avoids unnecessary compiler tsconfig enumeration. The app uses
  out-in page transitions (`apps/desktop/nuxt.config.ts:34`); benefits require no
  app changes. [Changelog](https://github.com/vuejs/core/blob/v3.5.45/CHANGELOG.md).
- Tailwind 4.3.4/4.3.5 improves source/watch handling, CSS @scope preservation,
  color-mix robustness, ignored-directory scans and variant canonicalization.
  The Vite integration is at `apps/desktop/nuxt.config.ts:47`; no custom migration.
  [Changelog](https://github.com/tailwindlabs/tailwindcss/blob/v4.3.5/CHANGELOG.md).
- Vitest 5.1 adds --last-failed / --since-last-run, fake timers for node:timers,
  per-attempt results and faster reused workers. Use --last-failed for local
  diagnosis; keep full suites in CI. Its browser default port change does not
  affect this repo's jsdom environment (`apps/desktop/vitest.config.ts:16`).
  [Release notes](https://github.com/vitest-dev/vitest/releases/tag/v5.1.0).
- Playwright's failure-only reporter could reduce CI noise; its exclusive test lock
  could help if future browser tests mutate shared fixture state. No need to change
  the current four-test suite solely for these APIs.
- Lucide adds icons (2078 → 2109). Published icon JSON comparison shows changes to
  `circle-alert` and `triangle-alert`, both bundled in `apps/desktop/nuxt.config.ts:18`
  and used by update/settings/status alerts. No names used here disappeared.
  [Icon-set history](https://github.com/iconify/icon-sets/commits/master/json/lucide.json).
- Rust ZIP parallel extraction APIs belong upstream in the updater; do not add app
  archive handling just to use them. Brotli/CRC/TOML allocation and throughput
  improvements arrive automatically through Tauri's asset/build stack.

## Direct npm updates

| Package | Old → new |
| --- | --- |
| nuxt | 4.6.3 → 4.6.4 |
| vue | 3.5.44 → 3.5.45 |
| tailwindcss, @tailwindcss/vite | 4.3.3 → 4.3.5 |
| @iconify-json/lucide | 1.2.149 → 1.2.152 |
| @playwright/test | 1.64.1 → 1.65.0 |
| vitest | 5.0.5 → 5.1.0 |
| jsdom | 30.1.3 → 31.0.0 |

All direct Rust versions were checked against crates.io's max_stable_version and
are current except held keyring. cargo-outdated failed because it invoked Cargo
1.83.0 internally; the repository toolchain is correctly 1.97.1. npm outdated with
dev dependencies reports only the two documented holds. @nuxt/ui 4.12.0, Tauri core
2.12.5/plugins, wry 0.57.1, tao 0.37.2, reqwest 0.13.5, notify 8.2.1 and cap-std 4.0.3
are unchanged.

## Rust lock updates (all 19 packages)

No adopted Rust update requires an app API/config migration. Brotli C buffers now
require four-byte alignment; this app has no Brotli FFI. UUID deprecates its borsh
feature, which the app does not select. The build entry remains
`apps/desktop/src-tauri/build.rs:12`; updater setup remains `apps/desktop/src-tauri/src/setup/desktop.rs:13`.

| Packages | Old → new | Reviewed notes / source |
| --- | --- | --- |
| async-executor | 1.14.0 → 1.14.1 | Executor-drop use-after-free fix. [Changelog](https://github.com/smol-rs/async-executor/blob/master/CHANGELOG.md) |
| async-lock | 3.4.2 → 3.5.0 | OnceCell::try_set, Semaphore::available_permits; not imported by app. [Release](https://github.com/smol-rs/async-lock/releases/tag/v3.5.0) |
| brotli-decompressor | 6.2.0 → 6.3.0 | Allocation/bit-reader/Huffman performance and C alignment. No authored notes; compare commit messages reviewed. [Compare](https://github.com/dropbox/rust-brotli-decompressor/compare/6.2.0...6.3.0) |
| cc | 1.10.0 → 1.11.1 | CodeView/source remapping and cl.exe/Linux/wasm argument fixes. [1.11.0](https://github.com/rust-lang/cc-rs/releases/tag/cc-v1.11.0), [1.11.1](https://github.com/rust-lang/cc-rs/releases/tag/cc-v1.11.1) |
| crc32fast | 1.5.3 → 1.5.4 | Small-buffer/AArch64/big-endian improvements, SIMD bounds checks. No authored notes; compare messages reviewed. [Compare](https://github.com/srijs/rust-crc32fast/compare/v1.5.3...v1.5.4) |
| flate2 | 1.1.10 → 1.1.11 | Flush/progress, finish/drop and incomplete decoder fixes. [Changelog](https://github.com/rust-lang/flate2-rs/blob/main/CHANGELOG.md) |
| jiff, jiff-static; jiff-core | 0.2.38 → 0.2.39; 0.1.1 → 0.1.2 | Shared notes: out-of-range/large-duration panics, timezone and arithmetic performance. App uses chrono. [Changelog](https://github.com/BurntSushi/jiff/blob/master/CHANGELOG.md) |
| mime | 0.3.17 → 0.3.18 | Iterative parser prevents stack overflow; Unicode parameter equality. No authored notes; compare messages reviewed. [Compare](https://github.com/hyperium/mime/compare/v0.3.17...v0.3.18) |
| smallvec | 1.16.4 → 1.16.5 | CI-only release. [Release](https://github.com/smallvec/smallvec/releases/tag/v1.16.5) |
| toml; toml_edit | 1.1.8 → 1.2.1; 0.25.17 → 0.25.19 | Serialization allocation/string/key improvements, deserializer size_hint. [toml](https://github.com/toml-rs/toml/blob/main/crates/toml/CHANGELOG.md), [toml_edit](https://github.com/toml-rs/toml/blob/main/crates/toml_edit/CHANGELOG.md) |
| serde_spanned; toml_datetime | 1.1.2 → 1.1.3 | Deserializer size_hint performance. [serde_spanned](https://github.com/toml-rs/toml/blob/main/crates/serde_spanned/CHANGELOG.md), [toml_datetime](https://github.com/toml-rs/toml/blob/main/crates/toml_datetime/CHANGELOG.md) |
| toml_writer | 1.1.3 → 1.2.0 | Syntax/string/key writing performance. [Changelog](https://github.com/toml-rs/toml/blob/main/crates/toml_writer/CHANGELOG.md) |
| uuid | 1.29.0 → 1.29.1 | v7 monotonicity, borsh feature deprecation. [Release](https://github.com/uuid-rs/uuid/releases/tag/v1.29.1) |
| winnow | 1.0.4 → 1.0.5 | usize support in hex_uint. [Changelog](https://github.com/winnow-rs/winnow/blob/main/CHANGELOG.md) |
| zip | 9.1.3 → 9.4.1 | Parallel extraction/compression and iterable readers, path allocation reductions, unsupported-compression metadata/iterable length fixes, 9.2.2 feature-build fix. [Changelog](https://github.com/zip-rs/zip2/blob/master/CHANGELOG.md) |

## npm transitive updates

213 changed npm lock entries, grouped by monorepo/platform package. The lock also has 16 added and 66 removed entries (including deduplicated/relocated dependencies). Primary release/CHANGELOG files and repository usage were reviewed. `[notes]` below means upstream statement; `[inference]` means application to this repo. This is research, not proof of runtime behavior.

### Breaking changes

- **Archiver 8 / zip-stream 7 / compress-commons 7 / crc32-stream 7**: [notes] ESM and Node >=18; crc32-stream 7.0.1 fixes ESM export; later archive subpackage patches mainly update dependencies/publishing. [inference] Introduced by Nitro 2.13.6, no direct repo imports. Node22.22.3 and `type:module` satisfy the runtime requirement (`apps/desktop/package.json:3-6`); generate/script tests exercise Nitro integration. Sources: [archiver8](https://github.com/archiverjs/node-archiver/releases/tag/8.0.0), [compress7](https://github.com/archiverjs/node-compress-commons/releases/tag/7.0.0), [crc32-stream7](https://github.com/archiverjs/node-crc32-stream/releases/tag/7.0.0), [zip-stream7](https://github.com/archiverjs/node-zip-stream/releases/tag/7.0.0).
- **is-stream 2→4** (inside compress-commons): [notes] pure ESM since3; Node18 since4; isStream also checks closed streams. [inference] Parent takes compatible version, no repo callsite. [v3](https://github.com/sindresorhus/is-stream/releases/tag/v3.0.0), [v4](https://github.com/sindresorhus/is-stream/releases/tag/v4.0.0).
- **readdir-glob 1→3**: [notes] v2 adds TS/ESM+CJS, drops Node10-specific code and updates minimatch5→9; v3 minimatch10, tsdown packaging and default ESM export. [inference] Internal Archiver dependency, no direct repo callsite. [v2](https://github.com/Yqnn/node-readdir-glob/releases/tag/v2.0.0), [v3](https://github.com/Yqnn/node-readdir-glob/releases/tag/v3.0.0).
- **entities8→9 via parse5**: [notes] streaming EntityDecoder split into HtmlEntityDecoder/XmlEntityDecoder; decode-table exports removed; numeric encodings become decimal/shorter aliases; `<`/`>` escaped in attributes; getCodePoint removed. Synchronous decoders unchanged. [inference] parse5 8.1.0 explicitly adopts this API, and repo does not import entities directly. Changes HTML parsing/serialization tooling/test fixtures; frontend tests and generate are the relevant checks. [entities9](https://github.com/fb55/entities/releases/tag/v9.0.0), [parse5](https://github.com/inikulin/parse5/releases/tag/v8.1.0).
- **Tiptap3.33 / y-tiptap3.2**: [notes] collaboration with enableContentCheck now pauses/emits contentError instead of deleting invalid shared content; persistent-position migration removed in3.32.3, older clients must upgrade together. [inference] Optional Nuxt UI editor stack; app has no editor or collaboration import, so no migration currently. [3.32.3](https://github.com/ueberdosis/tiptap/releases/tag/v3.32.3), [3.33](https://github.com/ueberdosis/tiptap/releases/tag/v3.33.0).
- **seroval1.7.6–9**: [notes] built-ins read via prototype getters; spoofed constructor no longer selects serialization class; objects inheriting a built-in prototype without internal slots rejected. [inference] Nuxt build serialization dependency, no direct app calls. [1.7.6](https://github.com/lxsmnsyc/seroval/releases/tag/seroval%401.7.6), [1.7.7](https://github.com/lxsmnsyc/seroval/releases/tag/seroval%401.7.7).
- **my-bad0.2.12**: [notes] channel callers default to loopback-only trust; headerless requests also check Host; OS-open fallback restricted to common text/source files; report snippets require module file/scheme; strips ANSI. [inference] Nuxt error tooling; local dev server is loopback (`apps/desktop/nuxt.config.ts:65-67`), no direct use. Preserve loopback/host controls. [release](https://github.com/danielroe/my-bad/releases/tag/v0.2.12).
- **Rollup4.68**: [notes] dynamic chunks for index.js now use directory name. [inference] Asset filenames can change; do not hardcode generated chunk names. Existing generated static asset smoke is appropriate. [CHANGELOG](https://github.com/rollup/rollup/blob/master/CHANGELOG.md).

### Recommended changes

- Take **Nitro2.13.6**: [notes] fixes cache sharing across HTTP methods/replaying Set-Cookie; proxy scope bypass; wildcard redirect backslash/control open redirect. Cache now only GET/HEAD, excludes private/no-store and cookie responses. [inference] Static SPA (`nuxt.config.ts:8`), no cache/proxy rules, so no shipped server fix required; still hardens build/dev tooling. [release/advisory links](https://github.com/nitrojs/nitro/releases/tag/v2.13.6).
- Take **undici8.12.4**: [notes] six vulnerabilities fixed: redirected cache policy/credential leakage, cross-origin revalidation, tuple-header credential stripping, cache handler exceptions, SRI whitespace. [inference] Node tooling dependency, Rust reqwest handles application upload; no direct app cache/interceptor use. [release](https://github.com/nodejs/undici/releases/tag/v8.12.4).
- Take **node-forge1.4.3**: [notes] X509 nameConstraints validation flaw, TLS client crashes, HTTP header ReDoS and other TLS issues fixed. [inference] Nitro tooling chain, no app crypto use. [CHANGELOG](https://github.com/digitalbazaar/forge/blob/main/CHANGELOG.md).
- Take **my-bad0.2.12**, **seroval1.7.8/9**: [notes] former fixes report-triggered file read/trust/control characters; latter hardens strings, stream errors and decoding limits. [inference] No custom integration changes needed. [my-bad](https://github.com/danielroe/my-bad/releases/tag/v0.2.12), [seroval1.7.8](https://github.com/lxsmnsyc/seroval/releases/tag/seroval%401.7.8), [1.7.9](https://github.com/lxsmnsyc/seroval/releases/tag/seroval%401.7.9).
- **jose6.2.15** [notes] cancels decompression on output limit, rejects negative JWKS cache durations/clockTolerance. [inference] No direct app usage/config. [CHANGELOG](https://github.com/panva/jose/blob/main/CHANGELOG.md).
- **ESLint regexp3.3.3** [notes] fixes semantic-changing autofix around lookaround quantifiers. [inference] Safer lint autofix, no rule config change. [CHANGELOG](https://github.com/ota-meshi/eslint-plugin-regexp/blob/master/CHANGELOG.md).

### Improvements / opportunities and other reviewed groups

| Changed packages | Upstream notes and repo implication | Primary source |
|---|---|---|
| vite8.3.6 | Overlapping plugin-close waits, queried dynamic-import CSS dependencies, stable chunk-map hashes, bundled-dev reload/Node imports and ANSI escaping. No config migration listed; generate and dev fixture should cover. | [CHANGELOG](https://github.com/vitejs/vite/blob/main/packages/vite/CHANGELOG.md) |
| rollup4.67.3–4.68 + all @rollup platform binaries | Older Xeon compatibility, sourcemap/hash fixes, dynamic shared-edge merge fix, namespace member tree shaking and sourcemap cache. Potential smaller bundles without code changes. | [CHANGELOG](https://github.com/rollup/rollup/blob/master/CHANGELOG.md) |
| lightningcss1.33 + all platform binaries | New ::highlight, @position-try, search-text, relative alpha() color support; preserves unknown at-rule placement; negative scientific dimension fix. Keep current browser target; syntax support does not prove old webview runtime support. | [release](https://github.com/parcel-bundler/lightningcss/releases/tag/v1.33.0) |
| motion-v2.10–2.11.1 / motion-dom+framer-motion14.8–14.9.1 | layoutAnchor forwarding, MotionConfig skipAnimations propagation, hidden/remounted presence fixes, roving Reorder focus; WebKit accelerated-animation cleanup. Opportunity: use skipAnimations for reduced-motion if adding direct Motion components. No direct repo Motion imports presently. | [Vue CHANGELOG](https://github.com/motiondivision/motion-vue/blob/master/CHANGELOG.md), [core CHANGELOG](https://github.com/motiondivision/motion/blob/main/CHANGELOG.md) |
| @tanstack virtual-core3.19.10/11, vue-virtual3.13.51/52 | Keeps viewport filled after shrink, current measurement offsets and RTL horizontal scrolling. Optional Nuxt UI virtualized controls benefit automatically. | [core3.19.10](https://github.com/TanStack/virtual/releases/tag/%40tanstack%2Fvirtual-core%403.19.10), [3.19.11](https://github.com/TanStack/virtual/releases/tag/%40tanstack%2Fvirtual-core%403.19.11) |
| @tiptap all3.32.3→3.33, y-tiptap3.2 | Nested clearNodes, resizable cleanup, IME menu updates, defaultProtocol paste, shadow-root remount cursor, placeholder cleanup; collaboration changes above. Not used by app. | [3.32.3](https://github.com/ueberdosis/tiptap/releases/tag/v3.32.3), [3.33](https://github.com/ueberdosis/tiptap/releases/tag/v3.33.0) |
| Babel7.29.13 family; nested Babel parser/types8.1 | TS/parser/generator correctness incl optional-call receiver, static private fields/decorators, global shadowing; 8.1 parsing proposals/imports. No direct Babel config in app. v7.29.13 release notes cover changed helpers/core/parser/traverse. | [7.29.13](https://github.com/babel/babel/releases/tag/v7.29.13), [8.1](https://github.com/babel/babel/releases/tag/v8.1.0) |
| @nuxt/cli4.0.2/3 | Honors Vite allowedHosts; preserves hints; Windows package-manager version read without shell args. Relevant to tauri dev wrapper, no config change needed for existing loopback. | [4.0.2](https://github.com/nuxt/cli/releases/tag/v4.0.2), [4.0.3](https://github.com/nuxt/cli/releases/tag/v4.0.3) |
| @vercel/nft1.11.1 | Avoids quadratic analysis on large files; Nitro tooling. | [release](https://github.com/vercel/nft/releases/tag/1.11.1) |
| unrs-resolver1.13 + all @unrs native bindings | Runtime rather than postinstall binding resolution, package maps, tsconfig path/config/ownership fixes. Ensure npm ci installs native bindings on CI matrix; do not add a workaround without failure. | [CHANGELOG](https://github.com/unrs/unrs-resolver/blob/main/CHANGELOG.md) |
| napi-postinstall0.3.8 | Releases redirected/non-200 sockets so installer can exit. | [CHANGELOG](https://github.com/un-ts/napi-postinstall/blob/main/CHANGELOG.md) |
| eslint-plugin-import-x4.18 | extension fixes/options, no-duplicates whitelist and import rule enhancements. Optional config additions only. | [CHANGELOG](https://github.com/un-ts/eslint-plugin-import-x/blob/master/CHANGELOG.md) |
| vue-eslint-parser10.4.2 | Finds eslint-scope nested under user eslint, AST value export type correction. | [release](https://github.com/vuejs/vue-eslint-parser/releases/tag/v10.4.2) |
| jsdoc-type-pratt-parser9.5 | jsdocContext option for hyphens in namepaths. | [CHANGELOG](https://github.com/jsdoc-type-pratt-parser/jsdoc-type-pratt-parser/blob/main/CHANGELOG.md) |
| enhanced-resolve5.26.1 | @types/node26 filesystem compatibility; no Node pin change needed. | [CHANGELOG](https://github.com/webpack/enhanced-resolve/blob/main/CHANGELOG.md) |
| ansis4.5 | Piped COLORTERM no longer forces ANSI; FORCE_COLOR remains explicit override. Better persisted logs. | [CHANGELOG](https://github.com/webdiscus/ansis/blob/master/CHANGELOG.md) |
| semver7.8.6 | Faster range parsing. | [CHANGELOG](https://github.com/npm/node-semver/blob/main/CHANGELOG.md) |
| builtin-modules5.5, is-core-module2.18, globals17.14 | Node27 module table/global-data updates; no requirement to upgrade runtime. | [builtin](https://github.com/sindresorhus/builtin-modules/releases/tag/v5.5.0), [core](https://github.com/inspect-js/is-core-module/blob/main/CHANGELOG.md), [globals](https://github.com/sindresorhus/globals/releases/tag/v17.14.0) |
| rollup-plugin-visualizer7.1.2 | Faster report generation, repaired dependency links. | [CHANGELOG](https://github.com/btd/rollup-plugin-visualizer/blob/master/CHANGELOG.md) |
| unrouting0.3.2 | Avoids catchall+suffix backtracking, required by Nuxt security release. | [release](https://github.com/unjs/unrouting/releases/tag/v0.3.2) |
| vue-bundle-renderer2.5 | prefetch resource-hint option, import-cycle consistency; no manual hint setup here. | [release](https://github.com/nuxt-contrib/vue-bundle-renderer/releases/tag/v2.5.0) |
| ws8.22.1 | IPC URL paths no longer truncated at colon. Tauri IPC does not use Node ws. | [release](https://github.com/websockets/ws/releases/tag/8.22.1) |
| devframe + @devframes/agentic1.3.1/2 | MCP prompt route options, sidebar toggle/aria fixes, root-base fallthrough, local initial snapshots. Devtools disabled at nuxt.config.ts:6; no app feature opportunity. | [1.3.1](https://github.com/devframes/devframe/releases/tag/v1.3.1), [1.3.2](https://github.com/devframes/devframe/releases/tag/v1.3.2) |
| vite-plugin-vue-tracer1.7 | Dock inspector toggles; devtools disabled. | [release](https://github.com/antfu/vite-plugin-vue-tracer/releases/tag/v1.7.0) |
| ast-kit3.0.1 | Upstream says no significant changes. | [release](https://github.com/sxzz/ast-kit/releases/tag/v3.0.1) |
| parse5 8.1 | Element creation context, tokenizer flushing, CR/end-tag parsing fixes, faster slices, entities9 adoption. | [release](https://github.com/inikulin/parse5/releases/tag/v8.1.0) |

### Additional sources

- **tough-cookie6.1.0**: [notes] rejects Secure cookies set over untrustworthy origins; loopback/localhost remain accepted by default. `__Host-` needs explicit Path=/; Cookie.validate validates token names; SameSite=None serializes explicitly; IPv4 Domain accepted; synchronous APIs accept URL. [inference] Through jsdom/test tooling; no app CookieJar calls. Do not opt out unless a test specifically needs insecure cookie simulation. [release](https://github.com/salesforce/tough-cookie/releases/tag/v6.1.0).
- **ProseMirror changeset2.4.6 / transform1.12.5 / view1.42.9**: packaged upstream CHANGELOGs read. Respectively fix large-change diff crash; ReplaceAroundStep gap mapping and open-slice fitting crashes; Android backspace/composition/focus-selection bugs. [inference] Optional Nuxt UI editor stack not used by app. Sources: [changeset CHANGELOG](https://github.com/ProseMirror/prosemirror-changeset/blob/master/CHANGELOG.md), [transform CHANGELOG](https://github.com/ProseMirror/prosemirror-transform/blob/master/CHANGELOG.md), [view CHANGELOG](https://github.com/ProseMirror/prosemirror-view/blob/master/CHANGELOG.md). Notes were read in npm tarballs because registry now points to code.haverbeke.berlin.
- **semver6.3.2**: exact release read; backports v7 range parsing performance fix. [release](https://github.com/npm/node-semver/releases/tag/v6.3.2).

### Source comparisons

No authored notes were available for these items; the statements below come from exact upstream compare commit titles or downloaded npm tarballs, not inferred release summaries.

| Package | Read evidence | Result |
|---|---|---|
| bare-url2.5.6 | [exact compare](https://github.com/holepunchto/bare-url/compare/v2.5.5...v2.5.6) | Fix query-string escapes. New bare-buffer3.7.1 is a support dependency; no application URL API changes. |
| baseline-browser-mapping2.11.35 | [exact compare](https://github.com/web-platform-dx/baseline-browser-mapping/compare/v2.11.34...v2.11.35) | Browser/feature data regeneration and static-site update. |
| caniuse-lite1.0.30001823 | [exact compare](https://github.com/browserslist/caniuse-lite/compare/1.0.30001820...1.0.30001823) | caniuse database refresh. |
| electron-to-chromium1.5.478 | [exact compare](https://github.com/Kilian/electron-to-chromium/compare/v1.5.471...v1.5.478) | Generated version updates only in commit titles. |
| emoji-regex8→10.6 | [exact compare](https://github.com/mathiasbynens/emoji-regex/compare/v8.0.0...v10.6.0) | Unicode13→17 support, pattern-generation rewrite, ESM support and corrected CJS types. Transitive text tooling, no app import. |
| node-releases2.0.63 | [exact compare](https://github.com/chicoxyzzy/node-releases/compare/v2.0.62...v2.0.63) | Nightly data sync. |
| resolve1.22.14 | [exact compare](https://github.com/browserify/resolve/compare/v1.22.13...v1.22.14) | is-core-module dependency update, development dependencies. |
| tinybench6.2.3 | [exact compare](https://github.com/tinylibs/tinybench/compare/v6.2.2...v6.2.3) | Large-sample sorting performance plus dependency maintenance. Not evidence that app benchmarks improved. |
| @dxup/nuxt0.5.11 | [scoped tag compare](https://github.com/KazariEX/dxup/compare/%40dxup%2Fnuxt%400.5.10...%40dxup%2Fnuxt%400.5.11) | Stops warning about missing registry when no layout; dependency update adds nested chokidar6. |
| @iconify/vue5.0.5 | [published5.0.4](https://registry.npmjs.org/@iconify/vue/-/vue-5.0.4.tgz), [5.0.5](https://registry.npmjs.org/@iconify/vue/-/vue-5.0.5.tgz) | API rotate delay750→2000ms, timeout5000→10000ms; api2.iconify.design fallback added. Types unchanged. `nuxt.config.ts:16-18` uses local SVG/provider:none; no new network grant needed. |
| @swc/helpers0.5.24 | [published0.5.23](https://registry.npmjs.org/@swc/helpers/-/helpers-0.5.23.tgz), [0.5.24](https://registry.npmjs.org/@swc/helpers/-/helpers-0.5.24.tgz) | **Compatibility change:** `_jsx` index/package export removed. TS helpers embedded instead of imported from tslib; Map/Set fallback fixed to use Array.from(o). Repo source/scripts have no @swc/helpers/_jsx imports. Keep generated-client smoke: no assumption that a patch is behavior-free. |

#### Newly introduced groups

- **Nested chokidar6**: [release](https://github.com/paulmillr/chokidar/releases/tag/6.0.0). Rewrites observation pipeline; native-recursive backend on macOS/Windows; shared handles; Node>=22.22 (existing22.22.3 pin satisfies). `usePolling`, `interval`, `binaryInterval` are deprecated aliases; close is terminal, getWatched null-prototype, options now validated. Repo does not directly call this watcher; it is nested under @dxup/nuxt, while production Rust notify remains unchanged. No config migration required in app.
- **bcp-47 2.1.2 / bcp-47-match2.0.3**: [bcp release](https://github.com/wooorm/bcp-47/releases/tag/2.1.2), [match release](https://github.com/wooorm/bcp-47-match/releases/tag/2.0.3): empty private-use sequence parser fix and improved type documentation. Newly used by jsdom language handling, with is-alphabetical/is-alphanumerical/is-decimal2.0.1 character classifier helpers. No direct app calls.
- **cjs-module-lexer2.3.0**: [release](https://github.com/nodejs/cjs-module-lexer/releases/tag/2.3.0): automatic Wasm init before parsing, parser stack-bound check, UTF16 copies/identifier scanning improvements. No direct app API use.
- **parse5-parser-stream8.1.0**: same [parse5 release](https://github.com/inikulin/parse5/releases/tag/v8.1.0); stream parser supports jsdom31's parsing path; optional flush/create-element context enhancements and tokenizer fixes covered above.
- Six `@tailwindcss/oxide-wasm32-wasi/node_modules/*` entries reappear for bundled dependencies (@emnapi core/runtime/wasi-threads, @napi-rs/wasm-runtime, @tybys/wasm-util, tslib). These are bundled in the updated Tailwind package; versions are the same as previously documented bundle metadata. Their applicability is Tailwind's WASI fallback fixes rather than a native app dependency/API migration.

**Iconify collections:** published tarballs [1.0.758](https://registry.npmjs.org/@iconify/collections/-/collections-1.0.758.tgz) / [1.0.762](https://registry.npmjs.org/@iconify/collections/-/collections-1.0.762.tgz) differ only in package version and collections.json. Collection count255→276 (21 additions, none removed);46 existing collection metadata records refreshed. This is catalog metadata, not an added frontend permission; actual bundled icon glyphs remain governed by the Lucide review above and nuxt.config.ts icon list. No authored changelog exists in the fetched evidence, so state “published metadata compared” in coverage.

## Audit and whole-repository scan

- cargo-audit 0.22.2: **0 vulnerabilities**. RustSec DB commit
  `309392b18f6b17022f82c701f300433126901068` (2026-11-06). Informational warnings:
  proc-macro-error, zbus_names/zvariant/zvariant_derive unmaintained (seven package
  instances), and glib 0.18.5 VariantStrIter unsoundness. No direct VariantStrIter
  use found; these are existing transitive Linux-stack notices.
- Desktop npm audit: **30 package findings, 23 moderate / 7 low, no high or critical**.
  Same four advisory families as last week:
  [glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4),
  [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249),
  [deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4),
  [esbuild](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr).
  They occur in build/test tooling; no new reachable shipped-app exploit was
  verified. No forced audit downgrade was applied.
- Read Rust IPC/settings/credentials, collector path/capability restrictions and
  worker cancellation, Nuxt controllers, capabilities/CSP, scripts/process/package
  supervision and GitHub release/CI workflows. Queried existing issues in all
  states before considering new reports. Verified concerns match existing
  [#74](https://github.com/calebsmithdev/wowthing-sync/issues/74),
  [#75](https://github.com/calebsmithdev/wowthing-sync/issues/75),
  [#76](https://github.com/calebsmithdev/wowthing-sync/issues/76),
  [#77](https://github.com/calebsmithdev/wowthing-sync/issues/77).
  **No new issues created.** This scan is source review, not a penetration test.
- Independent final dependency review found no actionable regression. Manifest/lock
  roots agree; locked npm dependency resolution is complete; declared Node engine
  ranges accept 22.22.3. Removed platform entries were deduplicated to complete
  top-level bindings or removed by upstream; supported native bindings remain.

## Validation results

macOS ARM64, Node 22.22.3, Rust 1.97.1. Dependencies were stable throughout checks;
only this report was assembled afterwards. Local logs are under
`/tmp/wowthing-maintenance-2026-11-07/`.

| Check | Result |
| --- | --- |
| npm ci --prefix apps/desktop --include=dev | pass |
| npm run --prefix apps/desktop lint | pass |
| npm run --prefix apps/desktop typecheck | pass |
| npm run --prefix apps/desktop test:unit | 65 tests, 13 files pass |
| npm run --prefix apps/desktop generate | pass |
| cargo fmt --all -- --check | pass |
| cargo clippy --locked --all-targets -- -D warnings | pass |
| cargo test --locked | 77 pass, 1 ignored endurance test |
| cargo check --locked | pass |
| node --test scripts/*.test.mjs | 31 pass, 3 Linux-only skips |
| node scripts/release-metadata.mjs verify | pass, version 1.1.3 |
| Playwright Chromium install | pass, Chromium 158.0.8127.18 |
| npm run --prefix apps/desktop test:e2e | 4 pass |

Browser screenshots cover light/dark setup, minimum window size, update failure,
settings/dashboard and opener failures. They prove fixture UI behavior in Chromium,
not WKWebView or real OS integration. Windows, Linux and Intel macOS execution,
signed updater installation, real OS credential stores and notification delivery
were not exercised locally.

### Additional native smoke: failed, host-session limitation

The isolated `npm run --prefix apps/desktop test:native` build succeeded, but two
runs failed with the same output:

```text
native-smoke exceeded 45000ms deadline
```

No completion report was produced. The runner confirmed the timed-out process tree
closed. A fresh diagnosis with temporary instrumentation showed window creation,
page Started/Finished at tauri://localhost/, injected JavaScript, DOMContentLoaded
and fixture IPC working; onboarding markup eventually existed. CUA observed a blank
window with no accessibility elements. Its activation result reported
`workspace_frontmost_pid=619 (loginwindow)`, `process_activated=false`, `focused=false`;
all listed applications were inactive. This is evidence that the current host
login session prevents presentation/focus; background WebKit suspension is an
inference, not a proved dependency cause. Native runtime acceptance remains
unverified and needs rerunning in an unlocked interactive macOS session. No
production workaround was added; all diagnostic instrumentation was removed.
This limitation is separate from the requested checks above, which all passed.
