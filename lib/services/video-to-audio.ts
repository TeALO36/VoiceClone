/**
 * Video-to-audio conversion service.
 * Detects file format and simulates conversion in background.
 * In production, this would use ffmpeg-native or a server-side service.
 */

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'm4v', '3gp'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus', 'wma'];

export interface MediaFileInfo {
  name: string;
  uri: string;
  size: number;
  mimeType: string;
  isVideo: boolean;
  isAudio: boolean;
}

class VideoToAudioService {
  isVideoFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return VIDEO_EXTENSIONS.includes(ext);
  }

  isAudioFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return AUDIO_EXTENSIONS.includes(ext);
  }

  isSupportedFile(filename: string): boolean {
    return this.isVideoFile(filename) || this.isAudioFile(filename);
  }

  /**
   * Analyze a picked file and return its media info.
   */
  analyzeFile(file: { name: string; uri: string; size: number; mimeType?: string }): MediaFileInfo {
    return {
      name: file.name,
      uri: file.uri,
      size: file.size,
      mimeType: file.mimeType || (this.isVideoFile(file.name) ? 'video/mp4' : 'audio/mpeg'),
      isVideo: this.isVideoFile(file.name),
      isAudio: this.isAudioFile(file.name),
    };
  }

  /**
   * Convert a video file to audio.
   * Simulated — in production would use react-native-ffmpeg or similar.
   * Returns the same URI (the reference audio is used conceptually for voice cloning).
   */
  async extractAudio(
    videoUri: string,
    onProgress?: (progress: number) => void
  ): Promise<{ audioUri: string; duration: number; format: string; timestamp: number }> {
    for (let i = 0; i <= 100; i += 10) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      onProgress?.(i);
    }

    return {
      audioUri: videoUri,
      duration: 0,
      format: 'mp3',
      timestamp: Date.now(),
    };
  }
}

export const videoToAudioService = new VideoToAudioService();
