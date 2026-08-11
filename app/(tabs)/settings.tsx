import { useEffect, useState } from 'react';
import { Image, ScrollView, Text, View, Pressable, Switch } from 'react-native';
import * as Haptics from 'expo-haptics';
import { openBrowserAsync } from 'expo-web-browser';
import { ScreenContainer } from '@/components/screen-container';
import { UpdateCard } from '@/components/update-card';
import { useColors } from '@/hooks/use-colors';
import { useConsent, exitApp } from '@/lib/context/consent-context';
import {
  GITHUB_RELEASES_URL,
  GITHUB_REPO_URL,
  getCurrentAppVersion,
} from '@/lib/services/updates';

const ENGINES = [
  { name: 'Pocket TTS (Kyutai)', detail: 'Clonage zéro-shot 100M — très rapide sur CPU' },
  { name: 'OmniVoice', detail: 'Clonage zéro-shot, 646+ langues' },
  { name: 'Qwen3-TTS 0.6B', detail: 'Clonage sans transcription, le plus fidèle' },
];

export default function SettingsScreen() {
  const colors = useColors();
  const { accepted, revoke } = useConsent();
  const [version, setVersion] = useState('');

  useEffect(() => {
    getCurrentAppVersion().then(setVersion).catch(() => {});
  }, []);

  const openLink = (url: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openBrowserAsync(url).catch(() => {});
  };

  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}>
        {/* Header */}
        <View className="px-6 pt-6 pb-4">
          <Text className="text-2xl font-bold text-foreground">À propos & Réglages</Text>
        </View>

        {/* Update */}
        <UpdateCard />

        {/* App info */}
        <View className="px-6 mb-4">
          <View className="bg-surface rounded-xl p-4 border border-border">
            <View className="flex-row items-center mb-2">
              <Image
                source={require('@/assets/images/icon.png')}
                style={{ width: 44, height: 44, borderRadius: 10 }}
              />
              <View className="flex-1 ml-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-base font-semibold text-foreground">VoiceClone</Text>
                  {version ? (
                    <Text className="text-sm font-semibold text-primary">v{version}</Text>
                  ) : null}
                </View>
              </View>
            </View>
            <Text className="text-xs text-muted mb-4">
              Synthèse vocale & clonage de voix — 100 % local, aucun serveur, aucune API cloud.
              Vos voix et vos synthèses ne quittent jamais l’appareil.
            </Text>

            <Text className="text-xs font-semibold text-foreground mb-2">Moteurs embarqués</Text>
            {ENGINES.map((engine) => (
              <View key={engine.name} className="flex-row justify-between items-start mb-2">
                <Text className="text-sm text-foreground flex-1">{engine.name}</Text>
                <Text className="text-xs text-muted flex-1 text-right ml-3">{engine.detail}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Consent */}
        <View className="px-6 mb-4">
          <View className="bg-surface rounded-xl p-4 border border-border">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-base font-semibold text-foreground">
                ⚖️ Consentement & responsabilité
              </Text>
              <Switch
                value={accepted === true}
                onValueChange={(value) => {
                  if (value) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  // Retirer le consentement bloque (web/iOS) ou ferme (Android)
                  // l'application jusqu'à un nouvel accord.
                  revoke();
                  exitApp();
                }}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#ffffff"
              />
            </View>
            <Text className="text-xs text-muted leading-4">
              Vous avez accepté les conditions d’utilisation au premier lancement.
              Vous pouvez retirer votre consentement à tout moment : l’application
              se bloquera ou se fermera jusqu’à ce que vous acceptiez de nouveau.
            </Text>
          </View>
        </View>

        {/* GitHub */}
        <View className="px-6">
          <View className="bg-surface rounded-xl p-4 border border-border">
            <Text className="text-base font-semibold text-foreground mb-1">💻 GitHub</Text>
            <Text className="text-xs text-muted mb-3">
              Code source, releases (APK) et mises à jour — le dépôt est public.
            </Text>
            <View className="gap-2">
              <Pressable
                onPress={() => openLink(GITHUB_REPO_URL)}
                style={({ pressed }) => [
                  { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
                ]}
                className="rounded-lg p-3 border border-border"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-medium text-foreground">Dépôt du projet</Text>
                  <Text className="text-xs text-primary">ouvrir →</Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => openLink(GITHUB_RELEASES_URL)}
                style={({ pressed }) => [
                  { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
                ]}
                className="rounded-lg p-3 border border-border"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-medium text-foreground">Releases & APK</Text>
                  <Text className="text-xs text-primary">ouvrir →</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
