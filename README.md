# VoxClone Pro

Synthèse vocale et **clonage de voix 100 % local** — aucun serveur, aucune API cloud.

Trois moteurs on-device :

| Moteur | Taille | Clonage | Langues | Notes |
|--------|--------|---------|---------|-------|
| **Pocket TTS (Kyutai)** | ~190 Mo (fr : ~380 Mo) | Zéro-shot | **en, fr, de, pt, it, es** | Modèle 2026, très rapide sur CPU, via sherpa-onnx |
| **OmniVoice** | ~630 Mo | Zéro-shot | 646+ | Instruction de voix libre |
| **Qwen3-TTS 0.6B** | ~1,5 Go | Zéro-shot | 10 | Le plus fidèle, sans transcription |

## Fonctionnalités

- **Clonage de voix zéro-shot** : un échantillon de 3 à 10 s suffit.
  - Source de l'échantillon : fichier audio (MP3, WAV, M4A…), **enregistrement direct depuis l'app** (micro), ou **vidéo** (MP4, MKV, AVI…) dont l'audio est extrait automatiquement.
- **Synthèse classique** : voix prédéfinies (Pocket TTS embarque des voix de référence, OmniVoice prend des instructions vocales).
- **Sélection de langue** par moteur — Pocket TTS propose désormais **6 langues** (en/fr/de/pt/it/es), une par modèle : le sélecteur est verrouillé sur la langue du modèle Pocket choisi.
- **Pocket TTS multilingue** : les checkpoints Kyutai par langue sont convertis en ONNX int8 (avec `insert_bos_before_voice` fusionné dans l'encodeur, indispensable aux modèles multilingues) et hébergés sur la release `pocket-tts-models` de ce dépôt — voir `scripts/convert-pocket-tts-lang.sh`.
- **Profils de voix** : enregistrez tout un réglage — modèle, langue, voix de référence, et paramètres de parole — puis réutilisez-le en un tap depuis la Synthèse ou le Clonage.
- **Paramètres avancés** appliqués au clonage :
  - Pause supplémentaire après **chaque virgule, point, deux-points, point-virgule, question, exclamation et saut de ligne** (de 0 à 3 s).
  - **Vitesse de parole** (0,5×–2×, préservation de la hauteur via WSOLA).
  - **Volume**.
  - Présets : Naturel, Lecture posée, Narrateur dramatique, Radio/télégraphique.
- File de génération (les synthèses lourdes s'enchaînent sans bloquer l'UI).
- Interface Android 16/17 (NativeWind, dark mode, haptics).

## Installation (web, pour le développement)

```bash
pnpm install
pnpm dev          # expo start --web
pnpm check        # typecheck TypeScript
node scripts/test-audio-pipeline.js   # tests unitaires du pipeline audio
```

## Build Android

1. **Initialiser les sous-modules** (moteurs C++ OmniVoice + Qwen3-TTS) :

   ```bash
   git submodule update --init --recursive
   ```

2. **Récupérer le runtime Pocket TTS** (sherpa-onnx, binaires arm64-v8a ~26 Mo) :

   ```bash
   bash scripts/fetch-sherpa-onnx-android.sh
   ```

3. Build :

   ```bash
   npx expo prebuild --platform android
   cd android && ./gradlew assembleRelease
   ```

   L'APK est signé avec le keystore de debug (installable par sideload) :
   `android/app/build/outputs/apk/release/app-release.apk`

## Build iOS

```bash
bash scripts/fetch-sherpa-onnx-ios.sh   # XCFramework SherpaOnnxC (~30 Mo)
npx expo prebuild --platform ios
```

Le module iOS implémente Pocket TTS via le framework C de sherpa-onnx et la
conversion audio/vidéo par AVFoundation.

## Installation des modèles dans l'app

Les modèles se téléchargent depuis l'onglet **Modèles** (fichiers individuels,
reprise de téléchargement, vérification d'espace disque, barre de progression
pondérée par le poids réel de chaque fichier) :

- **Pocket TTS multilingue (fr, de, pt, it, es)** : `TeALO/pocket-tts-models`
  sur HuggingFace — checkpoints Kyutai convertis en ONNX int8 avec
  `insert_bos_before_voice` fusionné dans l'encodeur. Le français (24 couches)
  est généré avec `frames_after_eos: 8` (recommandation Kyutai) et une
  vérification de fin de phrase : si le dernier mot est tronqué, la génération
  est relancée avec un nouveau seed (jusqu'à 3 essais).
- **Pocket TTS anglais** : `csukuangfj2/sherpa-onnx-pocket-tts-int8-2026-01-26`
  (bundle officiel).
- OmniVoice / Qwen3-TTS : miroirs GGUF existants.

## Architecture

- `lib/services/local-tts.ts` — orchestration des moteurs + pipeline des paramètres avancés.
- `lib/services/audio-pipeline.ts` — segmentation par ponctuation, codec WAV, insertion de silence, time-stretch WSOLA (pur TS, testé).
- `lib/services/profiles.ts` — persistance des profils (AsyncStorage + WAV de référence dans les documents).
- `modules/expo-qwen3-tts/` — module natif : pont JNI C++ (Android), module Swift (iOS), fallback web.
  - `cpp/voxclone-jni.cpp` — OmniVoice + Qwen3-TTS compilés dans `libqwen3tts_jni.so` ; Pocket TTS chargé par `dlopen` de `libsherpa-onnx-c-api.so`.
