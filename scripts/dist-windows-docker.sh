#!/usr/bin/env bash
# Builds the Windows installer on Linux inside electron-builder's Wine image, so no local Wine install is needed.
set -euo pipefail

IMAGE="electronuserland/builder:22-wine-05.26"
cd "$(dirname "$0")/.."
mkdir -p "$HOME/.cache/electron" "$HOME/.cache/electron-builder"
# electron-builder runs `pnpm list`, which needs the pnpm store (an SQLite index, so writable) at the same absolute path as on the host.
STORE_DIR="$(pnpm store path | sed -E 's#/v[0-9]+/?$##')"

# Runs as the current user so dist/ is not left owned by root; HOME points at a writable dir for Wine.
docker run --rm \
  --user "$(id -u):$(id -g)" \
  --env HOME=/tmp/home \
  --env ELECTRON_CACHE=/cache/electron \
  --env ELECTRON_BUILDER_CACHE=/cache/electron-builder \
  --volume "$PWD:/project" \
  --volume "$HOME/.cache/electron:/cache/electron" \
  --volume "$HOME/.cache/electron-builder:/cache/electron-builder" \
  --volume "$STORE_DIR:$STORE_DIR" \
  --workdir /project \
  "$IMAGE" \
  bash -c 'mkdir -p "$HOME" && npx --no-install electron-builder --win nsis --publish never'
