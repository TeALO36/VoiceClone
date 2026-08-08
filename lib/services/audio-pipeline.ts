/**
 * Pure, platform-independent audio helpers for the synthesis pipeline.
 *
 * The native engines each generate a whole utterance in one call and write a
 * 16-bit mono WAV. The "advanced parameters" feature (pause lengths after each
 * punctuation kind, speaking speed, volume) is implemented here, on top of the
 * engine output, so it behaves identically for OmniVoice, Qwen3-TTS and Pocket
 * TTS:
 *
 *  1. The text is split into segments at punctuation (`,` `;` `:` `!` `?` `.`
 *     and newlines), keeping the punctuation attached so the engine still
 *     applies its natural prosody.
 *  2. Each segment is synthesized separately and the segments are glued back
 *     together with an *extra* silence of the configured duration after each
 *     punctuation kind (0 ms = engine's natural rhythm untouched).
 *  3. The whole clip is then time-stretched with WSOLA to the requested speed
 *     (preserves pitch — a naive resample would shift the voice's pitch too)
 *     and finally scaled by the volume gain.
 *
 * When every parameter is at its default the pipeline is bypassed entirely and
 * the text is synthesized in a single engine call for the best natural
 * prosody.
 */

export type PunctuationKind =
  | 'comma'
  | 'period'
  | 'colon'
  | 'semicolon'
  | 'question'
  | 'exclamation'
  | 'newline';

export const PUNCTUATION_KIND: Record<string, PunctuationKind> = {
  ',': 'comma',
  '.': 'period',
  ':': 'colon',
  ';': 'semicolon',
  '?': 'question',
  '!': 'exclamation',
  '\n': 'newline',
};

export interface SpeechParams {
  /** Speaking speed, 0.5 (slow) to 2.0 (fast). 1 = unchanged. */
  speed: number;
  /** Output volume gain, 0.5 to 2.0. 1 = unchanged. */
  volume: number;
  /** Extra silence (ms) inserted after each punctuation kind. 0 = natural. */
  pauseAfterCommaMs: number;
  pauseAfterPeriodMs: number;
  pauseAfterColonMs: number;
  pauseAfterSemicolonMs: number;
  pauseAfterQuestionMs: number;
  pauseAfterExclamationMs: number;
  pauseAfterNewlineMs: number;
}

export const DEFAULT_SPEECH_PARAMS: SpeechParams = {
  speed: 1,
  volume: 1,
  pauseAfterCommaMs: 0,
  pauseAfterPeriodMs: 0,
  pauseAfterColonMs: 0,
  pauseAfterSemicolonMs: 0,
  pauseAfterQuestionMs: 0,
  pauseAfterExclamationMs: 0,
  pauseAfterNewlineMs: 0,
};

export function pauseFor(kind: PunctuationKind, params: SpeechParams): number {
  switch (kind) {
    case 'comma': return params.pauseAfterCommaMs;
    case 'period': return params.pauseAfterPeriodMs;
    case 'colon': return params.pauseAfterColonMs;
    case 'semicolon': return params.pauseAfterSemicolonMs;
    case 'question': return params.pauseAfterQuestionMs;
    case 'exclamation': return params.pauseAfterExclamationMs;
    case 'newline': return params.pauseAfterNewlineMs;
  }
}

/** True when every parameter is neutral and the pipeline can be bypassed. */
export function isDefaultParams(params: SpeechParams): boolean {
  return (
    params.speed === 1 &&
    params.volume === 1 &&
    pauseFor('comma', params) === 0 &&
    pauseFor('period', params) === 0 &&
    pauseFor('colon', params) === 0 &&
    pauseFor('semicolon', params) === 0 &&
    pauseFor('question', params) === 0 &&
    pauseFor('exclamation', params) === 0 &&
    pauseFor('newline', params) === 0
  );
}

export interface TextSegment {
  /** Text to hand to the engine (punctuation kept for natural prosody). */
  text: string;
  /** Punctuation kind that ended this segment, if any. */
  trailing: PunctuationKind | null;
}

/**
 * Split text at punctuation. Each returned segment keeps its trailing
 * delimiter so the engine reads it with natural prosody; the pipeline then
 * appends the user-configured extra silence. Runs of delimiters (e.g. `?!`,
 * `,\n`) collapse into one break, taking the kind of the last character.
 * Leading punctuation attaches to the following segment.
 */
