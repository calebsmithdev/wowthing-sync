#!/usr/bin/env bash
set -euo pipefail

# Clean build artifacts for Nuxt (frontend) and Tauri (Rust) projects.
# Run from anywhere; script resolves paths relative to the repository root.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DRY_RUN=false
if [[ "${1-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

# Paths of build artifacts to remove relative to the repo root.
ARTIFACT_PATHS=(
  "target"                             # Rust workspace builds (includes Tauri bundles)
  "apps/desktop/dist"                  # Legacy build output
  "apps/desktop/.nuxt"                 # Nuxt dev/build cache
  "apps/desktop/.output"               # Nuxt production build output
  "apps/desktop/.npm-cache"            # Local npm cache created during builds
  "apps/desktop/src-tauri/target"      # Cargo target dir when built from src-tauri
  "apps/desktop/src-tauri/target/release/bundle" # Tauri bundle artifacts (if dir persists after target cleanup)
)

removed_any=false
for rel_path in "${ARTIFACT_PATHS[@]}"; do
  abs_path="${REPO_ROOT}/${rel_path}"
  if [[ -d "${abs_path}" || -f "${abs_path}" ]]; then
    if [[ "${DRY_RUN}" == true ]]; then
      echo "Would remove ${rel_path}"
    else
      rm -rf "${abs_path}"
      echo "Removed ${rel_path}"
    fi
    removed_any=true
  else
    echo "Skipping ${rel_path} (not found)"
  fi
done

if [[ "${removed_any}" == false ]]; then
  if [[ "${DRY_RUN}" == true ]]; then
    echo "No build artifacts would be removed."
  else
    echo "No build artifacts removed."
  fi
fi
