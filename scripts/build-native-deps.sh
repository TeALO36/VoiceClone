#!/usr/bin/env bash
set -euo pipefail

# Build native C++ dependencies for Android NDK (arm64-v8a)
# Called from GitHub Actions workflow before expo prebuild.
#
# The workflow sets ANDROID_NDK_HOME via nttld/setup-ndk action.
# If not set, tries common NDK paths as fallback.

ANDROID_ABI="${ANDROID_ABI:-arm64-v8a}"
ANDROID_PLATFORM="${ANDROID_PLATFORM:-24}"
CMAKE="${CMAKE:-cmake}"
NINJA="${NINJA:-ninja}"

if [ -z "${ANDROID_NDK_HOME:-}" ]; then
    # Try common NDK paths
    if [ -d "${ANDROID_HOME:-}/ndk" ]; then
        NDK_VERSIONS=$(ls "${ANDROID_HOME}/ndk/" 2>/dev/null | sort -V)
        NDK_LATEST=$(echo "$NDK_VERSIONS" | tail -1)
        if [ -n "$NDK_LATEST" ]; then
            ANDROID_NDK_HOME="${ANDROID_HOME}/ndk/${NDK_LATEST}"
        fi
    elif [ -d "${ANDROID_SDK_ROOT:-}/ndk" ]; then
        NDK_VERSIONS=$(ls "${ANDROID_SDK_ROOT}/ndk/" 2>/dev/null | sort -V)
        NDK_LATEST=$(echo "$NDK_VERSIONS" | tail -1)
        if [ -n "$NDK_LATEST" ]; then
            ANDROID_NDK_HOME="${ANDROID_SDK_ROOT}/ndk/${NDK_LATEST}"
        fi
    elif [ -d "/usr/local/lib/android/sdk/ndk" ]; then
        NDK_VERSIONS=$(ls "/usr/local/lib/android/sdk/ndk/" 2>/dev/null | sort -V)
        NDK_LATEST=$(echo "$NDK_VERSIONS" | tail -1)
        if [ -n "$NDK_LATEST" ]; then
            ANDROID_NDK_HOME="/usr/local/lib/android/sdk/ndk/${NDK_LATEST}"
        fi
    fi
fi

if [ -z "${ANDROID_NDK_HOME:-}" ]; then
    echo "ERROR: ANDROID_NDK_HOME not set and no NDK found in standard paths."
    echo "  Tried:"
    echo "    \$ANDROID_HOME/ndk/"
    echo "    \$ANDROID_SDK_ROOT/ndk/"
    echo "    /usr/local/lib/android/sdk/ndk/"
    echo "  Ensure nttld/setup-ndk action is configured with id: setup-ndk"
    echo "  and ANDROID_NDK_HOME is exported from its output."
    exit 1
fi

TOOLCHAIN_FILE="${ANDROID_NDK_HOME}/build/cmake/android.toolchain.cmake"

if [ ! -f "$TOOLCHAIN_FILE" ]; then
    echo "ERROR: CMake toolchain not found at ${TOOLCHAIN_FILE}"
    echo "  NDK path: ${ANDROID_NDK_HOME}"
    exit 1
fi

JOBS=$(nproc 2>/dev/null || echo 4)

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
mkdir -p ggml/build
"${CMAKE}" -S ggml -B ggml/build \
    "${CMAKE_ARGS[@]}" \
    -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF -DGGML_CPU_ALL_WARNINGS=OFF
"${CMAKE}" --build ggml/build --target ggml ggml-base ggml-cpu -j "${JOBS}"
echo "GGML built ✓"

# ---- 2. Build qwen3-tts-cpp ----
echo ""
echo "--- Step 2/3: Building qwen3-tts-cpp ---"
cd "$PROJECT_ROOT/qwen3-tts-cpp"
mkdir -p build
"${CMAKE}" -S . -B build \
    "${CMAKE_ARGS[@]}" \
    -DQWEN3_TTS_TIMING=OFF -DQWEN3_TTS_COREML=OFF \
    -DCMAKE_CXX_FLAGS_RELEASE="-O3 -DNDEBUG"
# Build the shared lib (includes static deps automatically)
"${CMAKE}" --build build --target qwen3tts_shared -j "${JOBS}"
echo "qwen3-tts-cpp built ✓"

# ---- 3. Build omnivoice-cpp (if available) ----
echo ""
echo "--- Step 3/3: Building omnivoice-cpp ---"
if [ -d "$PROJECT_ROOT/omnivoice-cpp" ]; then
    cd "$PROJECT_ROOT/omnivoice-cpp"
    mkdir -p build
    if "${CMAKE}" -S . -B build "${CMAKE_ARGS[@]}" 2>/tmp/ov-cmake-err.log; then
        if "${CMAKE}" --build build --target omnivoice -j "${JOBS}" 2>/tmp/ov-build-err.log; then
            echo "omnivoice-cpp built ✓"
        else
            echo "WARNING: OmniVoice build failed, skipping (see /tmp/ov-build-err.log)"
        fi
    else
        echo "WARNING: OmniVoice CMake configure failed, skipping (see /tmp/ov-cmake-err.log)"
    fi
else
    echo "omnivoice-cpp submodule not found, skipping"
fi

echo ""
echo "=== All native dependencies built successfully ==="
