#!/usr/bin/env bash
# Uploads the installers from dist/ to the landing page downloads folder on the production server,
# then attaches the same files to the GitHub release for the package.json version.
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
  && sha256sum \$(ls ${FILES[*]} 2>/dev/null) > SHA256SUMS.tmp && mv SHA256SUMS.tmp SHA256SUMS && chmod 644 SHA256SUMS && cat SHA256SUMS" \
  | tee SHA256SUMS

# The GitHub release for this version carries the same installers and SHA256SUMS, so anyone can check the website's files
# against it. SKIP_GITHUB_RELEASE=1 leaves it out.
[ "${SKIP_GITHUB_RELEASE:-}" = "1" ] && exit 0
if [ ${#missing[@]} -gt 0 ]; then
  echo "Not updating the GitHub release: ${missing[*]} missing. Rerun with the full set to publish it." >&2
  exit 0
fi
# SHA256SUMS now lists the server's files; refusing a mismatch keeps GitHub from getting different bytes than the website.
sha256sum --quiet -c SHA256SUMS || { echo "dist/ differs from the files on the server; not publishing the GitHub release." >&2; exit 1; }

REPO="cloudcore-app/saskaitago"
VERSION=$(node -p 'require("../package.json").version')
TAG="v$VERSION"
git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null \
  || { echo "Tag $TAG is not on GitHub. Push it (git push origin $TAG) and rerun." >&2; exit 1; }
# Reuses the GitHub credential git already has, unless GH_TOKEN is set (same as fetch-mac-build.sh).
TOKEN="${GH_TOKEN:-$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null | sed -n 's/^password=//p')}"
[ -n "$TOKEN" ] || { echo "No GitHub token: set GH_TOKEN or store a git credential for github.com." >&2; exit 1; }
api() { curl -fsSL -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" "$@"; }

RELEASE=$(curl -sSL -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/releases/tags/$TAG")
RELEASE_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("id", ""))' <<<"$RELEASE")
if [ -z "$RELEASE_ID" ]; then
  # Release notes: the commit subjects since the previous tag, plus the install commands.
  PREVIOUS=$(git describe --tags --abbrev=0 "$TAG^" 2>/dev/null || true)
  CHANGES=$(git log --no-merges --format='- %s' "${PREVIOUS:+$PREVIOUS..}$TAG" | grep -v '^- Release ' || true)
  RELEASE=$(CHANGES="$CHANGES" TAG="$TAG" VERSION="$VERSION" python3 -c '
import json, os
body = f"""{os.environ["CHANGES"]}

**Install**
- Linux / macOS: `curl -fsSL https://saskaitago.lt/downloads/install.sh | bash`
- Windows (PowerShell): `irm https://saskaitago.lt/downloads/install.ps1 | iex`
- Or download an installer below or from https://saskaitago.lt.

The installers are unsigned. Their SHA-256 hashes are in `SHA256SUMS` and match https://saskaitago.lt/downloads/SHA256SUMS."""
print(json.dumps({"tag_name": os.environ["TAG"], "name": "SaskaitaGO " + os.environ["VERSION"], "body": body, "make_latest": "true"}))
' | api -X POST "https://api.github.com/repos/$REPO/releases" -d @-)
  RELEASE_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"$RELEASE")
  echo "Created GitHub release $TAG"
fi

# Re-running replaces the assets, so a rebuilt installer never sits next to a stale one.
for file in "${FILES[@]}" SHA256SUMS; do
  ASSET_ID=$(FILE="$file" python3 -c 'import json,os,sys; print(next((a["id"] for a in json.load(sys.stdin)["assets"] if a["name"]==os.environ["FILE"]), ""))' <<<"$RELEASE")
  [ -z "$ASSET_ID" ] || api -X DELETE "https://api.github.com/repos/$REPO/releases/assets/$ASSET_ID"
  api -H "Content-Type: application/octet-stream" --data-binary @"$file" \
    "https://uploads.github.com/repos/$REPO/releases/$RELEASE_ID/assets?name=$file" >/dev/null
  echo "Uploaded $file to $TAG"
done
echo "https://github.com/$REPO/releases/tag/$TAG"
