export type BeatCandidate = { time: number; confidence: number };
export type BeatAnalysis = { duration: number; beats: BeatCandidate[]; confidence: number; bpm?: number };

const MIN_BEAT_SPACING = 0.28;

function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

export function detectBeatsFromSamples(samples: Float32Array, sampleRate: number): BeatAnalysis {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || samples.length === 0) return { duration: 0, beats: [], confidence: 0 };
  const window = 1024;
  const hop = 512;
  const energies: number[] = [];
  for (let offset = 0; offset + window <= samples.length; offset += hop) {
    let sum = 0;
    for (let index = offset; index < offset + window; index += 1) sum += samples[index] * samples[index];
    energies.push(Math.sqrt(sum / window));
  }
  const duration = samples.length / sampleRate;
  if (!energies.length) return { duration, beats: [], confidence: 0 };
  const floor = percentile(energies, 0.5);
  const spread = Math.sqrt(energies.reduce((sum, value) => sum + (value - floor) ** 2, 0) / energies.length);
  const threshold = Math.max(floor * 1.35, floor + spread * 0.55, 0.012);
  const peaks: BeatCandidate[] = [];
  for (let index = 1; index < energies.length - 1; index += 1) {
    const energy = energies[index];
    if (energy < threshold || energy < energies[index - 1] || energy < energies[index + 1]) continue;
    const time = (index * hop + window / 2) / sampleRate;
    const confidence = Math.max(0, Math.min(1, (energy - threshold) / Math.max(threshold, 1e-6)));
    const previous = peaks[peaks.length - 1];
    if (previous && time - previous.time < MIN_BEAT_SPACING) {
      if (confidence > previous.confidence) peaks[peaks.length - 1] = { time, confidence };
    } else peaks.push({ time, confidence });
  }
  const confidence = peaks.length < 2 ? 0 : Math.min(1, peaks.reduce((sum, beat) => sum + beat.confidence, 0) / peaks.length);
  const intervals = peaks.slice(1).map((beat, index) => beat.time - peaks[index].time).filter((value) => value > 0);
  const medianInterval = percentile(intervals, 0.5);
  const bpm = confidence >= 0.45 && medianInterval >= 0.28 && medianInterval <= 2 ? Math.round(60 / medianInterval) : undefined;
  return { duration, beats: confidence >= 0.35 ? peaks : [], confidence, ...(bpm ? { bpm } : {}) };
}

export async function analyzeAudioBlob(blob: Blob): Promise<BeatAnalysis> {
  const audioGlobal = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const AudioContextCtor = globalThis.AudioContext ?? audioGlobal.webkitAudioContext;
  if (!AudioContextCtor) throw new Error('Web Audio analysis is unavailable in this browser.');
  const context = new AudioContextCtor();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const samples = buffer.getChannelData(0);
    return detectBeatsFromSamples(samples, buffer.sampleRate);
  } finally {
    await context.close();
  }
}

export function snapDurationsToBeats(durations: number[], beats: BeatCandidate[], total: number, minimum = 0.75): number[] {
  if (durations.length < 2 || !beats.length || beats.every((beat) => beat.confidence < 0.6)) return durations;
  const boundaries: number[] = [];
  let cursor = 0;
  for (let index = 0; index < durations.length - 1; index += 1) {
    cursor += durations[index];
    const nearest = beats.filter((beat) => beat.confidence >= 0.6).sort((a, b) => Math.abs(a.time - cursor) - Math.abs(b.time - cursor))[0];
    if (!nearest || Math.abs(nearest.time - cursor) > 0.4) { boundaries.push(cursor); continue; }
    const lower = (boundaries[index - 1] ?? 0) + minimum;
    const upper = total - (durations.length - index - 1) * minimum;
    boundaries.push(Math.max(lower, Math.min(upper, nearest.time)));
  }
  const result = boundaries.map((boundary, index) => boundary - (index ? boundaries[index - 1] : 0));
  result.push(total - boundaries[boundaries.length - 1]);
  return result.every((duration) => duration >= minimum - 1e-6) ? result : durations;
}
