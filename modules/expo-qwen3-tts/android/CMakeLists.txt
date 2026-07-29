cmake_minimum_required(VERSION 3.22.0)
project(qwen3tts_native)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

get_filename_component(PROJECT_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/../../.. ABSOLUTE)
set(QWEN3_CPP_DIR "${PROJECT_ROOT}/qwen3-tts-cpp")
set(GGML_DIR "${QWEN3_CPP_DIR}/ggml")
set(OV_CPP_DIR "${PROJECT_ROOT}/omnivoice-cpp")

# Pre-built libraries (built by CI: build-native-deps.sh)
set(QWEN3_BUILD_DIR "${QWEN3_CPP_DIR}/build")
set(GGML_BUILD_DIR "${GGML_DIR}/build")
set(OV_BUILD_DIR "${OV_CPP_DIR}/build")

# Our JNI source
set(JNI_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/../cpp/qwen3-tts-jni.cpp
)

# Check if OmniVoice libs exist
set(OMNIVOICE_AVAILABLE OFF)
if(EXISTS "${OV_BUILD_DIR}/libomnivoice.a" OR EXISTS "${OV_BUILD_DIR}/libomnivoice.so")
    list(APPEND JNI_SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/../cpp/omnivoice-jni.cpp)
    set(OMNIVOICE_AVAILABLE ON)
    add_compile_definitions(HAS_OMNIVOICE=1)
endif()

add_library(qwen3tts SHARED ${JNI_SOURCES})

target_include_directories(qwen3tts PRIVATE
    ${QWEN3_CPP_DIR}/src
    ${GGML_DIR}/include
)

if(OMNIVOICE_AVAILABLE)
    target_include_directories(qwen3tts PRIVATE ${OV_CPP_DIR}/src)
endif()

# qwen3tts_shared is a pre-built shared library that contains ALL qwen3-tts-cpp
# symbols (qwen3_tts, text_tokenizer, tts_transformer, audio_tokenizer_encoder,
# audio_tokenizer_decoder are all linked INTO it as PRIVATE dependencies).
# GGML libs are separate shared libraries.
#
# Build order in CI:
#   1. scripts/build-native-deps.sh → produces these libraries
#   2. expo prebuild → copies this CMakeLists.txt
#   3. Gradle → calls CMake → links our JNI code against pre-built libs

target_link_directories(qwen3tts PRIVATE
    ${QWEN3_BUILD_DIR}
    ${GGML_BUILD_DIR}/src
)

target_link_libraries(qwen3tts
    qwen3tts_shared
    ggml
    ggml-base
    ggml-cpu
    log
    atomic
    m
)

if(OMNIVOICE_AVAILABLE)
    target_link_directories(qwen3tts PRIVATE ${OV_BUILD_DIR})
    target_link_libraries(qwen3tts PUBLIC omnivoice)
endif()
