#!/bin/sh
# Build the frontend and create ~/Applications/PR Desk.app, a stay-open AppleScript applet that runs
# scripts/open.sh. It stays in the Dock, opens the dashboard in a browser tab whenever it is opened,
# and stops the server it started on quit.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$HOME/Applications/PR Desk.app"
URL="http://127.0.0.1:${PORT:-8765}"
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT

(cd "$ROOT" && pnpm install --frozen-lockfile && pnpm build)

# Apps launched from the Dock get a minimal PATH, so keep the current one for python3 and gh.
cat >"$BUILD/app.applescript" <<SCRIPT
global serverPid

on run
	set serverPid to do shell script "PATH=" & quoted form of "$PATH" & " PORT=${PORT:-8765} " & quoted form of "$ROOT/scripts/open.sh"
end run

on reopen
	open location "$URL"
end reopen

on quit
	if serverPid is not "" then do shell script "kill " & serverPid & " 2>/dev/null || true"
	continue quit
end quit
SCRIPT
rm -rf "$APP"
osacompile -s -o "$APP" "$BUILD/app.applescript"

# Render public/favicon.svg into the applet's icon.
ICONSET="$BUILD/AppIcon.iconset"
mkdir "$ICONSET"
osascript -l JavaScript "$ROOT/scripts/render-icon.js" "$ROOT/public/favicon.svg" "$BUILD/icon.png" >/dev/null
for size in 16 32 128 256 512; do
  sips -z $size $size "$BUILD/icon.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -z $((size * 2)) $((size * 2)) "$BUILD/icon.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/applet.icns"
rm -f "$APP/Contents/Resources/Assets.car"
plutil -replace CFBundleIdentifier -string local.pr-desk "$APP/Contents/Info.plist"
plutil -remove CFBundleIconName "$APP/Contents/Info.plist" 2>/dev/null || true
# Editing the bundle invalidates osacompile's ad-hoc signature, so sign it again.
codesign --force --sign - "$APP" 2>/dev/null
touch "$APP"
echo "Installed $APP"
