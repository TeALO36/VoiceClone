import { useState, useCallback } from 'react';
import { Platform, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { prepareReference } from '@/modules/expo-qwen3-tts';
import type { VoiceSourceType } from '@/lib/services/profiles';

export interface PickedReference {
  /** Original file/recording name. */
  name: string;
  /** Prepared 24 kHz mono WAV (cache) — what the engines consume. */
  wavUri: string;
  /** URI usable by a player (may differ from wavUri on web). */
  playUri: string;
  duration: number | null;
  sourceType: VoiceSourceType;
  size: number;
}

/**
 * Shared "get me a voice reference" flow used by both the cloning screen and
 * the profile editor: upload an audio/video file (video audio is extracted
 * automatically), or record straight from the microphone.
 */
export function useReferencePicker() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [reference, setReferenceState] = useState<PickedReference | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Selecting a saved profile loads its persisted WAV straight into the
  // picker: the reference is immediately usable, so the downstream steps
  // (language, text, …) must unlock at the same time. `applyPrepared` keeps
  // using the raw state setter because it toggles isReady itself around the
  // native conversion.
  const setReference = useCallback((ref: PickedReference | null) => {
    setReferenceState(ref);
    setIsReady(ref !== null);
  }, []);

  const applyPrepared = useCallback(async (asset: DocumentPicker.DocumentPickerAsset) => {
    let playUri = asset.uri;
    if (Platform.OS === 'web') {
      const rawFile = (asset as any).file;
      if (rawFile instanceof File || rawFile instanceof Blob) {
        playUri = URL.createObjectURL(rawFile);
      } else if (asset.uri && !asset.uri.startsWith('blob:') && !asset.uri.startsWith('data:')) {
        try {
          const resp = await fetch(asset.uri);
          const blob = await resp.blob();
          playUri = URL.createObjectURL(blob);
        } catch (e) {
          console.warn('Could not create Blob URL from asset.uri:', e);
        }
      }
    }

    setReferenceState({
      name: asset.name,
      wavUri: asset.uri,
      playUri: playUri || asset.uri,
      duration: null,
      sourceType: asset.mimeType?.startsWith('video/') ? 'video' : 'upload',
      size: asset.size ?? 0,
    });
    setIsReady(false);

    if (Platform.OS === 'web') {
      setIsReady(true);
      return;
    }

    // Decode mp3/m4a/mp4/... down to the 24 kHz mono WAV the engines need.
    setIsConverting(true);
    try {
      const prepared = await prepareReference(asset.uri);
      setReferenceState((prev) => (prev ? { ...prev, wavUri: prepared.uri, duration: prepared.duration } : prev));
      setIsReady(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error('Reference conversion failed:', error);
      Alert.alert('Extrait inutilisable', error?.message || 'Impossible de lire cet extrait audio.');
      setReference(null);
    } finally {
      setIsConverting(false);
    }
  }, []);

  const pickFile = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'video/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      await applyPrepared(result.assets[0]);
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert('Erreur', 'Impossible de sélectionner le fichier');
    }
  }, [applyPrepared]);

  const startRecording = useCallback(async () => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission', 'Autorisez le micro pour enregistrer un échantillon vocal.');
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await recorder.record();
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Erreur', 'Impossible de démarrer l\u2019enregistrement');
    }
  }, [recorder]);

  const stopRecording = useCallback(async () => {
    try {
      await recorder.stop();
      setIsRecording(false);
      const uri = recorder.uri;
      if (!uri) {
        Alert.alert('Erreur', 'Enregistrement vide');
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (Platform.OS === 'web') {
        setReferenceState({
          name: 'Enregistrement.webm',
          wavUri: uri,
          playUri: uri,
          duration: null,
          sourceType: 'record',
          size: 0,
        });
        setIsReady(true);
        return;
      }

      setIsConverting(true);
      try {
        const prepared = await prepareReference(uri);
        setReferenceState({
          name: `Enregistrement ${new Date().toLocaleTimeString()}.wav`,
          wavUri: prepared.uri,
          playUri: uri,
          duration: prepared.duration,
          sourceType: 'record',
          size: 0,
        });
        setIsReady(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error: any) {
        console.error('Recording conversion failed:', error);
        Alert.alert('Extrait inutilisable', error?.message || 'Impossible de traiter l\u2019enregistrement.');
      } finally {
        setIsConverting(false);
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      setIsRecording(false);
    }
  }, [recorder]);

  const removeReference = useCallback(() => {
    if (reference?.playUri && reference.playUri.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(reference.playUri);
      } catch (_) {}
    }
    setReferenceState(null);
    setIsReady(false);
  }, [reference]);

  return {
    reference,
    isReady,
    isConverting,
    isRecording,
    pickFile,
    startRecording,
    stopRecording,
    removeReference,
    setReference,
  };
}
