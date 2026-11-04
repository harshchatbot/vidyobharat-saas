/**
 * Offline browser MP4 export. Every frame and audio sample is placed on the
 * project timeline, not on a wall-clock MediaRecorder timeline.
 *
 * Requires WebCodecs H.264/AAC support. No backend transcoding.
 */
import {
  ALL_FORMATS, AudioBufferSink, AudioBufferSource, BlobSource, BufferTarget,
  CanvasSource, Input, Mp4OutputFormat, Output, Quality, VideoSampleSink,
} from 'mediabunny';
import type { AudioTimelineItem, TimelineProject, VideoTimelineItem } from '../../app/editor/timeline/types';
import {
  browserExportDimensions, drawRangManchWatermark, drawTimelineFrame,
  supportedTimelineItems, validateExportDuration,
  type BrowserTimelineAssets,
} from './browserMp4Export';

type Options = { signal?: AbortSignal; onProgress?: (progress: number) => void; watermark?: boolean };
const SAMPLE_RATE = 48000;
const MAX_SOURCE_BYTES = 250 * 1024 * 1024;

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Export cancelled.', 'AbortError');
}

async function readSource(url: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(url, { credentials: 'include', signal });
  if (!response.ok) throw new Error(`Could not read source media (HTTP ${response.status}).`);
  const size = Number(response.headers.get('content-length') || 0);
  if (size > MAX_SOURCE_BYTES) throw new Error('Source file exceeds the 250 MB browser export limit.');
  const blob = await response.blob();
  if (blob.size > MAX_SOURCE_BYTES) throw new Error('Source file exceeds the 250 MB browser export limit.');
  return blob;
}

async function decodedAudioBuffer(input: Input, context: BaseAudioContext): Promise<AudioBuffer | null> {
  const track = await input.getPrimaryAudioTrack();
  if (!track) return null;
  if (!await track.canDecode()) throw new Error('The browser cannot decode an audio track in the source file.');
  const sampleRate = await track.getSampleRate();
  const channels = Math.min(2, await track.getNumberOfChannels());
  const duration = await track.computeDuration();
  const buffer = context.createBuffer(channels, Math.ceil(duration * sampleRate) + 1, sampleRate);
  const sink = new AudioBufferSink(track);
  for await (const part of sink.buffers()) {
    const offset = Math.round(part.timestamp * sampleRate);
    for (let channel = 0; channel < channels; channel++) {
      const data = part.buffer.getChannelData(Math.min(channel, part.buffer.numberOfChannels - 1));
      const target = buffer.getChannelData(channel);
      const from = Math.max(0, -offset);
      const to = Math.min(data.length, target.length - offset);
      if (to > from) target.set(data.subarray(from, to), offset + from);
    }
  }
  return buffer;
}

