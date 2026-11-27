#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ICON_SET="$ROOT/ios/BeBoss/Images.xcassets/AppIcon.appiconset"
SOURCE="$ICON_SET/BeBossIcon.png"
OUTPUT="$ICON_SET/BeBossIcon-1024.png"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if ! command -v sips >/dev/null 2>&1; then
  echo "ERROR: macOS sips is required to prepare the iOS app icon." >&2
  exit 1
fi
if [[ ! -f "$SOURCE" ]]; then
  echo "ERROR: Original BeBoss icon not found: $SOURCE" >&2
  exit 1
fi

# JPEG intermediate removes the source PNG alpha channel. Convert back to a
# lossless, opaque PNG at Apple's required single-size iOS app icon dimensions.
sips -s format jpeg -s formatOptions 95 "$SOURCE" --out "$TMP_DIR/BeBossIcon-opaque.jpg" >/dev/null
sips --resampleHeightWidth 1024 1024 "$TMP_DIR/BeBossIcon-opaque.jpg" --out "$TMP_DIR/BeBossIcon-1024.jpg" >/dev/null
sips -s format png "$TMP_DIR/BeBossIcon-1024.jpg" --out "$OUTPUT" >/dev/null

DIMENSIONS="$(sips -g pixelWidth -g pixelHeight "$OUTPUT")"
if ! grep -q 'pixelWidth: 1024' <<<"$DIMENSIONS" || ! grep -q 'pixelHeight: 1024' <<<"$DIMENSIONS"; then
  echo "ERROR: Prepared BeBoss icon is not 1024x1024 pixels." >&2
  echo "$DIMENSIONS" >&2
  exit 1
fi

echo "Prepared opaque 1024x1024 BeBoss iPhone app icon: $OUTPUT"
