#!/bin/bash
# Builds a standalone release APK (no Metro needed to run it) and copies it
# to the Desktop with a timestamped name, ready to drag into Google Drive.
#
# Usage: npm run apk
#
# This script does NOT upload anywhere or touch your Google account — it
# only prepares the file locally. You still drag it into Drive yourself and
# use Drive's own "Get link" / "Share" option.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ANDROID_DIR="$PROJECT_ROOT/android"

# Android Studio's bundled JDK (system Java is usually too old for this build)
STUDIO_JDK="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
if [ -d "$STUDIO_JDK" ]; then
  export JAVA_HOME="$STUDIO_JDK"
  export PATH="$JAVA_HOME/bin:$PATH"
elif [ -z "$JAVA_HOME" ]; then
  echo "⚠️  Could not find Android Studio's JDK at:"
  echo "    $STUDIO_JDK"
  echo "    Set JAVA_HOME yourself before running this script, or install Android Studio."
  exit 1
fi

APP_NAME=$(node -p "require('$PROJECT_ROOT/app.json').displayName" 2>/dev/null | tr -d ' ' || echo "App")
VERSION=$(node -p "require('$PROJECT_ROOT/package.json').version" 2>/dev/null || echo "0.0.0")
TIMESTAMP=$(date +%Y%m%d-%H%M)
OUTPUT_NAME="${APP_NAME}-v${VERSION}-${TIMESTAMP}.apk"

echo "📦 Building release APK for $APP_NAME v$VERSION..."
cd "$ANDROID_DIR"
./gradlew assembleRelease

APK_SRC="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$APK_SRC" ]; then
  echo "❌ Build finished but APK not found at expected path: $APK_SRC"
  exit 1
fi

DEST="$HOME/Desktop/$OUTPUT_NAME"
cp "$APK_SRC" "$DEST"

SIZE=$(du -h "$DEST" | cut -f1)

echo ""
echo "✅ APK ready: $DEST  ($SIZE)"
echo ""
echo "Next steps to share it:"
echo "  1. Open https://drive.google.com in your browser"
echo "  2. Drag $OUTPUT_NAME from your Desktop into Drive"
echo "  3. Right-click the uploaded file → Share → Get link"
echo "  4. Set it to \"Anyone with the link\" if you're sending it to someone else"
