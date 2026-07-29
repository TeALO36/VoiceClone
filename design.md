# VoxClone Pro - Design Mobile

## Vue d'ensemble
Application de synthèse vocale (TTS) avec clonage de voix, extraction audio depuis vidéo, et gestion dynamique de modèles Hugging Face. Interface moderne inspirée d'Android 16/17 avec animations natives.

## Écrans principaux

### 1. Home (Accueil)
- **Contenu principal**:
  - Bouton flottant "Nouvelle synthèse" (FAB - Floating Action Button)
  - Liste des synthèses récentes (cards)
  - Modèles actuellement installés (chips avec badge de taille)
  - Espace de stockage disponible (progress bar)

- **Fonctionnalités**:
  - Accès rapide aux 3 dernières synthèses
  - Bouton pour gérer les modèles
  - Statistiques d'utilisation

### 2. Synthesis Screen (Synthèse vocale)
- **Contenu principal**:
  - Sélecteur de modèle (dropdown avec icônes)
  - Zone de saisie texte (multi-ligne)
  - Contrôles de voix:
    - Sélection de voix prédéfinie (carousel horizontal)
    - OU Clonage de voix (upload audio)
  - Bouton "Synthétiser" (primaire)
  - Prévisualisation audio (player)

- **Fonctionnalités**:
  - Validation du texte en temps réel
  - Indicateur de progression pendant la synthèse
  - Contrôles de lecture (play, pause, stop)
  - Export audio (partage)

### 3. Video to Audio Screen
- **Contenu principal**:
  - Zone de drop/upload vidéo (MP4, WebM)
  - Barre de progression extraction
  - Prévisualisation audio extraite
  - Bouton "Utiliser pour clonage"

- **Fonctionnalités**:
  - Extraction audio en arrière-plan
  - Conversion MP4 → MP3
  - Affichage durée vidéo/audio
  - Sauvegarde automatique

### 4. Models Manager Screen
- **Contenu principal**:
  - Onglets: "Installés" | "Disponibles"
  - Liste des modèles avec:
    - Nom, taille, langue(s)
    - Bouton Installer/Supprimer
    - Barre de progression téléchargement
  - Recherche/filtrage par langue

- **Fonctionnalités**:
  - Téléchargement en arrière-plan
  - Pause/reprise téléchargement
  - Suppression sécurisée
  - Indicateur d'espace disque

### 5. Voice Cloning Screen
- **Contenu principal**:
  - Upload audio de référence
  - Affichage de la durée (3-10s recommandé)
  - Paramètres de clonage:
    - Langue
    - Qualité (rapide/normal/haute)
  - Bouton "Cloner"
  - Prévisualisation voix clonée

- **Fonctionnalités**:
  - Validation durée audio
  - Indicateur qualité audio
  - Sauvegarde voix clonée

### 6. Settings Screen
- **Contenu principal**:
  - Paramètres généraux:
    - Thème (clair/sombre/auto)
    - Langue interface
  - Stockage:
    - Espace utilisé/disponible
    - Bouton "Nettoyer cache"
  - À propos
    - Version app
    - Lien GitHub

## Flux utilisateur principaux

### Flux 1: Synthèse simple
1. Accueil → Tap FAB
2. Synthesis Screen → Saisir texte
3. Sélectionner voix prédéfinie
4. Tap "Synthétiser"
5. Écouter/Exporter

### Flux 2: Clonage de voix
1. Accueil → Tap FAB
2. Synthesis Screen → Saisir texte
3. Tap "Cloner une voix"
4. Upload audio référence
5. Tap "Cloner"
6. Tap "Synthétiser" avec voix clonée
7. Écouter/Exporter

### Flux 3: Extraction vidéo
1. Accueil → Tap "Vidéo"
2. Video to Audio → Upload MP4
3. Attendre extraction
4. Tap "Utiliser pour clonage"
5. Voice Cloning Screen

### Flux 4: Installation modèle
1. Accueil → Tap "Modèles"
2. Models Manager → Onglet "Disponibles"
3. Tap modèle
4. Tap "Installer"
5. Attendre téléchargement
6. Notification succès

## Choix de couleurs (Material Design 3)

| Élément | Couleur | Usage |
|---------|---------|-------|
| Primary | #6366F1 (Indigo) | Boutons, accents |
| Secondary | #8B5CF6 (Violet) | Éléments secondaires |
| Tertiary | #EC4899 (Rose) | Accents tertiaires |
| Success | #10B981 (Émeraude) | Synthèse réussie |
| Warning | #F59E0B (Ambre) | Espace disque faible |
| Error | #EF4444 (Rouge) | Erreurs |
| Background | #FFFFFF / #0F172A | Fond écran |
| Surface | #F3F4F6 / #1E293B | Cards, surfaces |

## Animations Android 16/17

### Transitions
- **Entrée écran**: Slide up + fade (250ms)
- **Sortie écran**: Slide down + fade (200ms)
- **Changement onglet**: Crossfade (150ms)

### Interactions
- **Tap bouton**: Scale 0.95 + haptic (80ms)
- **Long press**: Scale 0.90 + haptic medium (100ms)
- **Swipe**: Momentum scroll avec deceleration (300-500ms)

### États
- **Loading**: Spinner rotatif (indéfini)
- **Progression**: Barre linéaire animée (smooth)
- **Success**: Checkmark avec scale bounce (300ms)
- **Error**: Shake horizontal (200ms)

## Typographie

| Niveau | Taille | Poids | Usage |
|--------|--------|-------|-------|
| Display | 32sp | Bold | Titres écrans |
| Headline | 24sp | Bold | Titres sections |
| Title | 16sp | SemiBold | Titres cards |
| Body | 14sp | Regular | Texte principal |
| Label | 12sp | Medium | Labels, chips |
| Caption | 12sp | Regular | Texte secondaire |

## Espacement (Material Design 3)

- **Gutter**: 16dp
- **Intra-card**: 12dp
- **Inter-card**: 8dp
- **Section**: 24dp

## Icônes

Utiliser Material Icons 3 pour cohérence Android:
- Microphone: `mic`
- Upload: `upload`
- Download: `download`
- Play: `play_circle_filled`
- Settings: `settings`
- Models: `library_books`
- Video: `videocam`
- Share: `share`

## Accessibilité

- Contraste minimum WCAG AA
- Tailles tactiles: 48dp minimum
- Labels pour tous les icônes
- Support dark mode natif
- Haptic feedback pour confirmations
