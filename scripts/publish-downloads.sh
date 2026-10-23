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
# rsync writes to a temporary file next to the target and renames it, so a download never sees a half-written file.
rsync -a "${present[@]}" "$HOST:$DIR/"
ssh "$HOST" "cd '$DIR' && chmod 644 ${present[*]} && sha256sum ${present[*]}"
