import { View, Text, Pressable } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import {
  DEFAULT_SPEECH_PARAMS,
  type SpeechParams,
} from '@/lib/services/audio-pipeline';

interface AdvancedParamsEditorProps {
  params: SpeechParams;
  onChange: (params: SpeechParams) => void;
  /** Defaults to collapsed so the advanced section does not dominate the
   *  screen. Pass true to open it initially (e.g. when editing a profile). */
  initiallyExpanded?: boolean;
  /**
   * What this screen considers untouched. Cloning starts below 1x speed to
   * offset the engine's tempo drift, so without this the "Naturel" preset
   * would quietly undo that correction and the header would report the
   * screen's own default as a user customisation.
   */
  baseline?: SpeechParams;
}

interface StepSpec {
  key: keyof SpeechParams;
  label: string;
  hint: string;
  step: number;
  min: number;
  max: number;
  format: (value: number) => string;
}

const STEP_SPECS: StepSpec[] = [
  {
    key: 'speed',
    label: 'Vitesse de parole',
    hint: '0,5× très lent — 2× très rapide',
    step: 0.05,
    min: 0.5,
    max: 2,
    format: (v) => `${v.toFixed(2)}×`,
  },
  {
    key: 'volume',
    label: 'Volume',
    hint: 'Amplification du signal final',
    step: 0.1,
    min: 0.5,
    max: 2,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: 'pauseAfterCommaMs',
    label: 'Pause après virgule',
    hint: 'Silence supplémentaire après chaque ,',
    step: 50,
    min: 0,
    max: 2000,
    format: formatMs,
  },
  {
    key: 'pauseAfterPeriodMs',
    label: 'Pause après phrase',
    hint: 'Silence supplémentaire après chaque .',
    step: 50,
    min: 0,
    max: 3000,
    format: formatMs,
  },
  {
    key: 'pauseAfterColonMs',
    label: 'Pause après deux-points',
    hint: 'Silence supplémentaire après chaque :',
    step: 50,
    min: 0,
    max: 2000,
    format: formatMs,
  },
  {
    key: 'pauseAfterSemicolonMs',
    label: 'Pause après point-virgule',
    hint: 'Silence supplémentaire après chaque ;',
    step: 50,
    min: 0,
    max: 2000,
    format: formatMs,
  },
  {
    key: 'pauseAfterQuestionMs',
    label: 'Pause après question',
    hint: 'Silence supplémentaire après chaque ?',
    step: 50,
    min: 0,
    max: 2000,
    format: formatMs,
  },
  {
    key: 'pauseAfterExclamationMs',
    label: 'Pause après exclamation',
    hint: 'Silence supplémentaire après chaque !',
    step: 50,
    min: 0,
    max: 2000,
    format: formatMs,
  },
  {
    key: 'pauseAfterNewlineMs',
    label: 'Pause après saut de ligne',
    hint: 'Silence supplémentaire après chaque retour à la ligne',
    step: 50,
    min: 0,
    max: 3000,
    format: formatMs,
  },
];

