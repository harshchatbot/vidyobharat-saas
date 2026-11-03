import type { SourceInterval } from './talkingHeadTiming.ts';

export type SilenceDetectionOptions = {
  /** Analysis window length in milliseconds. */
  windowMs?: number;
  /** Audio below this RMS amplitude is considered quiet (0–1). */
  threshold?: number;
  /** Only remove pauses at least this long, in seconds. */
  minSilenceSeconds?: number;
  /** Preserve this much audio on either side of speech, in seconds. */
  speechPaddingSeconds?: number;
};

export type SilenceDetectionResult = {
  removals: SourceInterval[];
  duration: number;
  threshold: number;
  analyzedWindows: number;
};

/**
 * Lightweight, deterministic energy-based silence detection.
 * Audio is expected to be mono PCM normalized to [-1, 1].
 * Produces suggestions; callers should preview cuts before applying.
 */
export function detectSilence(
  samples: Float32Array,
  sampleRate: number,
  options: SilenceDetectionOptions = {},
): SilenceDetectionResult {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('Invalid sample rate.');
  const windowMs = options.windowMs ?? 20;
  const threshold = options.threshold ?? 0.018;
  const minSilenceSeconds = options.minSilenceSeconds ?? 0.55;
  const speechPaddingSeconds = options.speechPaddingSeconds ?? 0.12;
  if (!Number.isFinite(windowMs) || windowMs <= 0 ||
      !Number.isFinite(threshold) || threshold < 0 || threshold > 1 ||
      !Number.isFinite(minSilenceSeconds) || minSilenceSeconds < 0 ||
      !Number.isFinite(speechPaddingSeconds) || speechPaddingSeconds < 0) {
    throw new Error('Invalid silence detection options.');
  }

  const duration = samples.length / sampleRate;
  const windowSamples = Math.max(1, Math.round(sampleRate * windowMs / 1000));
  const count = Math.ceil(samples.length / windowSamples);
  const quiet: boolean[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = i * windowSamples;
    const end = Math.min(samples.length, start + windowSamples);
    let sumSquares = 0;
    for (let j = start; j < end; j += 1) {
      const value = samples[j];
      sumSquares += Number.isFinite(value) ? value * value : 0;
    }
    quiet.push(Math.sqrt(sumSquares / (end - start)) < threshold);
  }

  const removals: SourceInterval[] = [];
  let startIndex: number | null = null;
  const finishRun = (endIndex: number) => {
    if (startIndex === null) return;
    const quietStart = startIndex * windowSamples / sampleRate;
    const quietEnd = Math.min(duration, endIndex * windowSamples / sampleRate);
    if (quietEnd - quietStart >= minSilenceSeconds) {
      // Do not pad against the start/end of the recording: trim dead air there.
      const start = startIndex === 0 ? 0 : quietStart + speechPaddingSeconds;
      const end = endIndex === count ? duration : quietEnd - speechPaddingSeconds;
      if (end > start) removals.push({ start, end });
    }
    startIndex = null;
  };
  for (let i = 0; i < count; i += 1) {
    if (quiet[i]) {
      if (startIndex === null) startIndex = i;
    } else finishRun(i);
  }
  finishRun(count);
  return { removals, duration, threshold, analyzedWindows: count };
}

/** Decode an uploaded audio/video Blob locally and analyze its audio track. */
export async function detectSilenceFromBlob(
  blob: Blob,
  options: SilenceDetectionOptions = {},
): Promise<SilenceDetectionResult> {
  if (typeof AudioContext === 'undefined') throw new Error('Browser audio decoding is unavailable.');
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const mono = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < mono.length; i += 1) mono[i] += data[i] / buffer.numberOfChannels;
    }
    return detectSilence(mono, buffer.sampleRate, options);
  } catch (error) {
    throw new Error('Could not decode audio from this recording. Try a browser-supported file or use server-side audio extraction.', { cause: error });
  } finally {
    await context.close();
  }
}
