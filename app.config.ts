import type { ExpoConfig } from "expo/config";

const bundleId = "com.app.voxclonemobile";
const scheme = "voxclone";

const config: ExpoConfig = {
  name: "VoiceClone",
  slug: "vox-clone-mobile",
  version: "4.3.12",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: bundleId,
    "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      }
  },
  android: {
    versionCode: 15,
    adaptiveIcon: {
      backgroundColor: "#6366F1",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: bundleId,
    // REQUEST_INSTALL_PACKAGES (normal, non-runtime) : requis par l'installeur
    // Android pour installer un APK téléchargé (mise à jour depuis GitHub).
    permissions: ["POST_NOTIFICATIONS", "REQUEST_INSTALL_PACKAGES"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-audio",
      {
        microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone.",
      },
    ],
    [
      "expo-video",
      {
        supportsBackgroundPlayback: true,
        supportsPictureInPicture: true,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 260,
        resizeMode: "contain",
        backgroundColor: "#6366F1",
        dark: {
          backgroundColor: "#6366F1",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["arm64-v8a"],
          minSdkVersion: 24,
          ndkVersion: "27.1.12297006",
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
