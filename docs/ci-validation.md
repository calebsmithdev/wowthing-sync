# Desktop validation and release evidence

The stable branch-protection check is **Required Desktop CI** in `Desktop CI`.
A repository administrator must add that exact check under Settings → Branches
(or the equivalent ruleset), require an up-to-date branch and include merge-queue
checks if used. YAML cannot change repository protection. No admin settings have
been changed by this work.

The October 7 ruleset inspection found no required status checks in the active
Main ruleset. Add **Required Desktop CI** and require an up-to-date branch;
review the administrator PR bypass if every merge must wait. CI already runs on
PR creation/updates, main pushes and merge groups. A PR run can finish after a
merge when its result is not enforced. Keep the post-merge and release gates to
validate the actual merge commit and release-only signing/package paths.

PRs run frontend lint/type/unit once, then Rust lint/unit/real-worker HTTP tests,
launcher/process contracts, browser fixtures, both native webview fixtures and
unsigned debug package inspection on macOS 15 ARM64/Intel, Windows Server 2022 x64
and Ubuntu 22.04 x64. The aggregate fails on missing, failed, cancelled or skipped
required jobs; frontend failure cannot leave it green. Actions and application
Node/Rust toolchains are pinned; installs use lockfiles.

Linux native checks and shipping packages use Ubuntu 22.04 (glibc 2.35), matching
the AppImageHub retest host. Its standard repositories provide WebKitGTK 4.1;
FUSE uses `libfuse2`, not Ubuntu 24.04's `libfuse2t64`. The Rust cache prefix was
changed to exclude objects linked on the former Ubuntu 24.04 baseline. Frontend,
audit and orchestration-only jobs can still use Ubuntu 24.04.

