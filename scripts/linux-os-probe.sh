#!/usr/bin/env bash
set -euo pipefail
if [[ "${WOWTHING_OS_TESTS:-}" != 1 || "${GITHUB_ACTIONS:-}" != true || "${RUNNER_ENVIRONMENT:-}" != github-hosted || -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]]; then
  echo 'OS daemon refused: explicit disposable hosted runner and isolated DBus required' >&2
  exit 2
fi
# Invoked ONLY by trusted scheduled/release hosted jobs. dbus-run-session owns this
# process tree; XDG paths and Secret Service collection exist only in its temp root.
task_root=$(mktemp -d)
cleanup() { rm -rf "$task_root"; }
trap cleanup EXIT
export XDG_CONFIG_HOME="$task_root/config" XDG_DATA_HOME="$task_root/data" XDG_CACHE_HOME="$task_root/cache" XDG_RUNTIME_DIR="$task_root/runtime"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"
printf '%s' 'synthetic-ci-password' | gnome-keyring-daemon --unlock --components=secrets
xvfb-run -a node scripts/ci-run.mjs actual-os-adapters 600 node scripts/os-integration.mjs
# Separate process, no backend tampering: missing socket must yield actionable error.
DBUS_SESSION_BUS_ADDRESS="unix:path=$task_root/missing-bus" WOWTHING_EXPECT_VAULT_UNAVAILABLE=1 xvfb-run -a node scripts/ci-run.mjs unavailable-vault 600 node scripts/os-integration.mjs