export function segmentTextWithPauses(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const delimiters = new Set(Object.keys(PUNCTUATION_KIND));

  let current = '';   // text awaiting a break
  let run = '';       // delimiter run currently being collected
  let lastKind: PunctuationKind | null = null;

  const closeSegment = () => {
    const textPart = current.trim();
    if (run !== '') {
      if (textPart.length > 0) {
        segments.push({ text: textPart + run, trailing: lastKind });
      } else if (lastKind && segments.length > 0) {
        // A break with no text between (e.g. "?!"): merge into the previous
        // segment's break instead of emitting an empty segment.
        segments[segments.length - 1].trailing = lastKind;
      }
      run = '';
      lastKind = null;
    } else if (textPart.length > 0) {
      segments.push({ text: textPart, trailing: null });
    }
    current = '';
  };

  for (const ch of text) {
    if (delimiters.has(ch)) {
      run += ch;
      lastKind = PUNCTUATION_KIND[ch];
    } else {
      if (run !== '') closeSegment();
      current += ch;
    }
  }
  closeSegment();

  return segments;
}

// ─── WAV codec (16-bit mono) ──────────────────────────────────────────────

export interface WavData {
  samples: Float32Array;
  sampleRate: number;
}

/** Decode a 16-bit mono WAV (or any 16-bit WAV, downmixed to mono). */
export function wavDecode(bytes: Uint8Array): WavData {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 44 || bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46) {
    throw new Error('Fichier audio invalide (en-tête RIFF manquant)');
  }
  // "WAVE"
  if (bytes[8] !== 0x57 || bytes[9] !== 0x41 || bytes[10] !== 0x56 || bytes[11] !== 0x45) {
    throw new Error('Fichier audio invalide (pas un WAVE)');
  }

  let offset = 12;
  let dataOffset = -1;
  let dataLength = 0;
  let audioFormat = 1;
  let channels = 1;
  let sampleRate = 24000;
  let bitsPerSample = 16;

  while (offset + 8 <= bytes.length) {
    const chunkId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 'fmt ') {
      audioFormat = view.getUint16(offset + 8, true);
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataLength = Math.min(chunkSize, bytes.length - dataOffset);
    }
    offset += 8 + chunkSize + (chunkSize % 2); // chunks are word-aligned
  }

  if (dataOffset < 0 || dataLength <= 0) {
    throw new Error('Fichier audio invalide (pas de données PCM)');
  }
  if (audioFormat !== 1 || bitsPerSample !== 16) {
    throw new Error('Format audio non pris en charge (PCM 16-bit requis)');
  }

  const frameCount = Math.floor(dataLength / (2 * channels));
  const samples = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      sum += view.getInt16(dataOffset + (i * channels + c) * 2, true) / 32768;
    }
    samples[i] = sum / channels;
  }
  return { samples, sampleRate };
}

/** Encode mono float samples as a canonical 16-bit WAV. */
export function wavEncode(data: WavData): Uint8Array {
  const { samples, sampleRate } = data;
  const n = samples.length;
  const dataBytes = n * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);

  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, 36 + dataBytes, true);
  bytes.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);            // PCM
  view.setUint16(22, 1, true);            // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);            // block align
  view.setUint16(34, 16, true);           // bits per sample
  bytes.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < n; i++) {
    let s = samples[i];
    if (s > 1) s = 1;
    if (s < -1) s = -1;
    view.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return bytes;
}

/** Insert `ms` of silence at the end of a sample buffer. */
export function appendSilence(samples: Float32Array, ms: number, sampleRate: number): Float32Array {
  const extra = Math.round((ms / 1000) * sampleRate);
  if (extra <= 0) return samples;
  const out = new Float32Array(samples.length + extra);
  out.set(samples);
  return out;
}

/** Concatenate sample buffers, optionally inserting silence between each. */
export function concatSegments(
  parts: Float32Array[],
  pausesMs: number[],
  sampleRate: number
): Float32Array {
  if (parts.length === 0) return new Float32Array(0);
  let total = 0;
  for (let i = 0; i < parts.length; i++) {
    total += parts[i].length;
    if (i < pausesMs.length && pausesMs[i] > 0) {
      total += Math.round((pausesMs[i] / 1000) * sampleRate);
    }
  }
  const out = new Float32Array(total);
  let cursor = 0;
  for (let i = 0; i < parts.length; i++) {
    out.set(parts[i], cursor);
    cursor += parts[i].length;
    if (i < pausesMs.length && pausesMs[i] > 0) {
      cursor += Math.round((pausesMs[i] / 1000) * sampleRate);
    }
  }
  return out;
}

