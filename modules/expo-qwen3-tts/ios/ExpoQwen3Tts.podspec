Pod::Spec.new do |s|
  s.name           = 'ExpoQwen3Tts'
  s.version        = '1.0.0'
  s.summary        = 'Qwen3-TTS native module for on-device TTS'
  s.description    = 'Runs Qwen3-TTS GGUF models on-device via C++ inference engine'
  s.homepage       = 'https://github.com/predict-woo/qwen3-tts.cpp'
  s.license        = 'MIT'
  s.author         = ''
  s.source         = { :git => '' }
  s.source_files   = 'ios/**/*.{h,m,mm,swift}', 'cpp/**/*.{h,cpp}'
  s.requires_arc   = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'OTHER_CPLUSPLUSFLAGS' => '-std=c++17 -O3',
  }
end
