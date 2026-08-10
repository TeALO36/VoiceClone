import { ScrollView, Text, View, Pressable } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useConsent, exitApp } from '@/lib/context/consent-context';
import { useState } from 'react';

/**
 * Full-screen consent gate shown at first launch (and again after the user
 * revokes their consent in settings). The app cannot be used until the user
 * accepts; refusing exits the app.
 */
export function ConsentScreen() {
  const colors = useColors();
  const { accept } = useConsent();
  const [declined, setDeclined] = useState(false);
  const [accepting, setAccepting] = useState(false);

  if (declined) {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}
        className="px-8"
      >
        <Text style={{ fontSize: 48, marginBottom: 16 }}>👋</Text>
        <Text className="text-lg font-bold text-foreground text-center mb-3">
          Consentement refusé
        </Text>
        <Text className="text-sm text-muted text-center leading-5">
          L’application ne peut pas être utilisée sans votre accord. Vous pouvez
          fermer l’application, puis la relancer si vous changez d’avis.
        </Text>
      </View>
    );
  }

  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View className="mb-6">
          <Text style={{ fontSize: 40, textAlign: 'center' }}>🗣️</Text>
          <Text className="text-2xl font-bold text-foreground text-center mt-3">
            VoiceClone
          </Text>
          <Text className="text-sm text-muted text-center mt-1">
            Synthèse vocale & clonage de voix — 100 % local
          </Text>
        </View>

        <View className="bg-surface border border-border rounded-2xl p-5 mb-6">
          <Text className="text-base font-bold text-foreground mb-3">
            Consentement & avis de responsabilité
          </Text>

          <Text className="text-sm text-foreground leading-5 mb-3">
            VoiceClone est un outil de synthèse vocale et de clonage de voix qui
            fonctionne entièrement sur votre appareil. Vos textes, vos
            enregistrements et les voix générées ne quittent jamais votre
            téléphone.
          </Text>

          <Text className="text-sm text-foreground leading-5 mb-3">
            En acceptant, vous reconnaissez que l’éditeur de cette application
            ne saurait être tenu responsable de l’usage que vous en faites. Il
            vous appartient de l’utiliser de manière légale et éthique.
          </Text>

          <Text className="text-sm text-foreground leading-5 mb-3">
            Il est notamment interdit d’utiliser VoiceClone pour usurper
            l’identité d’une personne sans son consentement, commettre une
            fraude, tromper autrui, ou créer des contenus diffamatoires,
            harcelants ou illégaux. Vous êtes seul responsable de vos usages et
            de leur conformité avec la législation applicable, en particulier en
            matière de vie privée et de droits des personnes.
          </Text>

          <Text className="text-sm text-muted leading-5">
            L’application est fournie « en l’état », sans garantie d’aucune
            sorte, expresse ou implicite. Vous pouvez retirer votre
            consentement à tout moment depuis l’onglet Réglages.
          </Text>
        </View>

        <Pressable
          onPress={async () => {
            setAccepting(true);
            await accept();
          }}
          disabled={accepting}
          style={({ pressed }) => [
            {
              backgroundColor: accepting ? colors.muted : colors.primary,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
          className="rounded-xl p-4 items-center mb-3"
        >
          <Text className="text-white font-bold text-lg">J’accepte</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setDeclined(true);
            exitApp();
          }}
          disabled={accepting}
          style={({ pressed }) => [
            { opacity: pressed ? 0.8 : 1, backgroundColor: colors.border },
          ]}
          className="rounded-xl p-4 items-center"
        >
          <Text className="text-foreground font-semibold">Refuser et quitter</Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}
