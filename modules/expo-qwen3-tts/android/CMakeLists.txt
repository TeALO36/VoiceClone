cmake_minimum_required(VERSION 3.22.0)
project(voxclone_native LANGUAGES C CXX)

# Everything is built in a single CMake pass driven by Gradle:
# ggml (static) + the OmniVoice engine sources + the JNI bridge, all linked
# into one libqwen3tts_jni.so. Nothing is pre-built by CI and nothing is
# staged through jniLibs, so there is no second copy of ggml to collide with.

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

get_filename_component(PROJECT_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/../../.. ABSOLUTE)
set(OV_DIR "${PROJECT_ROOT}/omnivoice-cpp")
set(Q3_DIR "${PROJECT_ROOT}/qwen3-tts-cpp")

if(NOT EXISTS "${OV_DIR}/src/omnivoice.cpp")
    message(FATAL_ERROR
        "omnivoice-cpp submodule is missing at ${OV_DIR}.\n"
        "Run: git submodule update --init --recursive")
endif()

# ── ggml: static, portable arm64, no host tuning ──
# -march=native and the x86 instruction-set options are meaningless when
# cross-compiling for Android and make the build fail outright.
set(GGML_NATIVE           OFF CACHE BOOL "" FORCE)

# Without this the NDK compiles baseline ARMv8-a: ggml's dotprod / i8mm probes
# all fail because clang defaults to armv8-a for arm64 and the intrinsics do not
# compile, so it silently falls back to the slow generic kernels. Q4_K matmul —
# which is the whole inference cost here — runs several times faster with SDOT.
# armv8.2-a+dotprod covers essentially every Android device shipped since 2018;
# anything older cannot hold a 700 MB model anyway. i8mm is deliberately left
# out: it needs ARMv8.6 (2021+) and would SIGILL on older hardware.
set(GGML_CPU_ARM_ARCH "armv8.2-a+dotprod" CACHE STRING "" FORCE)
set(GGML_OPENMP           OFF CACHE BOOL "" FORCE)
set(GGML_LLAMAFILE        OFF CACHE BOOL "" FORCE)
set(GGML_BLAS             OFF CACHE BOOL "" FORCE)
set(GGML_ACCELERATE       OFF CACHE BOOL "" FORCE)
set(GGML_CCACHE           OFF CACHE BOOL "" FORCE)
set(GGML_BACKEND_DL       OFF CACHE BOOL "" FORCE)
set(GGML_CPU_ALL_VARIANTS OFF CACHE BOOL "" FORCE)
set(GGML_ALL_WARNINGS     OFF CACHE BOOL "" FORCE)
set(GGML_FATAL_WARNINGS   OFF CACHE BOOL "" FORCE)
set(GGML_BUILD_TESTS      OFF CACHE BOOL "" FORCE)
set(GGML_BUILD_EXAMPLES   OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS     OFF CACHE BOOL "" FORCE)

# OmniVoice's audio-tokenizer tensor names exceed ggml's default of 64.
# This has to be set before ggml is configured so every translation unit
# agrees on sizeof(ggml_tensor) — a mismatch here is a silent memory bug.
add_compile_definitions(GGML_MAX_NAME=128)

add_subdirectory("${OV_DIR}/ggml" "${CMAKE_CURRENT_BINARY_DIR}/ggml" EXCLUDE_FROM_ALL)

# omnivoice.cpp includes "version.h", normally emitted by a git-driven custom
# target we don't run here. Generate an equivalent.
set(OV_GENERATED_DIR "${CMAKE_CURRENT_BINARY_DIR}/generated")
file(MAKE_DIRECTORY "${OV_GENERATED_DIR}")
file(WRITE "${OV_GENERATED_DIR}/version.h"
     "#pragma once\n#define OMNIVOICE_VERSION \"voxclone-android\"\n")

add_library(qwen3tts_jni SHARED
    ${CMAKE_CURRENT_SOURCE_DIR}/../cpp/voxclone-jni.cpp
    ${OV_DIR}/src/omnivoice.cpp
    ${OV_DIR}/src/pipeline-codec.cpp
    ${OV_DIR}/src/pipeline-tts.cpp
    ${Q3_DIR}/src/qwen3tts_c_api.cpp
    ${Q3_DIR}/src/qwen3_tts.cpp
    ${Q3_DIR}/src/text_tokenizer.cpp
    ${Q3_DIR}/src/tts_transformer.cpp
    ${Q3_DIR}/src/coreml_code_predictor_stub.cpp
    ${Q3_DIR}/src/audio_tokenizer_encoder.cpp
    ${Q3_DIR}/src/audio_tokenizer_decoder.cpp
    ${Q3_DIR}/src/gguf_loader.cpp
)

# Matches how omnivoice-core is built upstream: no dllimport/visibility games,
# the engine sources and the JNI bridge live in the same binary.
target_compile_definitions(qwen3tts_jni PRIVATE OMNIVOICE_STATIC)

target_include_directories(qwen3tts_jni PRIVATE
    ${OV_DIR}/src
    ${OV_DIR}
    ${OV_GENERATED_DIR}
    ${Q3_DIR}/src
)
target_include_directories(qwen3tts_jni SYSTEM PRIVATE
    ${OV_DIR}/ggml/include
)

target_compile_options(qwen3tts_jni PRIVATE
    -O3
    -fexceptions
    -frtti
    -Wno-unused-parameter
    -Wno-unused-function
)

target_link_libraries(qwen3tts_jni PRIVATE
    ggml
    ggml-base
    ggml-cpu
    log
    android
    atomic
    m
)
