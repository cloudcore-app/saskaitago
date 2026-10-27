#!/usr/bin/env bash
# Uploads the installers from dist/ to the landing page downloads folder on the production server.
set -euo pipefail

HOST="${DEPLOY_HOST:-samas-server}"
DIR="${DEPLOY_DIR:-Projects/saskaitago-landing/site/downloads}"
FILES=(SaskaitaGO.AppImage SaskaitaGO.deb SaskaitaGO-Setup.exe SaskaitaGO.dmg)
cd "$(dirname "$0")/../dist"

missing=()
for file in "${FILES[@]}"; do [ -f "$file" ] || missing+=("$file"); done
if [ ${#missing[@]} -gt 0 ] && [ "${ALLOW_PARTIAL:-}" != "1" ]; then
  echo "Missing in dist/: ${missing[*]}. Build them first, or set ALLOW_PARTIAL=1 to upload the rest." >&2
  exit 1
fi

present=()
for file in "${FILES[@]}"; do [ -f "$file" ] && present+=("$file"); done
# Update feeds read by electron-updater (latest.yml for Windows, latest-linux.yml for the AppImage) and by the
# update notice on macOS and .deb; they are uploaded after the installers so they never announce a missing file.
feeds=()
for file in latest.yml latest-linux.yml; do [ -f "$file" ] && feeds+=("$file"); done
# rsync writes to a temporary file next to the target and renames it, so a download never sees a half-written file.
rsync -a "${present[@]}" "$HOST:$DIR/"
[ ${#feeds[@]} -eq 0 ] || rsync -a "${feeds[@]}" "$HOST:$DIR/"
# One-line installers (curl ... | bash, irm ... | iex) and the icon they put in the Linux applications menu.
rsync -a ../scripts/install.sh ../scripts/install.ps1 "$HOST:$DIR/"
rsync -a ../build/icon.png "$HOST:$DIR/saskaitago.png"
# The install scripts verify downloads against SHA256SUMS, so it covers every installer on the server, not just this upload.
ssh "$HOST" "cd '$DIR' && chmod 644 ${present[*]} ${feeds[*]} install.sh install.ps1 saskaitago.png \
  && sha256sum \$(ls ${FILES[*]} 2>/dev/null) > SHA256SUMS.tmp && mv SHA256SUMS.tmp SHA256SUMS && chmod 644 SHA256SUMS && cat SHA256SUMS"
