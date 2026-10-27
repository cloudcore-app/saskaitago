#!/usr/bin/env bash
# Installs SaskaitaGO on Linux or macOS:
#   curl -fsSL https://saskaitago.lt/downloads/install.sh | bash
# Linux gets the AppImage in ~/.local (it updates itself); pass --deb to install the .deb package with apt instead.
# macOS gets the app in /Applications, or ~/Applications when /Applications is not writable.
set -euo pipefail

BASE_URL="${SASKAITAGO_DOWNLOADS_URL:-https://saskaitago.lt/downloads}"
BASE_URL="${BASE_URL%/}"
USE_DEB=0
for arg in "$@"; do
  case "$arg" in
    --deb) USE_DEB=1 ;;
    -h | --help)
      echo "Usage: install.sh [--deb]"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}
need() { command -v "$1" >/dev/null 2>&1 || fail "$1 is required but not installed."; }

need curl
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Downloads a file from the downloads folder and checks it against SHA256SUMS published next to it.
fetch() {
  local name="$1"
  say "Downloading $name"
  curl -fL --progress-bar -o "$TMP/$name" "$BASE_URL/$name"
  curl -fsSL -o "$TMP/SHA256SUMS" "$BASE_URL/SHA256SUMS"
  local expected actual
  expected=$(awk -v f="$name" '$2 == f || $2 == "*" f { print $1 }' "$TMP/SHA256SUMS")
  [ -n "$expected" ] || fail "$name is missing from SHA256SUMS."
  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$TMP/$name" | awk '{ print $1 }')
  else
    actual=$(shasum -a 256 "$TMP/$name" | awk '{ print $1 }')
  fi
  [ "$expected" = "$actual" ] || fail "Checksum mismatch for $name. Try again later."
}

install_appimage() {
  [ "$(uname -m)" = "x86_64" ] || fail "Only x86_64 Linux builds are available."
  fetch SaskaitaGO.AppImage
  local app_dir="$HOME/.local/share/saskaitago"
  local bin_dir="$HOME/.local/bin"
  local apps_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  local icon_dir="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/512x512/apps"
  mkdir -p "$app_dir" "$bin_dir" "$apps_dir" "$icon_dir"
  install -m 755 "$TMP/SaskaitaGO.AppImage" "$app_dir/SaskaitaGO.AppImage"
  curl -fsSL -o "$icon_dir/saskaitago.png" "$BASE_URL/saskaitago.png" || true

  # The AppImage's AppRun adds --no-sandbox by itself where user namespaces are blocked (Ubuntu 23.10+).
  ln -sf "$app_dir/SaskaitaGO.AppImage" "$bin_dir/saskaitago"
  cat >"$apps_dir/saskaitago.desktop" <<EOF
[Desktop Entry]
Name=SaskaitaGO
Comment=Local-first Lithuanian invoicing
Exec="$app_dir/SaskaitaGO.AppImage" %U
Icon=saskaitago
Terminal=false
Type=Application
Categories=Office;
StartupWMClass=SaskaitaGO
EOF
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$apps_dir" >/dev/null 2>&1 || true

  # Read the cache into a variable first: with pipefail, grep -q closing the pipe early would fail the check.
  local libs
  libs=$(ldconfig -p 2>/dev/null || /sbin/ldconfig -p 2>/dev/null || true)
  if ! grep -q 'libfuse\.so\.2' <<<"$libs"; then
    echo
    echo "Note: AppImages need FUSE 2. If the app does not start, install it, e.g. 'sudo apt install libfuse2t64' (Ubuntu 24.04+) or 'sudo apt install libfuse2'."
  fi
  case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *) echo "Note: $bin_dir is not in PATH; start SaskaitaGO from the applications menu or add it to PATH." ;;
  esac
  say "SaskaitaGO installed. Start it from the applications menu or run: saskaitago"
}

install_deb() {
  command -v apt-get >/dev/null 2>&1 || fail "--deb needs a Debian-based system with apt."
  fetch SaskaitaGO.deb
  local sudo=""
  [ "$(id -u)" -eq 0 ] || {
    need sudo
    sudo="sudo"
  }
  say "Installing the package (you may be asked for your password)"
  # apt resolves the package's dependencies; it needs a path, not a bare file name.
  $sudo apt-get install -y "$TMP/SaskaitaGO.deb"
  say "SaskaitaGO installed. Start it from the applications menu or run: saskaitago"
  echo "The .deb package does not update itself; the app shows a notice and you can rerun this script with --deb."
}

install_macos() {
  fetch SaskaitaGO.dmg
  local target="/Applications"
  [ -w "$target" ] || {
    target="$HOME/Applications"
    mkdir -p "$target"
  }
  local mount="$TMP/mount"
  mkdir -p "$mount"
  hdiutil attach -nobrowse -quiet -readonly -mountpoint "$mount" "$TMP/SaskaitaGO.dmg"
  trap 'hdiutil detach -quiet "$mount" 2>/dev/null || true; rm -rf "$TMP"' EXIT
  osascript -e 'quit app "SaskaitaGO"' >/dev/null 2>&1 || true
  rm -rf "$target/SaskaitaGO.app"
  ditto "$mount/SaskaitaGO.app" "$target/SaskaitaGO.app"
  hdiutil detach -quiet "$mount"
  # The build is not notarized; files fetched with curl are not quarantined, but clear the flag in case.
  xattr -dr com.apple.quarantine "$target/SaskaitaGO.app" 2>/dev/null || true
  say "SaskaitaGO installed to $target. Start it from Launchpad or run: open -a SaskaitaGO"
}

case "$(uname -s)" in
  Linux) if [ "$USE_DEB" = 1 ]; then install_deb; else install_appimage; fi ;;
  Darwin) install_macos ;;
  *) fail "Unsupported system $(uname -s). On Windows run in PowerShell: irm $BASE_URL/install.ps1 | iex" ;;
esac