function formatMs(v: number): string {
  if (v === 0) return 'naturel';
  return v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${v} ms`;
}

const PRESETS: {
  label: string;
  apply: (params: SpeechParams, baseline: SpeechParams) => SpeechParams;
}[] = [
  {
    label: 'Naturel',
    apply: (_p, baseline) => ({ ...baseline }),
  },
  {
    label: 'Lecture posée',
    apply: (p) => ({
      ...p,
      pauseAfterCommaMs: 250,
      pauseAfterPeriodMs: 550,
      pauseAfterColonMs: 300,
      pauseAfterSemicolonMs: 300,
      pauseAfterQuestionMs: 550,
      pauseAfterExclamationMs: 550,
    }),
  },
  {
    label: 'Narrateur dramatique',
    apply: (p) => ({
      ...p,
      speed: 0.85,
      pauseAfterCommaMs: 500,
      pauseAfterPeriodMs: 1000,
      pauseAfterColonMs: 600,
      pauseAfterSemicolonMs: 600,
      pauseAfterQuestionMs: 1100,
      pauseAfterExclamationMs: 1100,
      pauseAfterNewlineMs: 800,
    }),
  },
  {
    label: 'Radio / télégraphique',
    apply: (p) => ({
      ...p,
      speed: 1.3,
      pauseAfterCommaMs: 120,
      pauseAfterPeriodMs: 250,
    }),
  },
];

export function AdvancedParamsEditor({
  params,
  onChange,
  initiallyExpanded = false,
  baseline = DEFAULT_SPEECH_PARAMS,
}: AdvancedParamsEditorProps) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(initiallyExpanded);

  const bump = (spec: StepSpec, direction: 1 | -1) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const raw = (params[spec.key] as number) + direction * spec.step;
    const value = Math.min(spec.max, Math.max(spec.min, Math.round(raw * 100) / 100));
    onChange({ ...params, [spec.key]: value });
  };

  // Summary shown while collapsed: which parameters differ from the defaults,
  // so a saved profile's tuning is visible without expanding the section.
  const activeCount = STEP_SPECS.filter(
    (spec) => params[spec.key] !== baseline[spec.key]
  ).length;
  const summary = activeCount === 0
    ? 'Réglages par défaut'
    : activeCount === 1
      ? '1 réglage personnalisé'
      : `${activeCount} réglages personnalisés`;

  return (
    <View>
      {/* Collapsible header */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setExpanded((v) => !v);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className="flex-row items-center justify-between py-1"
      >
        <View className="flex-1 mr-3">
          <Text className="text-sm font-semibold text-foreground">Paramètres avancés</Text>
          <Text className="text-xs text-muted mt-0.5">{summary}</Text>
        </View>
        <Text
          className="text-lg font-bold"
          style={{ color: colors.primary, transform: [{ rotate: expanded ? '0deg' : '-90deg' }] }}
        >
          ▾
        </Text>
      </Pressable>

      {expanded && (
        <View className="mt-3">
      {/* Presets */}
      <View className="flex-row gap-2 flex-wrap mb-4">
        {PRESETS.map((preset) => (
          <Pressable
            key={preset.label}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(preset.apply(params, baseline));
            }}
            style={({ pressed }) => [
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            className="rounded-full border px-3 py-1.5"
          >
            <Text className="text-xs text-foreground font-medium">{preset.label}</Text>
          </Pressable>
        ))}
      </View>

      {STEP_SPECS.map((spec) => {
        const value = params[spec.key] as number;
        const isDefault = value === (DEFAULT_SPEECH_PARAMS[spec.key] as number);
        return (
          <View key={spec.key} className="mb-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-foreground flex-1 mr-2">
                {spec.label}
              </Text>
              <Text
                className="text-sm font-bold"
                style={{ color: isDefault ? colors.muted : colors.primary }}
              >
                {spec.format(value)}
              </Text>
            </View>
            <Text className="text-xs text-muted mb-1.5">{spec.hint}</Text>
            <View className="flex-row items-center gap-3">
              <StepperButton
                label="−"
                onPress={() => bump(spec, -1)}
                disabled={value <= spec.min}
              />
              <View
                className="flex-1 h-1.5 rounded-full overflow-hidden"
                style={{ backgroundColor: colors.border }}
              >
                <View
                  style={{
                    width: `${((value - spec.min) / (spec.max - spec.min)) * 100}%`,
                    backgroundColor: colors.primary,
                    height: '100%',
                  }}
                />
              </View>
              <StepperButton
                label="+"
                onPress={() => bump(spec, 1)}
                disabled={value >= spec.max}
              />
            </View>
          </View>
        );
      })}
        </View>
      )}
    </View>
  );
}

function StepperButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          backgroundColor: disabled ? colors.border : colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      className="w-10 h-10 rounded-lg border items-center justify-center"
    >
      <Text
        className="text-lg font-bold"
        style={{ color: disabled ? colors.muted : colors.primary }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
