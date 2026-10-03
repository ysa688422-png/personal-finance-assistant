#!/bin/zsh
set -eu
SCRIPT_DIR="${0:A:h}"
APP_DIR="$SCRIPT_DIR/洒一的财务与投资.app"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"
cp "$SCRIPT_DIR/Info.plist" "$APP_DIR/Contents/Info.plist"
cp "$SCRIPT_DIR/launcher.command" "$APP_DIR/Contents/MacOS/launcher"
chmod +x "$APP_DIR/Contents/MacOS/launcher"
cp "$SCRIPT_DIR/Assets/AppIcon.icns" "$APP_DIR/Contents/Resources/app-icon.icns"
/usr/bin/codesign --force --sign - --timestamp=none "$APP_DIR"
echo "主页桌面应用已构建：$APP_DIR"
