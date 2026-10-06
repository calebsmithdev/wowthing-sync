# Wowthing Sync

Wowthing Sync is a cross-platform desktop client for [Wowthing](https://wowthing.org/) that keeps your addon data in sync with the web app. It runs natively on macOS, Windows, and Linux/Steam Deck using Tauri and Nuxt.

![Wowthing Sync on macOS](assets/mac-screenshot.png)

## Download

| Platform | Link |
| --- | --- |
| macOS (Apple Silicon) | [WowthingSync-AppleSilicon.dmg](https://calebsmithdev.github.io/wowthing-sync/download/mac-silicon) |
| macOS (Intel) | [WowthingSync-Intel.dmg](https://calebsmithdev.github.io/wowthing-sync/download/mac-intel) |
| Windows (x64) | [WowthingSync.msi](https://calebsmithdev.github.io/wowthing-sync/download/windows) |
| Linux (x64) | [WowthingSync.AppImage](https://calebsmithdev.github.io/wowthing-sync/download/linux) |

## Features

- Automatically upload the [Wowthing Collector](https://www.curseforge.com/wow/addons/wowthing-collector) addon data on character reload/logout
- Manually upload addon data on demand

## How to Develop

### Prerequisites

- Node.js 22.22.3+, 24.15.0+, or 26+ (matching Nuxt's supported release lines)
- Rust toolchain with the targets required by [Tauri's platform prerequisites](https://tauri.app/start/prerequisites/)
- npm (bundled with Node) and the platform-specific Tauri dependencies for your OS

### Install dependencies

```bash
npm ci --prefix ./apps/desktop
```

### Start the desktop app in development mode

```bash
npm run --prefix ./apps/desktop tauri:dev
```

This launches the Nuxt dev server and the Tauri shell with hot reload.

### Run tests

```bash
npm run --prefix ./apps/desktop test:unit
npm run --prefix ./apps/desktop typecheck
npm run --prefix ./apps/desktop generate
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
```

### Build a release installer (current OS)

```bash
npm run --prefix ./apps/desktop build
npm run --prefix ./apps/desktop tauri build
```

## Scripts

- `scripts/clean-build-artifacts.sh`: Removes Nuxt and Tauri build artifacts (Cargo `target`, `.nuxt`, `.output`, `.npm-cache`, `dist`, etc.) to reclaim disk space. Run `./scripts/clean-build-artifacts.sh --dry-run` to preview deletions before executing the full cleanup.

## Other information

For marketing site updates, run `npm ci --prefix marketing` and `npm run generate --prefix marketing`, then deploy `marketing/.output/public/` to your static host of choice.

See [the dependency review](docs/dependency-review.md) for upgrade decisions, validation, and outstanding upstream advisories.