export async function exportTimelineMp4Offline(
  project: TimelineProject, assets: BrowserTimelineAssets, options: Options = {},
): Promise<Blob> {
  validateExportDuration(project.duration);
  checkAbort(options.signal);
  if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined' || typeof VideoDecoder === 'undefined') {
    throw new Error('Offline MP4 export requires Chrome with WebCodecs video and audio support.');
  }
  const { videos: clips, audio: audioClips } = supportedTimelineItems(project, assets);
  const fps = project.exportSettings.fps;
  const { width, height } = browserExportDimensions(project.aspectRatio, project.exportSettings.resolution);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is unavailable.');

  const inputs = new Map<string, Input>();
  const frames = new Map<string, { sink: VideoSampleSink; canvas: HTMLCanvasElement }>();
  const decodedAudio = new Map<string, AudioBuffer>();
  const mediaMap = new Map(assets.media.map((item) => [item.media_id, item]));
  const sourceIds = new Set([
    ...clips.filter((clip) => mediaMap.get(clip.mediaId)?.media_type === 'video').map((clip) => clip.mediaId),
    ...audioClips.map((clip) => clip.mediaId),
  ]);
  // Create the input only once per original source, including its embedded audio.
  try {
    const scratch = new OfflineAudioContext(2, 1, SAMPLE_RATE);
    for (const id of sourceIds) {
      checkAbort(options.signal);
      const source = assets.videos?.[id] || assets.audio?.[id];
      if (!source?.src) throw new Error(`Missing source for ${id}.`);
      const input = new Input({ source: new BlobSource(await readSource(source.currentSrc || source.src, options.signal)), formats: ALL_FORMATS });
      inputs.set(id, input);
      const track = await input.getPrimaryVideoTrack();
      if (track && mediaMap.get(id)?.media_type === 'video') {
        if (!await track.canDecode()) throw new Error(`Unsupported video codec for ${id}.`);
        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = await track.getDisplayWidth();
        frameCanvas.height = await track.getDisplayHeight();
        frames.set(id, { sink: new VideoSampleSink(track), canvas: frameCanvas });
      }
      const decoded = await decodedAudioBuffer(input, scratch);
      if (decoded) decodedAudio.set(id, decoded);
    }

    const needsAudio = clips.some((clip) => !clip.muted && decodedAudio.has(clip.mediaId))
      || audioClips.some((clip) => !clip.muted && decodedAudio.has(clip.mediaId));
    const mixed = needsAudio ? new OfflineAudioContext(2, Math.ceil(project.duration * SAMPLE_RATE), SAMPLE_RATE) : null;
    if (mixed) {
      const schedule = (item: VideoTimelineItem | AudioTimelineItem) => {
        if (item.muted || item.volume <= 0) return;
        const buffer = decodedAudio.get(item.mediaId);
        if (!buffer) return;
        const duration = Math.min(item.duration, buffer.duration - item.sourceStart, project.duration - item.startTime);
        if (duration <= 0) return;
        const node = mixed.createBufferSource();
        node.buffer = buffer;
        const gain = mixed.createGain();
        gain.gain.value = item.volume;
        node.connect(gain).connect(mixed.destination);
        node.start(item.startTime, item.sourceStart, duration);
      };
      clips.forEach(schedule);
      audioClips.forEach(schedule);
    }

    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat(), target });
    const videoSource = new CanvasSource(canvas, {
      codec: 'avc', quality: new Quality(project.exportSettings.quality === 'high' ? 'high' : 'medium'),
    });
    output.addVideoTrack(videoSource);
    const audioSource = mixed ? new AudioBufferSource({ codec: 'aac', quality: new Quality('high') }) : null;
    if (audioSource) output.addAudioTrack(audioSource);
    await output.start();
    // Render audio offline before the first video frame; both tracks have fixed timestamps.
    if (audioSource && mixed) {
      checkAbort(options.signal);
      await audioSource.add(await mixed.startRendering());
      audioSource.close();
    }
    const totalFrames = Math.ceil(project.duration * fps);
    // drawTimelineFrame expects a CanvasImageSource for each source.
    const visuals: BrowserTimelineAssets = {
      ...assets, videos: Object.fromEntries([...frames].map(([id, item]) => [id, item.canvas])) as unknown as Record<string, HTMLVideoElement>,
    };
    for (let frame = 0; frame < totalFrames; frame++) {
      checkAbort(options.signal);
      const time = frame / fps;
      // Pre-decode every source needed for this frame, including both sides of a transition.
      const relevant = clips.filter((clip) => frames.has(clip.mediaId)
        && time >= clip.startTime - 0.5 && time < clip.startTime + clip.duration + 0.5);
      for (const clip of relevant) {
        const decoded = frames.get(clip.mediaId)!;
        const sourceTime = Math.max(0, clip.sourceStart + time - clip.startTime);
        const sample = await decoded.sink.getSample(sourceTime);
        if (!sample) throw new Error(`Unable to decode video at ${sourceTime.toFixed(2)}s.`);
        try {
          const ctx = decoded.canvas.getContext('2d');
          if (!ctx) throw new Error('Source canvas is unavailable.');
          ctx.clearRect(0, 0, decoded.canvas.width, decoded.canvas.height);
          sample.draw(ctx, 0, 0, decoded.canvas.width, decoded.canvas.height);
        } finally { sample.close(); }
      }
      // Renderer is defined in 30fps logical ticks; preserve the exact frame time.
      drawTimelineFrame(context, project, visuals, Math.round(time * 30));
      if (options.watermark !== false) drawRangManchWatermark(context);
      await videoSource.add(time, Math.min(1 / fps, project.duration - time));
      options.onProgress?.((frame + 1) / totalFrames);
    }
    videoSource.close();
    await output.finalize();
    if (!target.buffer) throw new Error('MP4 muxing produced no output.');
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    for (const input of inputs.values()) input.dispose();
  }
}
