Pod::Spec.new do |s|
  s.name           = 'ExpoQwen3Tts'
  s.version        = '1.0.0'
  s.summary        = 'On-device TTS native module (OmniVoice, Qwen3-TTS, Pocket TTS)'
  s.description    = 'Runs on-device TTS models: OmniVoice + Qwen3-TTS on Android, Pocket TTS (sherpa-onnx) on Android and iOS'
  s.homepage       = 'https://github.com/predict-woo/qwen3-tts.cpp'
  s.license        = 'MIT'
  s.author         = ''
  s.source         = { :git => '' }
  # Only the Swift module is compiled for iOS: cpp/ holds the Android JNI
  # bridge (voxclone-jni.cpp) which cannot compile outside the NDK.
  s.source_files   = 'ios/**/*.{h,m,mm,swift}'
  s.requires_arc   = true

  s.dependency 'ExpoModulesCore'

  # Pocket TTS runtime: SherpaOnnxC framework (C API, onnxruntime statically
  # linked). Fetch it with scripts/fetch-sherpa-onnx-ios.sh.
  s.vendored_frameworks = 'Frameworks/sherpa-onnx.xcframework'

  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'OTHER_CPLUSPLUSFLAGS' => '-std=c++17 -O3',
  }
end
