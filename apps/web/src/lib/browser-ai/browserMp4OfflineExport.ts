import {
  ALL_FORMATS, AudioBufferSink, AudioBufferSource, BufferTarget, CanvasSink,
  CanvasSource, Input, Mp4OutputFormat, Output, Quality, UrlSource,
} from 'mediabunny';
import type { AudioTimelineItem, TimelineProject, VideoTimelineItem } from '../../app/editor/timeline/types';
import {
  browserExportDimensions, drawRangManchWatermark, drawTimelineFrame,
  supportedTimelineItems, validateExportDuration, type BrowserTimelineAssets,
} from './browserMp4Export';

type ExportOptions = { signal?: AbortSignal; onProgress?: (progress: number) => void; watermark?: boolean };
const SAMPLE_RATE = 48000;
const abort = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Export cancelled.', 'AbortError');
};

type Source = { input: Input; video?: CanvasSink; audio?: AudioBuffer };
type TimedItem = VideoTimelineItem | AudioTimelineItem;

/** Decode each source's audio once, then schedule exact clip offsets in an offline mix. */
async function decodeAudio(input: Input, context: OfflineAudioContext): Promise<AudioBuffer | undefined> {
  const track = await input.getPrimaryAudioTrack();
  if (!track) return;
  if (!await track.canDecode()) throw new Error('An audio track uses an unsupported codec.');
  const chunks: { buffer: AudioBuffer; timestamp: number }[] = [];
  let end = 0;
  const sink = new AudioBufferSink(track);
  for await (const chunk of sink.buffers()) {
    chunks.push({ buffer: chunk.buffer, timestamp: chunk.timestamp });
    end = Math.max(end, chunk.timestamp + chunk.duration);
  }
  const result = context.createBuffer(2, Math.max(1, Math.ceil(end * SAMPLE_RATE)), SAMPLE_RATE);
  for (const { buffer, timestamp } of chunks) {
    // OfflineAudioContext resamples any source buffer to the output sample rate.
    const node = context.createBufferSource();
    node.buffer = buffer;
    const gain = context.createGain();
    node.connect(gain).connect(context.destination);
    node.start(Math.max(0, timestamp), Math.max(0, -timestamp));
  }
  // Render into a separate context so that all original source timestamps are preserved.
  return context.startRendering();
}

/**
 * Deterministic, entirely local H.264/AAC MP4 exporter.
 * A slow decoder makes export slower; it does not advance the project clock.
 */
export async function exportTimelineMp4Offline(
  project: TimelineProject, assets: BrowserTimelineAssets, options: ExportOptions = {},
): Promise<Blob> {
  validateExportDuration(project.duration);
  abort(options.signal);
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined' || typeof AudioEncoder === 'undefined') {
    throw new Error('Offline export requires browser WebCodecs H.264/AAC support (try recent Chrome).');
  }
  const { videos: clips, audio: audioClips } = supportedTimelineItems(project, assets);
  const fps = project.exportSettings.fps;
  const { width, height } = browserExportDimensions(project.aspectRatio, project.exportSettings.resolution);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable.');

  const catalog = new Map(assets.media.map((m) => [m.media_id, m]));
  const sourceIds = new Set([...clips, ...audioClips].filter((item) =>
    catalog.get(item.mediaId)?.media_type !== 'image').map((item) => item.mediaId));
  const sources = new Map<string, Source>();
  let output: Output | undefined;
  let finalized = false;
  try {
    for (const id of sourceIds) {
      abort(options.signal);
      const element = assets.videos?.[id] || assets.audio?.[id];
      if (!element) throw new Error(`Missing source media ${id}`);
      const url = element.currentSrc || element.src;
      const input = new Input({ source: new UrlSource(url, { requestInit: { credentials: 'include' } }), formats: ALL_FORMATS });
      sources.set(id, { input });
      if (!await input.canRead()) throw new Error(`Unsupported media container: ${id}`);
      const track = await input.getPrimaryVideoTrack();
      if (track && catalog.get(id)?.media_type === 'video') {
        if (!await track.canDecode()) throw new Error(`Unsupported video codec: ${id}`);
        sources.get(id)!.video = new CanvasSink(track, { poolSize: 2 });
      }
      const audioTrack = await input.getPrimaryAudioTrack();
      if (audioTrack) {
        if (!await audioTrack.canDecode()) throw new Error(`Unsupported audio codec: ${id}`);
        const duration = await audioTrack.computeDuration();
        const decodeContext = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * SAMPLE_RATE)), SAMPLE_RATE);
        sources.get(id)!.audio = await decodeAudio(input, decodeContext);
      }
    }

    const audible: TimedItem[] = [...clips, ...audioClips].filter((item) =>
      !item.muted && item.volume > 0 && sources.get(item.mediaId)?.audio);
    const mix = audible.length ? new OfflineAudioContext(2, Math.ceil(project.duration * SAMPLE_RATE), SAMPLE_RATE) : null;
    if (mix) for (const item of audible) {
      const buffer = sources.get(item.mediaId)!.audio!;
      const duration = Math.min(item.duration, buffer.duration - item.sourceStart, project.duration - item.startTime);
      if (duration <= 0) continue;
      const source = mix.createBufferSource();
      source.buffer = buffer;
      const gain = mix.createGain();
      gain.gain.value = item.volume;
      source.connect(gain).connect(mix.destination);
      source.start(item.startTime, item.sourceStart, duration);
    }

    const target = new BufferTarget();
    output = new Output({ format: new Mp4OutputFormat(), target });
    const video = new CanvasSource(canvas, {
      codec: 'avc', quality: new Quality(project.exportSettings.quality === 'high' ? 'high' : 'medium'),
    });
    output.addVideoTrack(video);
    const audio = mix ? new AudioBufferSource({ codec: 'aac', quality: new Quality('high') }) : null;
    if (audio) output.addAudioTrack(audio);
    await output.start();
    if (audio && mix) {
      abort(options.signal);
      await audio.add(await mix.startRendering());
      audio.close();
    }

    const total = Math.ceil(project.duration * fps);
    const visualCanvases: Record<string, HTMLVideoElement> = {};
    const visuals: BrowserTimelineAssets = { ...assets, videos: visualCanvases };
    for (let index = 0; index < total; index++) {
      abort(options.signal);
      const time = index / fps;
      // Include both sides of cuts/crossfades; sourceTime is independent of wall clock.
      const relevant = clips.filter((clip) => sources.get(clip.mediaId)?.video &&
        time >= clip.startTime - 0.5 && time < clip.startTime + clip.duration + 0.5);
      for (const clip of relevant) {
        const sink = sources.get(clip.mediaId)!.video!;
        const sourceTime = Math.max(0, clip.sourceStart + time - clip.startTime);
        const frame = await sink.getCanvas(sourceTime);
        if (!frame) throw new Error(`Cannot decode source video at ${sourceTime.toFixed(3)} seconds.`);
        visualCanvases[clip.mediaId] = frame.canvas as HTMLVideoElement;
      }
      drawTimelineFrame(ctx, project, visuals, Math.round(time * 30), time);
      if (options.watermark !== false) drawRangManchWatermark(ctx);
      await video.add(time, Math.min(1 / fps, project.duration - time));
      options.onProgress?.((index + 1) / total);
    }
    video.close();
    await output.finalize();
    finalized = true;
    if (!target.buffer) throw new Error('MP4 muxer returned an empty file.');
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    if (output && !finalized) await output.cancel().catch(() => undefined);
    for (const source of sources.values()) source.input.dispose();
  }
}
