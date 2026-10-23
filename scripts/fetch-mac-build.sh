#!/usr/bin/env bash
# Downloads SaskaitaGO.dmg from the latest successful "Desktop builds" run of the current commit into dist/.
set -euo pipefail

REPO="cloudcore-app/saskaitago"
cd "$(dirname "$0")/.."
SHA="${1:-$(git rev-parse HEAD)}"

# Reuses the GitHub credential git already has, unless GH_TOKEN is set.
TOKEN="${GH_TOKEN:-$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null | sed -n 's/^password=//p')}"
[ -n "$TOKEN" ] || { echo "No GitHub token: set GH_TOKEN or store a git credential for github.com." >&2; exit 1; }
api() { curl -fsSL -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" "$@"; }

# Test-only push runs succeed too, so pick the newest successful run that actually has the macOS artifact.
RUN_IDS=$(api "https://api.github.com/repos/$REPO/actions/runs?head_sha=$SHA&status=success&per_page=20" \
  | python3 -c 'import json,sys; print(" ".join(str(r["id"]) for r in json.load(sys.stdin)["workflow_runs"]))')
RUN_ID="" ARTIFACT_URL=""
for id in $RUN_IDS; do
  ARTIFACT_URL=$(api "https://api.github.com/repos/$REPO/actions/runs/$id/artifacts" \
    | python3 -c 'import json,sys; a=[x for x in json.load(sys.stdin)["artifacts"] if x["name"]=="SaskaitaGO-macos" and not x["expired"]]; print(a[0]["archive_download_url"] if a else "")')
  if [ -n "$ARTIFACT_URL" ]; then RUN_ID=$id; break; fi
done
[ -n "$RUN_ID" ] || { echo "No macOS build for ${SHA:0:7} yet. Start one: Actions → Desktop builds → Run workflow, or push a v* tag." >&2; exit 1; }

mkdir -p dist
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
api -o "$TMP/macos.zip" "$ARTIFACT_URL"
unzip -o -q "$TMP/macos.zip" -d "$TMP/out"
mv -f "$TMP/out/SaskaitaGO.dmg" dist/SaskaitaGO.dmg
echo "dist/SaskaitaGO.dmg (CI run $RUN_ID, commit ${SHA:0:7})"
