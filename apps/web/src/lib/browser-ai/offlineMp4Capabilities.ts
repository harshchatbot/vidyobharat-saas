/**
 * Checks the actual WebCodecs capabilities needed for a deterministic,
 * entirely browser-side H.264/AAC MP4 exporter.
 *
 * Do not infer support from the existence of VideoEncoder alone: Chrome
 * builds and hardware differ in codec, dimensions and audio support.
 */
export type OfflineMp4Capabilities = {
  supported: boolean;
  reason?: string;
  videoCodec?: string;
  audioCodec?: string;
};

export async function checkOfflineMp4Capabilities(
  width: number,
  height: number,
  fps: number,
): Promise<OfflineMp4Capabilities> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
      width % 2 !== 0 || height % 2 !== 0 || !Number.isFinite(fps) || fps <= 0) {
    return { supported: false, reason: 'Invalid H.264 export dimensions or frame rate.' };
  }
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined' ||
      typeof AudioEncoder === 'undefined' || typeof AudioDecoder === 'undefined') {
    return { supported: false, reason: 'This browser does not provide the required WebCodecs APIs.' };
  }

  // avc1.42E01F: H.264 Constrained Baseline Level 3.1; higher resolutions
  // may require Level 4.0 or 4.2. Probe rather than assuming one level.
  const levels = width * height > 1280 * 720 ? ['avc1.42E02A', 'avc1.42E028'] : ['avc1.42E01F', 'avc1.42E028'];
  try {
    let videoCodec: string | undefined;
    for (const codec of levels) {
      const config: VideoEncoderConfig = {
        codec, width, height, framerate: fps, bitrate: 5_000_000,
        avc: { format: 'avc' },
      };
      const result = await VideoEncoder.isConfigSupported(config);
      if (result.supported) { videoCodec = codec; break; }
    }
    if (!videoCodec) return { supported: false, reason: 'H.264 encoding is unavailable at the requested resolution and frame rate.' };

    const audioConfig: AudioEncoderConfig = {
      codec: 'mp4a.40.2', sampleRate: 48_000, numberOfChannels: 2, bitrate: 192_000,
    };
    const audio = await AudioEncoder.isConfigSupported(audioConfig);
    if (!audio.supported) return { supported: false, reason: 'AAC audio encoding is unavailable in this browser.' };

    return { supported: true, videoCodec, audioCodec: audioConfig.codec };
  } catch (error) {
    return { supported: false, reason: error instanceof Error ? error.message : 'WebCodecs capability check failed.' };
  }
}
