#!/usr/bin/env bash
#
# Fetches the sherpa-onnx Android runtime and stages it into the Expo module so
# the Pocket TTS engine can dlopen it at runtime.
#
# Pocket TTS runs through sherpa-onnx's C API. The prebuilt arm64-v8a shared
# libraries (libsherpa-onnx-c-api.so + libonnxruntime.so) come from the
# official GitHub release; they are NOT committed to this repository because
# they are ~26 MB of binaries — run this once before building the Android app:
#
#   bash scripts/fetch-sherpa-onnx-android.sh
#
set -euo pipefail

VERSION="${1:-v1.13.4}"
DEST="modules/expo-qwen3-tts/android/src/main/jniLibs/arm64-v8a"
TARBALL="sherpa-onnx-${VERSION}-android.tar.bz2"
URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/${VERSION}/${TARBALL}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading ${URL} ..."
curl -fL --retry 3 -o "${TMP}/${TARBALL}" "$URL"

echo "Extracting arm64-v8a libraries ..."
tar xjf "${TMP}/${TARBALL}" -C "$TMP" "./jniLibs/arm64-v8a/"

mkdir -p "$DEST"
cp "$TMP/jniLibs/arm64-v8a/libsherpa-onnx-c-api.so" "$DEST/"
cp "$TMP/jniLibs/arm64-v8a/libonnxruntime.so" "$DEST/"

echo "Staged into ${DEST}:"
ls -la "$DEST"