/** Apply a linear volume gain. */
export function applyVolume(samples: Float32Array, gain: number): Float32Array {
  if (gain === 1) return samples;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain;
  return out;
}

/**
 * WSOLA time-stretch that preserves pitch.
 *
 * `speed > 1` shortens the audio (speaks faster), `speed < 1` lengthens it.
 * Frames of `windowSize` samples are copied from the input with an analysis
 * hop of `speed * synthesisHop`; a cross-correlation search around the
 * nominal position picks the best-matching start so repeated glottal cycles
 * align, avoiding the "chipmunk" artifacts of plain overlap-add and the pitch
 * shift of naive resampling.
 */
export function timeStretch(
  samples: Float32Array,
  speed: number,
  sampleRate: number,
  windowMs = 40,
  searchMs = 10
): Float32Array {
  if (speed <= 0 || speed === 1 || samples.length === 0) return samples;

  const window = Math.round((windowMs / 1000) * sampleRate);
  const synthesisHop = Math.round(window / 4);
  const analysisHop = Math.max(1, Math.round(synthesisHop * speed));

  // The correlation search must stay strictly smaller than the analysis hop,
  // otherwise the chosen frame can land behind the previous one and the loop
  // stalls forever (the classic WSOLA convergence constraint). For slow speeds
  // the hop shrinks, so the search shrinks with it.
  const search = Math.min(
    Math.round((searchMs / 1000) * sampleRate),
    Math.max(1, Math.floor(analysisHop / 2))
  );

  // Hann window for overlap-add.
  const hann = new Float32Array(window);
  for (let i = 0; i < window; i++) {
    hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (window - 1));
  }    const outLength = Math.max(1, Math.round(samples.length / speed));
    const out = new Float32Array(outLength + window);
    const weights = new Float32Array(outLength + window);

    // Frame count is driven by the target output length so the result is
    // deterministic (each frame advances the output by synthesisHop). The
    // analysis position derives from it; the input-exhaustion guard keeps us
    // from reading past the end when speeding up.
    const frameCount = Math.ceil(outLength / synthesisHop);
    let analysisPos = 0;
    let synthesisPos = 0;
    let previousBest = 0;

    for (let frame = 0; frame < frameCount; frame++) {
        // Search for the most similar frame start around the nominal position,
        // anchored to where the previous frame actually ended.
        const nominal = frame * analysisHop;
        if (nominal + window > samples.length) break; // input exhausted
        const lo = Math.max(0, nominal - search);
        const hi = Math.min(samples.length - window, nominal + search);
        let best = nominal;
        let bestScore = -Infinity;
        // Anchor correlation against the tail of the previous chosen frame:
        // the overlap region of frame k starts at (previousBest + synthesisHop)
        // in input terms, so the new frame must align its content there.
        const anchorStart = previousBest + synthesisHop;
        const anchorLen = Math.min(window, samples.length - anchorStart);
        if (anchorLen > 0) {
            for (let cand = lo; cand <= hi; cand++) {
                let score = 0;
                const maxJ = Math.min(anchorLen, samples.length - cand);
                for (let j = 0; j < maxJ; j++) {
                    score += samples[anchorStart + j] * samples[cand + j];
                }
                if (score > bestScore) {
                    bestScore = score;
                    best = cand;
                }
            }
        }

        // Overlap-add the windowed frame.
        for (let j = 0; j < window && synthesisPos + j < out.length && best + j < samples.length; j++) {
            out[synthesisPos + j] += samples[best + j] * hann[j];
            weights[synthesisPos + j] += hann[j];
        }

        previousBest = best;
        analysisPos = best + analysisHop;
        synthesisPos += synthesisHop;
    }

  // Normalize by the summed window weights and clip.
  const result = new Float32Array(Math.min(synthesisPos, outLength));
  for (let i = 0; i < result.length; i++) {
    const w = weights[i] || 1;
    let v = out[i] / w;
    if (v > 1) v = 1;
    if (v < -1) v = -1;
    result[i] = v;
  }
  return result;
}
