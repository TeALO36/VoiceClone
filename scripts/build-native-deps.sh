#!/usr/bin/env bash
set -euo pipefail

# Build native C++ dependencies for Android NDK (arm64-v8a)
# Called from GitHub Actions workflow before expo prebuild.

ANDROID_ABI="${ANDROID_ABI:-arm64-v8a}"
ANDROID_PLATFORM="${ANDROID_PLATFORM:-24}"
CMAKE="${CMAKE:-cmake}"
NINJA="${NINJA:-ninja}"

if [ -z "${ANDROID_NDK_HOME:-}" ]; then
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
    exit 1
fi

TOOLCHAIN_FILE="${ANDROID_NDK_HOME}/build/cmake/android.toolchain.cmake"

if [ ! -f "$TOOLCHAIN_FILE" ]; then
    echo "ERROR: CMake toolchain not found at ${TOOLCHAIN_FILE}"
    exit 1
fi

JOBS=$(nproc 2>/dev/null || echo 4)

echo "=== Build Native Dependencies ==="
echo "NDK:       ${ANDROID_NDK_HOME}"
echo "ABI:       ${ANDROID_ABI}"
echo "Platform:  ${ANDROID_PLATFORM}"
echo "Toolchain: ${TOOLCHAIN_FILE}"
echo "Jobs:      ${JOBS}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Ensure all submodules are recursively checked out
echo "--- Updating submodules ---"
git submodule update --init --recursive || true

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
echo "--- Step 1/2: Building GGML ---"
cd "$PROJECT_ROOT/qwen3-tts-cpp"
if [ ! -d "ggml" ] || [ ! -f "ggml/CMakeLists.txt" ]; then
    echo "GGML submodule directory empty, fetching..."
    git submodule update --init --recursive ggml
fi

mkdir -p ggml/build
"${CMAKE}" -S ggml -B ggml/build \
    "${CMAKE_ARGS[@]}" \
    -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF -DGGML_CPU_ALL_WARNINGS=OFF \
    -DBUILD_SHARED_LIBS=ON -DCMAKE_POSITION_INDEPENDENT_CODE=ON
"${CMAKE}" --build ggml/build -j "${JOBS}"
echo "GGML built ✓"

# ---- 2. Build omnivoice-cpp (if available) ----
echo ""
echo "--- Step 2/2: Building omnivoice-cpp (optional) ---"
if [ -d "$PROJECT_ROOT/omnivoice-cpp" ] && [ -f "$PROJECT_ROOT/omnivoice-cpp/CMakeLists.txt" ]; then
    cd "$PROJECT_ROOT/omnivoice-cpp"
    mkdir -p build
    if "${CMAKE}" -S . -B build "${CMAKE_ARGS[@]}" 2>/tmp/ov-cmake-err.log; then
        if "${CMAKE}" --build build --target omnivoice -j "${JOBS}" 2>/tmp/ov-build-err.log; then
            echo "omnivoice-cpp built ✓"
        else
            echo "WARNING: OmniVoice build failed, skipping"
        fi
    else
        echo "WARNING: OmniVoice CMake configure failed, skipping"
    fi
else
    echo "omnivoice-cpp submodule not found or empty, skipping"
fi

echo ""
echo "=== All native dependencies built successfully ==="
