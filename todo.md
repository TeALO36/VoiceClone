# VoxClone Pro - TODO

## Architecture & Setup
- [x] Configurer Hugging Face API token
- [x] Mettre en place système de stockage de modèles (AsyncStorage + FileSystem)
- [x] Créer service de gestion des modèles
- [x] Créer service TTS (Qwen3-TTS, OmniVoice)
- [x] Créer service d'extraction audio vidéo
- [x] Mettre en place gestion des permissions (microphone, stockage, caméra)

## Interface Utilisateur
- [x] Créer écran Home avec navigation par onglets
- [x] Créer écran Synthesis (saisie texte + sélection voix)
- [ ] Créer écran Voice Cloning (upload audio référence)
- [x] Créer écran Video to Audio (extraction MP4 → MP3)
- [x] Créer écran Models Manager (liste modèles, installation)
- [ ] Créer écran Settings (thème, langue, stockage)
- [x] Implémenter animations Android 16/17 (transitions, haptics)
- [x] Implémenter dark mode
- [x] Créer composants réutilisables (buttons, cards, loaders)

## Fonctionnalités Synthèse Vocale
- [x] Intégrer Qwen3-TTS (0.6B model) - 100% LOCAL
- [x] Intégrer OmniVoice (600+ langues) - 100% LOCAL
- [x] Implémenter sélection de voix prédéfinies
- [x] Implémenter clonage de voix (3-10s audio) - FUSIONNÉ AVEC VIDEO TO AUDIO
- [ ] Implémenter contrôles de lecture (play, pause, stop)
- [ ] Implémenter export audio (partage)
- [ ] Ajouter indicateurs de progression synthèse

## Gestion des Modèles
- [ ] Créer catalogue de modèles Hugging Face
- [ ] Implémenter téléchargement modèles en arrière-plan
- [ ] Implémenter pause/reprise téléchargement
- [ ] Implémenter suppression modèles
- [ ] Afficher indicateur espace disque
- [ ] Implémenter recherche/filtrage modèles

## Extraction Audio Vidéo (INTÉGRÉ DANS VOICE CLONING)
- [x] Implémenter upload vidéo (MP4, WebM) - Dans Voice Cloning
- [x] Implémenter extraction audio en arrière-plan - Automatique lors du clonage
- [x] Implémenter conversion MP4 → MP3 - Automatique en background
- [x] Afficher barre de progression extraction
- [x] Implémenter sauvegarde audio extrait
- [x] Ajouter intégration avec Voice Cloning - FUSIONNÉ

## Stockage & Persistance
- [ ] Configurer AsyncStorage pour données utilisateur
- [ ] Implémenter FileSystem pour stockage modèles/audio
- [ ] Implémenter cache management
- [ ] Implémenter nettoyage cache automatique

## Notifications & Feedback
- [ ] Implémenter haptic feedback (taps, succès, erreurs)
- [ ] Implémenter notifications de progression
- [ ] Implémenter notifications d'erreur
- [ ] Implémenter notifications de succès

## Branding & Configuration
- [x] Générer logo/icône app
- [x] Mettre à jour app.config.ts (appName, logo)
- [x] Configurer splash screen
- [x] Configurer couleurs theme (Material Design 3)

## Tests & Qualité
- [x] Tester synthèse vocale 100% LOCAL
- [x] Tester clonage de voix 100% LOCAL
- [ ] Tester clonage de voix
- [ ] Tester extraction audio vidéo
- [ ] Tester téléchargement modèles
- [ ] Tester sur Android réel
- [ ] Tester dark mode
- [ ] Vérifier accessibilité (contraste, tailles tactiles)

## Build & Deployment
- [ ] Générer APK Android
- [ ] Tester APK sur appareil
- [ ] Optimiser taille APK
- [ ] Préparer documentation utilisateur
