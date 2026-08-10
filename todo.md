# VoiceClone - TODO

## Architecture & Setup
- [x] Configurer Hugging Face API token
- [x] Mettre en place système de stockage de modèles (AsyncStorage + FileSystem)
- [x] Créer service de gestion des modèles
- [x] Créer service TTS (Qwen3-TTS, OmniVoice, Pocket TTS)
- [x] Créer service d'extraction audio vidéo
- [x] Mettre en place gestion des permissions (microphone, stockage, caméra)
- [x] Initialiser les sous-modules natifs (omnivoice-cpp, qwen3-tts-cpp)
- [x] Intégrer Pocket TTS (Kyutai) via sherpa-onnx (Android JNI dlopen + iOS Swift)
- [x] Convertir les checkpoints Pocket TTS multilingues (fr/de/pt/it/es) en ONNX int8 + fusion de insert_bos_before_voice (scripts/convert-pocket-tts-lang.sh)
- [x] Vérifier chaque langue avec sherpa-onnx (clonage + TTS classique, audio de référence normalisée)
- [x] Héberger les 5 packages sur la release pocket-tts-models

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
- [x] Créer écran À propos & Réglages (version, GitHub, carte de mise à jour, 6e onglet)

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
- [x] Publier une release GitHub avec l'APK (workflow build-apk.yml sur tag v*)
- [x] Rendre le dépôt GitHub public (requis pour la vérification de mise à jour sans jeton)

## Mise à jour (auto-update)
- [x] Vérifier la dernière version sur GitHub (API releases/latest, sans authentification)
- [x] Comparer la version installée vs la dernière release (comparaison sémantique, testée)
- [x] Bouton « Vérifier » + carte Mise à jour sur l'accueil (version installée affichée)
- [x] Télécharger l'APK avec progression + reprise, vérification taille, installation via l'installeur Android
- [x] Reprise du téléchargement partiel : fichier conservé en cache, détecté au lancement (bouton « Reprendre » + taille partielle), reprise depuis l'octet sauvegardé — testé sur émulateur (app tuée à 10 s → « 28.6 Mo / 62 Mo » → reprise → APK complet → installeur)
- [x] Écran de confirmation avant téléchargement (version cible + taille + notes, boutons Annuler/Confirmer) — testé sur émulateur (modal + Annuler + Confirmer → téléchargement réel)
- [x] Nommage explicite de l'APK sur la release : VoiceClone-vX.Y.Z-android.apk
- [x] README : quel fichier télécharger (APK vs Source code) + mode d'emploi mise à jour
- [x] Tester sur émulateur Android (SnapMcpVM x86_64) : build APK x86_64, installation, écran d'accueil + carte Mise à jour (API GitHub réelle → « à jour »), écran Réglages, navigation
- [x] Corriger un bug trouvé par le test émulateur : `getAndroidId()` (Android ID aléatoire) → `applicationId` (nom du package) pour l'autorité du FileProvider
- [x] Tester le flux de mise à jour complet : détection v4.3.5 depuis v4.3.4, notes de release réelles, téléchargement réel de l'APK 62 Mo (vérification de taille OK), lancement de l'installeur Android avec URI content:// correcte
- [x] Finaliser l'installation sur émulateur : ajout de la permission REQUEST_INSTALL_PACKAGES (requise par l'installeur, sinon « needs to declare permission ») → clic « Installer » → l'app passe de 4.3.4 à 4.3.5 (versionCode 8) et affiche « ✅ Vous êtes à jour »
- [x] Unifier le nom : « VoxClone Pro » → « VoiceClone » partout (nom affiché de l'app, écran d'accueil, Réglages, modal, messages, README, design.md, User-Agent, workflow CI). APK de la release v4.3.5 renommé en VoiceClone-v4.3.5-android.apk (ré-upload + suppression de l'ancien). Vérifié sur émulateur : écran d'accueil « VoiceClone », label APK « VoiceClone », détection de mise à jour OK avec le nouvel asset

## v4.3.7 — Export, profils & consentement
- [x] Exporter les fichiers audio générés : bouton « ⤴ Exporter » sur chaque génération (Synthèse + Clonage) via expo-sharing (Android) et téléchargement direct (web). Nom de fichier lisible `VoiceClone_<texte>_<timestamp>.wav`
- [x] Corriger la sélection d'un profil sauvegardé dans Clonage : `setReference` ne mettait pas `isReady` à true → seules l'étape 1 s'affichait après redémarrage. Fix dans `useReferencePicker` (isReady suit la référence)
- [x] Profils : bouton « Utiliser » sur chaque carte → bascule vers l'onglet Clonage avec le profil pré-sélectionné (param `?profileId=`)
- [x] Écran de consentement au premier lancement : texte professionnel (responsabilité, usages interdits, « en l'état »), boutons « J'accepte » / « Refuser et quitter » (quitte l'app). Persisté dans AsyncStorage
- [x] Réglages : interrupteur « Consentement & responsabilité » — le retirer bloque (web/iOS) ou ferme (Android) l'app jusqu'à un nouvel accord — testé sur émulateur (gate affiché → accepter → app ; toggle off → relance → gate de nouveau)

## v4.3.8 — Style par texte & capacités des moteurs
- [x] Vérifier dans le code natif quels moteurs acceptent des instructions de style/émotion : OmniVoice (attributs de voix : genre, âge, hauteur, chuchotement, accent — vocabulaire voice-design), Qwen3-TTS (instruct ignoré par notre portage local : seul texte + embedding de voix alimentent le transformer), Pocket TTS (aucun)
- [x] Champ « Style & intonation (texte) » dans Synthèse pour OmniVoice : saisie libre + chips rapides + validation JS contre le vocabulaire voice-design (avertissement avant la synthèse), prioritaire sur le preset
- [x] Gestionnaire de modèles : badges « ✍️ Style par texte : oui/non » + « ✅ Atouts » / « ⚠️ Limites » sur chaque moteur (vérifiés sur le web)
- [x] README : tableau des moteurs enrichi (colonne Style par texte + note honnête sur l'absence d'émotion progressive)
