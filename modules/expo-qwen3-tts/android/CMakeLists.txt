cmake_minimum_required(VERSION 3.22.0)
project(qwen3tts_native)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

get_filename_component(PROJECT_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/../../.. ABSOLUTE)
set(QWEN3_CPP_DIR "${PROJECT_ROOT}/qwen3-tts-cpp")
set(GGML_DIR "${QWEN3_CPP_DIR}/ggml")
set(OV_CPP_DIR "${PROJECT_ROOT}/omnivoice-cpp")

set(GGML_BUILD_DIR "${GGML_DIR}/build/src")
set(OV_BUILD_DIR "${OV_CPP_DIR}/build")

# Source files for JNI and Qwen3-TTS engine
set(JNI_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/../cpp/qwen3-tts-jni.cpp
    ${QWEN3_CPP_DIR}/src/qwen3tts_c_api.cpp
    ${QWEN3_CPP_DIR}/src/qwen3_tts.cpp
    ${QWEN3_CPP_DIR}/src/text_tokenizer.cpp
    ${QWEN3_CPP_DIR}/src/tts_transformer.cpp
    ${QWEN3_CPP_DIR}/src/coreml_code_predictor_stub.cpp
    ${QWEN3_CPP_DIR}/src/audio_tokenizer_encoder.cpp
    ${QWEN3_CPP_DIR}/src/audio_tokenizer_decoder.cpp
    ${QWEN3_CPP_DIR}/src/gguf_loader.cpp
)

# Check if OmniVoice libs exist
set(OMNIVOICE_AVAILABLE OFF)
if(EXISTS "${OV_BUILD_DIR}/libomnivoice.so" OR EXISTS "${OV_BUILD_DIR}/libomnivoice.a")
    list(APPEND JNI_SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/../cpp/omnivoice-jni.cpp)
    set(OMNIVOICE_AVAILABLE ON)
    add_compile_definitions(HAS_OMNIVOICE=1)
endif()

add_library(qwen3tts_jni SHARED ${JNI_SOURCES})

target_include_directories(qwen3tts_jni PRIVATE
    ${QWEN3_CPP_DIR}/src
    ${GGML_DIR}/include
)

if(OMNIVOICE_AVAILABLE)
    target_include_directories(qwen3tts_jni PRIVATE ${OV_CPP_DIR}/src)
endif()

target_link_directories(qwen3tts_jni PRIVATE
    ${GGML_BUILD_DIR}
)

target_link_libraries(qwen3tts_jni PRIVATE
    ggml
    ggml-base
    ggml-cpu
    log
    atomic
    m
)

if(OMNIVOICE_AVAILABLE)
    target_link_directories(qwen3tts_jni PRIVATE ${OV_BUILD_DIR})
    target_link_libraries(qwen3tts_jni PRIVATE omnivoice)
endif()