`scripts/appimage-check.mjs` extracts the shipping AppImage without launching the
application. It validates AppRun, .DirIcon, desktop/icon entries and required
glibc symbol versions in the runtime and every packaged ELF executable/library,
rejecting requirements above 2.35. Both unsigned production/fixture AppDirs use
the same check before the isolated fixture launch. Release builds run the audit
before staging assets and preserve `test-results/appimage-compatibility.json`.
AppImage assets and updater archives/signatures use
`wowthing-sync_<version>_x86_64.AppImage[.tar.gz][.sig]`; the updater platform key
remains `linux-x86_64`. Publish a new version after the checks pass, then request
`/retest` on [AppImageHub PR 9719](https://github.com/AppImage/appimage.github.io/pull/9719).
Existing published artifacts are not rebuilt in place.

The desktop `.npmrc` explicitly sets `legacy-peer-deps=false`. Generate its
lockfile and validate `npm ci` with this setting: a user-level legacy setting can
otherwise omit peer dependencies and hide failures that occur on clean runners.
When checking dependency changes locally, use a fresh checkout without
`node_modules` and run the same `npm ci --prefix apps/desktop` command as CI.

Nightly and release checks additionally build optimized packages, extract/install
them, run the long production-worker test, real scoped credential/autostart probes
and a signed updater installation with a temporary test key and loopback server.
Npm audits retain separate production/all-dependency JSON; RustSec audits retain
JSON. Findings are informational and emit a workflow warning without blocking
nightly or release validation. Audit execution errors still fail; report artifacts
are uploaded with `always()`. The release build waits for these checks before
staging a draft; no workflow was triggered or release published locally.

Shipping executables are never launched by automated fixtures. Production package
inspection verifies architecture, exact version and extracted binary SHA256 and
rejects smoke, worker, OS and updater harness markers. A separately named,
compile-time `integration-test` app uses production preferences, credential
migration, filesystem capabilities, queue/worker, HTTP transport and commands,
with synthetic OS adapters and temporary data. The optimized fixture package is
launched only in that marked root. `WOWTHING_DISTRIBUTION=1` rejects all harness
features, including the standalone read-only signature-audit utility. Test
instrumentation is absent from shipping artifacts; there is no production
automation server. Modern cross-platform `@wdio/tauri-service` was evaluated;
the smaller compiled initialization harness exercises native webviews here.

The updater fixture builds versions 1.0.6 and 1.0.8 under a disposable app identity.
It verifies typed cryptographic rejection of a well-formed tampered signature,
then calls the actual Tauri updater installer. It relaunches the installed copy,
requires its `app.package_info().version` to be 1.0.8 and compares its hash to the
signed candidate. Preference migration and worker persistence must survive.
Windows install/uninstall is restricted to disposable GitHub-hosted runners;
process descendants must finish before fixtures are removed. Linux uses actual
AppImage runtime installation, with extracted embedded executables audited before
launch. Mac runs a writable temporary `.app`, so it never asks for an admin prompt.

OS probes require `WOWTHING_OS_TESTS=1`, `GITHUB_ACTIONS=true` and
`RUNNER_ENVIRONMENT=github-hosted` before any daemon/store/autostart operation.
Every credential service/account and autostart app is unique and cleanup is
verified, including recovery cleanup. Linux starts a private Secret Service in
an owned DBus session and temporary XDG paths; a separate invalid socket tests
unavailable-backend errors. A missing backend fails, rather than passing as a
skip. Do not run these on developer machines or self-hosted runners.

Release updater signatures are verified against the committed public key,
including signed version. Every updater payload must have a signature. Platform
signing is separate: configure `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
`APPLE_PASSWORD`, `APPLE_TEAM_ID` for Developer ID/notarization, or
`WINDOWS_CERTIFICATE` (base64 PFX) and `WINDOWS_CERTIFICATE_PASSWORD` for
Authenticode. macOS verification rejects ad-hoc signatures, requires an Apple
anchor/Developer ID/team and validates a stapled ticket when notarization is
configured. Windows verifies Authenticode; temporary PFX files are cleaned up.
Unprovisioned platform signing is recorded truthfully as requiring manual release
verification. Updater signing uses `TAURI_PRIVATE_KEY` and optional
`TAURI_PRIVATE_KEY_PASSWORD`; it does not establish OS distribution trust.
The release Tauri launcher removes empty optional Apple environment variables
before invoking the CLI. Missing GitHub secrets must not trigger an empty
certificate import or notarization request. Configured values remain intact,
including an empty certificate password when a certificate is present; invalid
credentials still fail. Without a certificate, the committed ad-hoc identity is
used, which does not provide Developer ID or notarization.

Reports retain native stdout/stderr, structured results/JUnit, runner/architecture,
OS/webview/toolchain metadata and current-run owned-app crash records. Browser
screenshots/traces are retained when available. No environment dump, API keys,
private signing keys or user preferences are uploaded. Build, command, startup,
test and job deadlines supervise only processes started by these checks.

## Manual release checklist

Hosted server runners do not prove consumer OS compatibility. Before promotion,
record app/version/artifact hash and actual results on Windows 10 and Windows 11,
the declared minimum supported macOS on ARM/Intel, and supported Linux desktops.
There are no fictional VM labels queued in CI. A maintainer must provide real
consumer VMs before replacing this checklist with automated jobs.

- Install the real platform-signed artifact; verify Gatekeeper/notarization or
  Windows trust/UI, launch, bundled assets/native libraries and version.
- Upgrade a previous release in a disposable user profile, preserve preferences,
  approve expected credential prompts and verify a real signed production update.
- Approve/deny notification consent and confirm delivery, disabled behavior and
  OS settings links; hosted probes do not claim actual consent/delivery coverage.
- Confirm startup registration/removal and restart/login behavior, real tray
  close/reopen and update actions, minimum OS webview support, Unicode/spaces paths
  and restricted-folder errors. Do not use real upload credentials for testing.
- Exercise locked/unavailable OS vaults only in a disposable profile. The automated
  unavailable Linux check does not prove macOS/Windows locked-store prompts.

Local evidence is reported per run; Windows/Linux/Intel probes and production
signing remain CI/manual coverage until actually executed. Unsigned local builds
never constitute signed release validation.

## Current local audit result (2026-10-06)

The audit command completed with exit 1 and preserved reports: both npm dependency
sets contain 13 advisories (4 critical, 8 high, 1 low); RustSec reports 0
vulnerabilities. This historical run used the blocking policy. As of 2026-10-07,
findings are informational; full reports and original audit exit statuses remain
available. PR checks remain secret-free and do not require this audit job.
