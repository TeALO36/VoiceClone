#!/usr/bin/env bash
set -euo pipefail

# Build native C++ dependencies for Android NDK (arm64-v8a)
# Called from GitHub Actions workflow before expo prebuild.
#
# Expected environment variables:
#   ANDROID_NDK_HOME  - path to NDK (e.g., /usr/local/lib/android/sdk/ndk/27.0.12077973)
#   ANDROID_ABI       - (default: arm64-v8a)
#   ANDROID_PLATFORM  - (default: 24)
#   CMAKE             - (default: cmake)
#   NINJA             - (default: ninja)

ANDROID_ABI="${ANDROID_ABI:-arm64-v8a}"
ANDROID_PLATFORM="${ANDROID_PLATFORM:-24}"
CMAKE="${CMAKE:-cmake}"
NINJA="${NINJA:-ninja}"

if [ -z "${ANDROID_NDK_HOME:-}" ]; then
    # Try common NDK paths
    if [ -d "$ANDROID_HOME/ndk/27.0.12077973" ]; then
        ANDROID_NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"
    elif [ -d "$ANDROID_SDK_ROOT/ndk/27.0.12077973" ]; then
        ANDROID_NDK_HOME="$ANDROID_SDK_ROOT/ndk/27.0.12077973"
    else
        echo "ERROR: ANDROID_NDK_HOME not set and no NDK found"
        exit 1
    fi
fi

TOOLCHAIN_FILE="${ANDROID_NDK_HOME}/build/cmake/android.toolchain.cmake"
JOBS=$(nproc)

echo "=== Build Native Dependencies ==="
echo "NDK:       ${ANDROID_NDK_HOME}"
echo "ABI:       ${ANDROID_ABI}"
echo "Platform:  ${ANDROID_PLATFORM}"
echo "Toolchain: ${TOOLCHAIN_FILE}"
echo "Jobs:      ${JOBS}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Common CMake args for all NDK builds
CMAKE_ARGS=(
    -DCMAKE_TOOLCHAIN_FILE="${TOOLCHAIN_FILE}"
    -DANDROID_ABI="${ANDROID_ABI}"
    -DANDROID_PLATFORM="${ANDROID_PLATFORM}"
    -DANDROID_NDK="${ANDROID_NDK_HOME}"
    -DCMAKE_BUILD_TYPE=Release
    -DCMAKE_MAKE_PROGRAM="${NINJA}"
    -GNinja
)

# ---- 1. Build GGML ----
echo ""
echo "--- Step 1/3: Building GGML ---"
cd "$PROJECT_ROOT/qwen3-tts-cpp"
if [ ! -d "ggml/build" ]; then
    mkdir -p ggml/build
fi
"${CMAKE}" -S ggml -B ggml/build \
    "${CMAKE_ARGS[@]}" \
    -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF -DGGML_CPU_ALL_WARNINGS=OFF
"${CMAKE}" --build ggml/build --target ggml ggml-base ggml-cpu -j "${JOBS}"
echo "GGML built ✓"

# ---- 2. Build qwen3-tts-cpp ----
echo ""
echo "--- Step 2/3: Building qwen3-tts-cpp ---"
cd "$PROJECT_ROOT/qwen3-tts-cpp"
if [ ! -d "build" ]; then
    mkdir -p build
fi
"${CMAKE}" -S . -B build \
    "${CMAKE_ARGS[@]}" \
    -DQWEN3_TTS_TIMING=OFF -DQWEN3_TTS_COREML=OFF
"${CMAKE}" --build build --target qwen3tts_shared -j "${JOBS}"
echo "qwen3-tts-cpp built ✓"

# ---- 3. Build omnivoice-cpp (if available) ----
echo ""
echo "--- Step 3/3: Building omnivoice-cpp ---"
if [ -d "$PROJECT_ROOT/omnivoice-cpp" ]; then
    cd "$PROJECT_ROOT/omnivoice-cpp"
    if [ ! -d "build" ]; then
        mkdir -p build
    fi
    "${CMAKE}" -S . -B build "${CMAKE_ARGS[@]}" 2>&1 || {
        echo "WARNING: OmniVoice CMake configure failed, skipping"
        exit 0
    }
    "${CMAKE}" --build build --target omnivoice -j "${JOBS}" 2>&1 || {
        echo "WARNING: OmniVoice build failed, skipping"
        exit 0
    }
    echo "omnivoice-cpp built ✓"
else
    echo "omnivoice-cpp submodule not found, skipping"
fi

echo ""
echo "=== All native dependencies built successfully ==="
