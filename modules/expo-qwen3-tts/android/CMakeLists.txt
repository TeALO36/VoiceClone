cmake_minimum_required(VERSION 3.22.0)
project(qwen3tts_native)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Paths to qwen3-tts-cpp submodule (cloned at project root)
get_filename_component(PROJECT_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/../../.. ABSOLUTE)
set(QWEN3_CPP_DIR "${PROJECT_ROOT}/qwen3-tts-cpp")

# ============================================================
# Step 1: Build GGML (dependency for qwen3-tts-cpp)
# ============================================================
set(GGML_DIR "${QWEN3_CPP_DIR}/ggml")
set(GGML_BUILD_DIR "${CMAKE_BINARY_DIR}/ggml")

# Only build GGML if it hasn't been built yet
if(NOT EXISTS "${GGML_BUILD_DIR}/CMakeCache.txt")
    execute_process(
        COMMAND ${CMAKE_COMMAND}
            -S ${GGML_DIR}
            -B ${GGML_BUILD_DIR}
            -DGGML_NATIVE=OFF
            -DGGML_OPENMP=OFF
            -DGGML_CPU_ALL_WARNINGS=OFF
            -DCMAKE_BUILD_TYPE=Release
            -DCMAKE_TOOLCHAIN_FILE=${CMAKE_TOOLCHAIN_FILE}
            -DANDROID_ABI=${ANDROID_ABI}
            -DANDROID_PLATFORM=${ANDROID_PLATFORM}
            -DANDROID_NDK=${ANDROID_NDK}
        RESULT_VARIABLE GGML_CFG_RESULT
    )
    if(NOT GGML_CFG_RESULT EQUAL 0)
        message(FATAL_ERROR "GGML CMake configuration failed")
    endif()
endif()

# Build GGML
execute_process(
    COMMAND ${CMAKE_COMMAND} --build ${GGML_BUILD_DIR} --target ggml ggml-base ggml-cpu -j8
    RESULT_VARIABLE GGML_BUILD_RESULT
)
if(NOT GGML_BUILD_RESULT EQUAL 0)
    message(FATAL_ERROR "GGML build failed")
endif()
message(STATUS "GGML built successfully at ${GGML_BUILD_DIR}")

# ============================================================
# Step 2: Build qwen3-tts-cpp static libraries
# ============================================================
set(QWEN3_BUILD_DIR "${CMAKE_BINARY_DIR}/qwen3_tts")

if(NOT EXISTS "${QWEN3_BUILD_DIR}/CMakeCache.txt")
    execute_process(
        COMMAND ${CMAKE_COMMAND}
            -S ${QWEN3_CPP_DIR}
            -B ${QWEN3_BUILD_DIR}
            -DCMAKE_BUILD_TYPE=Release
            -DQWEN3_TTS_TIMING=OFF
            -DQWEN3_TTS_COREML=OFF
            -DCMAKE_TOOLCHAIN_FILE=${CMAKE_TOOLCHAIN_FILE}
            -DANDROID_ABI=${ANDROID_ABI}
            -DANDROID_PLATFORM=${ANDROID_PLATFORM}
            -DANDROID_NDK=${ANDROID_NDK}
        RESULT_VARIABLE QWEN3_CFG_RESULT
    )
    if(NOT QWEN3_CFG_RESULT EQUAL 0)
        message(FATAL_ERROR "qwen3-tts-cpp CMake configuration failed")
    endif()
endif()

# Build the shared library (qwen3tts_shared) which contains the C API
execute_process(
    COMMAND ${CMAKE_COMMAND} --build ${QWEN3_BUILD_DIR} --target qwen3tts_shared -j8
    RESULT_VARIABLE QWEN3_BUILD_RESULT
)
if(NOT QWEN3_BUILD_RESULT EQUAL 0)
    message(FATAL_ERROR "qwen3-tts-cpp build failed")
endif()
message(STATUS "qwen3-tts-cpp built successfully at ${QWEN3_BUILD_DIR}")

# ============================================================
# Step 3: Build our JNI shared library
# ============================================================
add_library(
    qwen3tts
    SHARED
    ${CMAKE_CURRENT_SOURCE_DIR}/../cpp/qwen3-tts-jni.cpp
)

target_include_directories(qwen3tts PRIVATE
    ${QWEN3_CPP_DIR}/src
    ${GGML_DIR}/include
)

target_link_directories(qwen3tts PRIVATE
    ${QWEN3_BUILD_DIR}
    ${GGML_BUILD_DIR}/src
)

target_link_libraries(qwen3tts
    qwen3tts_shared
    qwen3_tts
    text_tokenizer
    tts_transformer
    audio_tokenizer_encoder
    audio_tokenizer_decoder
    ggml
    ggml-base
    ggml-cpu
    log
)
