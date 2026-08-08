import { ScrollView, Text, View, Pressable } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import * as Haptics from 'expo-haptics';
import { useProfiles } from '@/lib/context/profiles-context';
import type { VoiceProfile } from '@/lib/services/profiles';

const SOURCE_EMOJI: Record<string, string> = {
  upload: '📁',
  record: '🎙️',
  video: '🎬',
};

interface ProfilePickerProps {
  selectedId: string | null;
  onSelect: (profile: VoiceProfile | null) => void;
}

export function ProfilePicker({ selectedId, onSelect }: ProfilePickerProps) {
  const colors = useColors();
  const { profiles } = useProfiles();

  const chip = (active: boolean, onPress: () => void, label: string, emoji?: string) => (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        {
          backgroundColor: active ? colors.primary : colors.surface,
          borderColor: active ? colors.primary : colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
      className="rounded-full border px-3 py-2 mr-2"
    >
      <Text
        className="text-sm font-semibold"
        style={{ color: active ? 'white' : colors.foreground }}
      >
        {emoji ? `${emoji} ` : ''}{label}
      </Text>
    </Pressable>
  );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
      {chip(selectedId === null, () => onSelect(null), 'Aucun profil', '🚫')}
      {profiles.map((profile) => (
        <View key={profile.id}>
          {chip(
            selectedId === profile.id,
            () => onSelect(profile),
            profile.name,
            profile.reference ? SOURCE_EMOJI[profile.reference.sourceType] : '🎧'
          )}
        </View>
      ))}
    </ScrollView>
  );
}
