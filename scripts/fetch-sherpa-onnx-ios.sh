#!/usr/bin/env bash
#
# Fetches the sherpa-onnx iOS XCFramework and stages it into the Expo module so
# the Pocket TTS engine can be linked from the iOS build.
#
# The shared framework bundles onnxruntime statically, which is the right shape
# for an app that does not otherwise use onnxruntime. Run once on a Mac before
# building the iOS app:
#
#   bash scripts/fetch-sherpa-onnx-ios.sh
#
set -euo pipefail

VERSION="${1:-v1.13.4}"
DEST="modules/expo-qwen3-tts/ios/Frameworks"
ZIP="sherpa-onnx-${VERSION}-ios-shared-onnxruntime-static.xcframework.zip"
URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/xcframework/${ZIP}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading ${URL} ..."
curl -fL --retry 3 -o "${TMP}/${ZIP}" "$URL"

echo "Extracting XCFramework ..."
unzip -q "${TMP}/${ZIP}" -d "$TMP"

mkdir -p "$DEST"
# The zip contains <version>-ios-shared-onnxruntime-static.xcframework
FRAMEWORK_DIR="$(find "$TMP" -maxdepth 2 -name '*.xcframework' -type d | head -1)"
if [ -z "$FRAMEWORK_DIR" ]; then
  echo "ERROR: no .xcframework found in the archive" >&2
  exit 1
fi
rm -rf "$DEST/sherpa-onnx.xcframework"
cp -R "$FRAMEWORK_DIR" "$DEST/sherpa-onnx.xcframework"

echo "Staged into ${DEST}:"
ls "$DEST"
