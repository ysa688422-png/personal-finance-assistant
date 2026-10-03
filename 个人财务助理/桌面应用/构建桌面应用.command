#!/bin/zsh
set -eu
SCRIPT_DIR="${0:A:h}"
APP_DIR="$SCRIPT_DIR/洒一财务助理.app"
BUILD_OUTPUT="$(/usr/bin/mktemp /private/tmp/sayi-finance-app.XXXXXX)"
trap '/bin/rm -f "$BUILD_OUTPUT"' EXIT
SDK_PATH="$(/usr/bin/xcrun --sdk macosx --show-sdk-path)"
CLANG_MODULE_CACHE_PATH=/private/tmp/sayi-finance-clang-cache \
SWIFT_MODULE_CACHE_PATH=/private/tmp/sayi-finance-swift-cache \
/usr/bin/swiftc -swift-version 5 -O -target "$(/usr/bin/uname -m)-apple-macosx13.0" \
  -sdk "$SDK_PATH" -module-cache-path /private/tmp/sayi-finance-swift-cache \
  -framework AppKit -framework WebKit \
  "$SCRIPT_DIR/FinanceAssistantApp.swift" \
  -o "$BUILD_OUTPUT"
/bin/mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"
/bin/cp "$SCRIPT_DIR/Info.plist" "$APP_DIR/Contents/Info.plist"
/bin/mv "$BUILD_OUTPUT" "$APP_DIR/Contents/MacOS/SayiFinanceAssistant"
if [ -f "$SCRIPT_DIR/Assets/SayiFinance.icns" ]; then
  /bin/cp "$SCRIPT_DIR/Assets/SayiFinance.icns" "$APP_DIR/Contents/Resources/SayiFinance.icns"
fi
/usr/bin/codesign --force --sign - --timestamp=none "$APP_DIR"
echo "桌面应用已构建：$APP_DIR"
