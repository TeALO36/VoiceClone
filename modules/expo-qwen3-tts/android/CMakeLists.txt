cmake_minimum_required(VERSION 3.22.0)
project(qwen3tts_native)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

get_filename_component(PROJECT_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/../../.. ABSOLUTE)
set(QWEN3_CPP_DIR "${PROJECT_ROOT}/qwen3-tts-cpp")
set(GGML_DIR "${QWEN3_CPP_DIR}/ggml")
set(OV_CPP_DIR "${PROJECT_ROOT}/omnivoice-cpp")

# Pre-built libraries (built by CI: scripts/build-native-deps.sh)
# qwen3-tts-cpp OUTPUT_NAME is "qwen3tts" (line 183 of its CMakeLists.txt)
# so libqwen3tts.so is produced, NOT libqwen3tts_shared.so
set(QWEN3_BUILD_DIR "${QWEN3_CPP_DIR}/build")
set(GGML_BUILD_DIR "${GGML_DIR}/build/src")
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

# 🔴 IMPORTANT: Our JNI target MUST have a DIFFERENT name than the
# pre-built library libqwen3tts.so from qwen3-tts-cpp.
# If both are named 'qwen3tts', CMake errors: "Target links to itself".
# The JNI wrapper -> qwen3tts_jni, the pre-built engine -> qwen3tts
add_library(qwen3tts_jni SHARED ${JNI_SOURCES})

target_include_directories(qwen3tts_jni PRIVATE
    ${QWEN3_CPP_DIR}/src
    ${GGML_DIR}/include
)

if(OMNIVOICE_AVAILABLE)
    target_include_directories(qwen3tts_jni PRIVATE ${OV_CPP_DIR}/src)
endif()

# libqwen3tts.so (from qwen3tts_shared target, OUTPUT_NAME="qwen3tts")
# already contains ALL symbols: ggml, text_tokenizer, tts_transformer,
# audio_tokenizer_encoder, audio_tokenizer_decoder.
# We only need to link against it — GGML libs are embedded inside.
target_link_directories(qwen3tts_jni PRIVATE
    ${QWEN3_BUILD_DIR}
)

target_link_libraries(qwen3tts_jni
    qwen3tts
    log
    atomic
    m
)

if(OMNIVOICE_AVAILABLE)
    target_link_directories(qwen3tts_jni PRIVATE ${OV_BUILD_DIR})
    target_link_libraries(qwen3tts_jni PUBLIC omnivoice)
endif()
