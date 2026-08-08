# VoxClone Pro - TODO

## Architecture & Setup
- [x] Configurer Hugging Face API token
- [x] Mettre en place système de stockage de modèles (AsyncStorage + FileSystem)
- [x] Créer service de gestion des modèles
- [x] Créer service TTS (Qwen3-TTS, OmniVoice, Pocket TTS)
- [x] Créer service d'extraction audio vidéo
- [x] Mettre en place gestion des permissions (microphone, stockage, caméra)
- [x] Initialiser les sous-modules natifs (omnivoice-cpp, qwen3-tts-cpp)
- [x] Intégrer Pocket TTS (Kyutai) via sherpa-onnx (Android JNI dlopen + iOS Swift)

## Interface Utilisateur
- [x] Créer écran Home avec navigation par onglets
- [x] Créer écran Synthesis (saisie texte + sélection voix)
- [x] Créer écran Voice Cloning (upload audio référence + enregistrement micro)
- [x] Créer écran Video to Audio (extraction MP4 → WAV, fusionné dans Clonage)
- [x] Créer écran Models Manager (liste modèles, installation)
- [x] Créer écran Profils de voix (liste + éditeur, paramètres avancés)
- [x] Implémenter animations Android 16/17 (transitions, haptics)
- [x] Implémenter dark mode
- [x] Créer composants réutilisables (buttons, cards, loaders)

## Fonctionnalités Synthèse Vocale
- [x] Intégrer Qwen3-TTS (0.6B model) - 100% LOCAL
- [x] Intégrer OmniVoice (600+ langues) - 100% LOCAL
- [x] Intégrer Pocket TTS (Kyutai, 100M, 2026) - 100% LOCAL
- [x] Implémenter sélection de voix prédéfinies (résolues par moteur)
- [x] Implémenter clonage de voix (3-10s audio) - audio, vidéo, enregistrement
- [x] Implémenter sélection de langue (filtrée par moteur)
- [x] Implémenter paramètres avancés (pauses par ponctuation, vitesse, volume)
- [x] Implémenter profils de voix persistants (modèle + langue + voix + paramètres)
- [x] Corriger crash web (module natif manquant sur web → fallback)
- [ ] Implémenter contrôles de lecture (play, pause, stop) - partiel (play/stop)
- [ ] Implémenter export audio (partage)

## Gestion des Modèles
- [x] Catalogue de modèles (OmniVoice, Qwen3-TTS, Pocket TTS)
- [x] Téléchargement modèles en arrière-plan (fichiers individuels, reprise)
- [x] Suppression modèles (avec release du moteur natif)
- [x] Indicateur espace disque
- [ ] Pause/reprise téléchargement
- [ ] Recherche/filtrage modèles

## Extraction Audio Vidéo (INTÉGRÉ DANS VOICE CLONING)
- [x] Implémenter upload vidéo (MP4, WebM) - Dans Voice Cloning
- [x] Implémenter extraction audio en arrière-plan - Automatique lors du clonage
- [x] Implémenter conversion MP4 → WAV 24kHz - Automatique en background
- [x] Afficher barre de progression extraction
- [x] Ajouter intégration avec Voice Cloning - FUSIONNÉ

## Stockage & Persistance
- [x] AsyncStorage pour données utilisateur (profils, modèles installés)
- [x] FileSystem pour stockage modèles/audio
- [x] Persistance des WAV de référence des profils (documents, hors cache)
- [ ] Implémenter nettoyage cache automatique (partiel : cleanup 1h natif)

## Tests & Qualité
- [x] Tests unitaires du pipeline audio (segmentation, WAV, silence, WSOLA)
- [x] Vérification typecheck TypeScript
- [x] Vérification build web (plus de crash module natif)
- [x] Compilation C++ JNI validée (NDK arm64)
- [x] Build APK release
- [ ] Tester clonage de voix sur Android réel (Pocket TTS + OmniVoice + Qwen3)
- [ ] Tester installation des modèles sur appareil
- [ ] Tester dark mode sur appareil

## Build & Deployment
- [x] Générer APK Android (release, signé debug)
- [x] Préparer documentation utilisateur
- [ ] Publier une release GitHub avec l'APK
