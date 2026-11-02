/**
 * Rangmanch local production MVP.
 * Uses browser-native DSP. This is not a bit-for-bit port of the Python
 * processor or its FFmpeg EBU R128 mastering; export is peak-normalized WAV.
 * No uploads, tokens, database, or AWS worker required.
 */
export type BrowserMixSettings = {
  clarity: number;
  compression: number;
  reverb: number;
  delay: number;
  vocal_balance: number;
  sync_offset_ms: number;
  sidechain: boolean;
  de_esser: number;
  vocal_warmth: number;
  instrumental_width: number;
  noise_reduction: number;
  stereo_space: "natural" | "wide" | "cinematic";
};

const SAMPLE_RATE = 44100;

function clamp(value: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : 0));
}

export async function decodeFile(file: Blob): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer();
  const context = new OfflineAudioContext(2, 1, SAMPLE_RATE);
  const decoded = await context.decodeAudioData(bytes);
  if (decoded.duration <= 0) {
    throw new Error("The selected audio is empty.");
  }
  return decoded;
}

function impulse(ctx: OfflineAudioContext, seconds: number): AudioBuffer {
  const len = Math.ceil(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  // Deterministic smooth-decay impulse (no extra model assets).
  for (let c = 0; c < 2; c++) {
    const data = ir.getChannelData(c);
    let seed = c ? 91 : 17;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      const noise = (seed / 2147483647) * 2 - 1;
      data[i] = noise * Math.exp(-5.5 * i / len) * 0.26;
    }
  }
  return ir;
}

function addVocalChain(ctx: OfflineAudioContext, source: AudioBufferSourceNode, s: BrowserMixSettings) {
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 65;
  const clarity = ctx.createBiquadFilter();
  clarity.type = "peaking";
  clarity.frequency.value = 3200;
  clarity.Q.value = 0.85;
  clarity.gain.value = s.clarity * 4;
  const warm = ctx.createBiquadFilter();
  warm.type = "lowshelf";
  warm.frequency.value = 240;
  warm.gain.value = s.vocal_warmth * 3;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -13 - s.compression * 20;
  comp.ratio.value = 1.5 + s.compression * 4;
  comp.attack.value = 0.007;
  comp.release.value = 0.18;
  source.connect(filter).connect(clarity).connect(warm).connect(comp);
  return comp;
}

function addSpace(ctx: OfflineAudioContext, dry: AudioNode, s: BrowserMixSettings, destination: AudioNode) {
  const dryGain = ctx.createGain();
  dryGain.gain.value = 1;
  dry.connect(dryGain).connect(destination);
  if (s.reverb > 0.005) {
    const verb = ctx.createConvolver();
    verb.buffer = impulse(ctx, 1.5);
    const wet = ctx.createGain();
    wet.gain.value = clamp(s.reverb, 0, 1) * 0.55;
    dry.connect(verb).connect(wet).connect(destination);
  }
  if (s.delay > 0.005) {
    const delay = ctx.createDelay(0.7);
    delay.delayTime.value = 0.27;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.22;
    const wet = ctx.createGain();
    wet.gain.value = clamp(s.delay, 0, 1) * 0.45;
    dry.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(destination);
  }
}

export async function renderBrowserMix(
  vocal: AudioBuffer | null,
  instrument: AudioBuffer | null,
  settings: BrowserMixSettings,
): Promise<Blob> {
  if (!vocal && !instrument) throw new Error("Select at least one recording.");
  const seconds = Math.max(vocal?.duration ?? 0, instrument?.duration ?? 0);
  const tail = Math.max(settings.reverb, settings.delay) > 0.01 ? 2 : 0;
  const ctx = new OfflineAudioContext(2, Math.ceil((seconds + tail) * SAMPLE_RATE), SAMPLE_RATE);
  const mixBus = ctx.createGain();
  mixBus.connect(ctx.destination);

  if (vocal) {
    const node = ctx.createBufferSource();
    node.buffer = vocal;
    const processed = addVocalChain(ctx, node, settings);
    const balance = ctx.createGain();
    balance.gain.value = clamp(1 + settings.vocal_balance * 0.55, 0.25, 1.8);
    processed.connect(balance);
    addSpace(ctx, balance, settings, mixBus);
    node.start(0);
  }

  if (instrument) {
    const node = ctx.createBufferSource();
    node.buffer = instrument;
    const gain = ctx.createGain();
    gain.gain.value = clamp(1 - settings.vocal_balance * 0.45, 0.3, 1.8);
    // Negative offset would require trimming the file; keep non-negative offset safe.
    const offset = clamp(settings.sync_offset_ms / 1000, 0, 0.5);
    node.connect(gain).connect(mixBus);
    node.start(offset);
  }

  const result = await ctx.startRendering();
  return encodeWav(result);
}

export function encodeWav(audio: AudioBuffer): Blob {
  const left = audio.getChannelData(0);
  const right = audio.numberOfChannels > 1 ? audio.getChannelData(1) : left;
  const samples = left.length;
  const bytes = new ArrayBuffer(44 + samples * 4);
  const view = new DataView(bytes);
  const str = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  str(0, "RIFF"); view.setUint32(4, 36 + samples * 4, true);
  str(8, "WAVE"); str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * 4, true);
  view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  str(36, "data"); view.setUint32(40, samples * 4, true);
  let peak = 0;
  for (let i = 0; i < samples; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  // Peak headroom -1.5 dBFS, not LUFS / true peak limiting.
  const gain = peak > 1e-9 ? Math.min(4, Math.pow(10, -1.5 / 20) / peak) : 1;
  for (let i = 0; i < samples; i++) {
    view.setInt16(44 + 4 * i, Math.round(clamp(left[i] * gain, -1, 1) * 32767), true);
    view.setInt16(46 + 4 * i, Math.round(clamp(right[i] * gain, -1, 1) * 32767), true);
  }
  return new Blob([bytes], { type: "audio/wav" });
}
