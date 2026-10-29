export const EXPORT_WIDTH = 720;
export const EXPORT_HEIGHT = 1280;
export const EXPORT_FPS = 30;
export const EXPORT_DURATION_SECONDS = 30;
import type { EffectTimelineItem, GuestMedia, TextTimelineItem, TimelineProject, VideoTimelineItem } from '../../app/editor/timeline/types.ts';
import { browserEffectState, transitionProgress } from '../../app/editor/timeline/filters.ts';

export function titleOpacity(time: number, fadeSeconds = 2): number {
  if (time <= 0) return 0;
  return Math.min(1, time / Math.max(0.1, fadeSeconds));
}

export function frameTime(frame: number): number {
  return frame / EXPORT_FPS;
}

export function wrapTextLines(context: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

export type BrowserTimelineAssets = { images: Record<string, HTMLImageElement>; audio?: Record<string, HTMLAudioElement>; media: GuestMedia[] };

export function supportedTimelineItems(project: TimelineProject, assets: BrowserTimelineAssets): { videos: VideoTimelineItem[]; texts: TextTimelineItem[]; audio: import('../../app/editor/timeline/types.ts').AudioTimelineItem[]; effects: EffectTimelineItem[] } {
  const media = new Map(assets.media.map((item) => [item.media_id, item]));
  const items = project.tracks.flatMap((track) => track.items);
  const videos = items.filter((item): item is VideoTimelineItem => item.kind === 'video');
  for (const video of videos) {
    if (media.get(video.mediaId)?.media_type !== 'image' || !assets.images[video.mediaId]) throw new Error(`Unsupported or missing image media for timeline item ${video.id}.`);
    if (video.startTime < 0 || video.duration <= 0) throw new Error(`Invalid timing for timeline item ${video.id}.`);
  }
  for (const text of items.filter((item): item is TextTimelineItem => item.kind === 'text')) {
    if (!['none', 'fade-in'].includes(text.inAnimation) || text.outAnimation !== 'none' || text.loopAnimation !== 'none') throw new Error(`Unsupported text animation on timeline item ${text.id}.`);
  }
  const audio = items.filter((item): item is import('../../app/editor/timeline/types.ts').AudioTimelineItem => item.kind === 'audio');
  const effects = items.filter((item): item is EffectTimelineItem => item.kind === 'effect');
  if (effects.some((effect) => !['fade-in', 'fade-out', 'zoom-in', 'zoom-out'].includes(effect.preset))) throw new Error('This browser export does not support one or more visual effects.');
  for (const item of audio) if (!assets.audio?.[item.mediaId]) throw new Error(`Unsupported or missing audio media for timeline item ${item.id}.`);
  for (const item of items) if (item.kind !== 'video' && item.kind !== 'text' && item.kind !== 'audio') throw new Error(`Unsupported timeline element: ${item.kind}.`);
  return { videos: [...videos].sort((a, b) => a.startTime - b.startTime), texts: items.filter((item): item is TextTimelineItem => item.kind === 'text'), audio, effects };
}

export function drawExportFrame(
  context: CanvasRenderingContext2D,
  images: HTMLImageElement[],
  frame: number,
  title: string,
): void {
  const time = frameTime(frame);
  const imageIndex = Math.min(images.length - 1, Math.floor(time / 5));
  context.fillStyle = '#000';
  context.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
  const image = images[imageIndex];
  if (image) {
    const scale = Math.max(EXPORT_WIDTH / image.naturalWidth, EXPORT_HEIGHT / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (EXPORT_WIDTH - width) / 2, (EXPORT_HEIGHT - height) / 2, width, height);
  }
  if (title) {
    context.save();
    context.globalAlpha = titleOpacity(time);
    context.fillStyle = '#fff';
    context.font = 'bold 56px Inter, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = '#000';
    context.shadowBlur = 8;
    context.fillText(title, EXPORT_WIDTH / 2, EXPORT_HEIGHT / 2);
    context.restore();
  }
}

export function drawTimelineFrame(context: CanvasRenderingContext2D, project: TimelineProject, assets: BrowserTimelineAssets, frame: number): void {
  const { videos, texts, effects } = supportedTimelineItems(project, assets);
  const time = frameTime(frame);
  context.fillStyle = '#000'; context.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
  const video = videos.find((item) => time >= item.startTime && time < item.startTime + item.duration);
  const previous = video ? videos[video ? videos.indexOf(video) - 1 : -1] : undefined;
  const transition = previous?.transitionOut && video && Math.abs((previous.startTime + previous.duration) - video.startTime) < 1e-6 ? previous.transitionOut : undefined;
  const drawVideo = (item: VideoTimelineItem, alpha = 1, offset = 0) => {
    const image = assets.images[item.mediaId];
    const scale = item.cropMode === 'contain' ? Math.min(EXPORT_WIDTH / image.naturalWidth, EXPORT_HEIGHT / image.naturalHeight) : Math.max(EXPORT_WIDTH / image.naturalWidth, EXPORT_HEIGHT / image.naturalHeight);
    const width = image.naturalWidth * scale; const height = image.naturalHeight * scale;
    const state = browserEffectState(effects.filter((effect) => time >= effect.startTime && time < effect.startTime + effect.duration), time);
    context.save(); context.globalAlpha = state.opacity * alpha; context.filter = state.filter || 'none'; context.translate(EXPORT_WIDTH / 2 + offset, EXPORT_HEIGHT / 2); context.scale(state.scale, state.scale); context.drawImage(image, -width / 2, -height / 2, width, height); context.restore();
  };
  if (video && transition && time >= video.startTime - transition.duration / 2 && time <= video.startTime + transition.duration / 2) {
    const progress = transitionProgress(video.startTime, transition.duration, time);
    drawVideo(previous!, 1 - progress, transition.type === 'slide-left' ? -EXPORT_WIDTH * progress : transition.type === 'slide-right' ? EXPORT_WIDTH * progress : 0);
    drawVideo(video, progress, transition.type === 'slide-left' ? EXPORT_WIDTH * (1 - progress) : transition.type === 'slide-right' ? -EXPORT_WIDTH * (1 - progress) : 0);
  } else if (video) drawVideo(video);
  for (const text of texts) {
    if (time < text.startTime || time >= text.startTime + text.duration) continue;
    const localTime = time - text.startTime;
    const opacity = text.inAnimation === 'fade-in' ? titleOpacity(localTime, text.inAnimationDuration) : 1;
    context.save(); context.globalAlpha = opacity; context.fillStyle = text.color; context.font = `${text.bold ? 'bold ' : ''}${Math.round(text.fontSize)}px ${text.fontFamily}, sans-serif`; context.textAlign = text.alignment; context.textBaseline = 'middle';
    const x = text.x * EXPORT_WIDTH; const y = text.y * EXPORT_HEIGHT;
    if (text.shadow) { context.shadowColor = '#000'; context.shadowBlur = 8; }
    const maxWidth = text.width * EXPORT_WIDTH;
    const lines = wrapTextLines(context, text.text, maxWidth);
    const lineHeight = Math.round(text.fontSize * 1.15);
    const firstLineY = y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, index) => context.fillText(line, x, firstLineY + index * lineHeight)); context.restore();
  }
}

export function supportsBrowserMp4Export(): { mediaRecorder: boolean; webCodecs: boolean } {
  const mediaRecorder = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4');
  const webCodecs = typeof VideoEncoder !== 'undefined';
  return { mediaRecorder, webCodecs };
}

export function validateExportDuration(duration: number): void {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('The timeline duration must be greater than zero.');
  if (duration > EXPORT_DURATION_SECONDS + 1e-9) throw new Error(`Local browser export supports timelines up to ${EXPORT_DURATION_SECONDS} seconds.`);
}

function exportAbortError(): DOMException {
  return new DOMException('Export cancelled.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw exportAbortError();
}

function nextAnimationFrame(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let frame = 0;
    const onAbort = () => { cancelAnimationFrame(frame); reject(exportAbortError()); };
    signal?.addEventListener('abort', onAbort, { once: true });
    frame = requestAnimationFrame(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    });
  });
}

let activeExport = false;

export async function exportBrowserMp4(images: HTMLImageElement[], title: string): Promise<Blob> {
  if (images.length !== 3) throw new Error('Choose exactly three images.');
  if (typeof document === 'undefined') throw new Error('Browser export is unavailable outside the browser.');
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported('video/mp4')) {
    throw new Error('This browser cannot record MP4 from a canvas. Use a browser with video/mp4 MediaRecorder support.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D rendering is unavailable.');
  const stream = canvas.captureStream(EXPORT_FPS);
  const chunks: BlobPart[] = [];
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: 'video/mp4', videoBitsPerSecond: 4_000_000 });
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('The browser could not allocate enough resources for MP4 export. Close other media-heavy tabs and try again.');
  }
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('The browser MP4 recorder failed.'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/mp4' }));
  });
  recorder.start(250);
  const totalFrames = EXPORT_DURATION_SECONDS * EXPORT_FPS;
  for (let frame = 0; frame < totalFrames; frame += 1) {
    drawExportFrame(context, images, frame, title);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  recorder.stop();
  stream.getTracks().forEach((track) => track.stop());
  return finished;
}

export async function exportTimelineMp4(project: TimelineProject, assets: BrowserTimelineAssets, options: { signal?: AbortSignal; onProgress?: (progress: number) => void } = {}): Promise<Blob> {
  if (activeExport) throw new Error('An export is already in progress. Please wait for it to finish or cancel it.');
  validateExportDuration(project.duration);
  throwIfAborted(options.signal);
  const { audio } = supportedTimelineItems(project, assets);
  if (typeof document === 'undefined') throw new Error('Browser export is unavailable outside the browser.');
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported('video/mp4')) throw new Error('This browser cannot encode compatible MP4 locally. Use a supported Chromium-based browser.');
  const canvas = document.createElement('canvas'); canvas.width = EXPORT_WIDTH; canvas.height = EXPORT_HEIGHT;
  const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas 2D rendering is unavailable.');
  const stream = canvas.captureStream(EXPORT_FPS); const chunks: BlobPart[] = [];
  const AudioContextCtor = globalThis.AudioContext;
  if (audio.length > 0 && !AudioContextCtor) throw new Error('This browser cannot mix timeline audio during MP4 export.');
  const audioContext = audio.length > 0 && AudioContextCtor ? new AudioContextCtor() : null;
  const destination = audioContext?.createMediaStreamDestination();
  const sources: MediaElementAudioSourceNode[] = [];
  const gains: GainNode[] = [];
  const nodes = audio.map((item) => {
    const element = assets.audio![item.mediaId];
    const source = audioContext!.createMediaElementSource(element);
    const gain = audioContext!.createGain(); gain.gain.value = item.muted ? 0 : item.volume;
    source.connect(gain).connect(destination!);
    sources.push(source); gains.push(gain);
    return { item, element };
  });
  destination?.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: 'video/mp4', videoBitsPerSecond: 4_000_000 });
  } catch {
    sources.forEach((source) => source.disconnect());
    gains.forEach((gain) => gain.disconnect());
    if (audioContext) await audioContext.close().catch(() => undefined);
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('The browser could not allocate enough resources for MP4 export. Close other media-heavy tabs and try again.');
  }
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const finished = new Promise<Blob>((resolve, reject) => { recorder.onerror = () => reject(new Error('The browser MP4 recorder failed.')); recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/mp4' })); });
  activeExport = true;
  try {
    recorder.start(250);
    for (const { item, element } of nodes) {
      element.currentTime = item.sourceStart;
      try { await element.play(); } catch { throw new Error('Audio playback could not start for export.'); }
    }
    const totalFrames = Math.ceil(project.duration * EXPORT_FPS);
    for (let frame = 0; frame < totalFrames; frame += 1) {
      throwIfAborted(options.signal);
      drawTimelineFrame(context, project, assets, frame);
      options.onProgress?.((frame + 1) / totalFrames);
      await nextAnimationFrame(options.signal);
    }
    if (recorder.state === 'recording') recorder.stop();
    return await finished;
  } catch (error) {
    if (recorder.state === 'recording') recorder.stop();
    await finished.catch(() => undefined);
    throw error instanceof DOMException && error.name === 'AbortError' ? error : error instanceof Error ? error : new Error('The browser MP4 export failed.');
  } finally {
    nodes.forEach(({ element }) => { element.pause(); element.removeAttribute('src'); element.load(); });
    sources.forEach((source) => source.disconnect());
    gains.forEach((gain) => gain.disconnect());
    if (audioContext) await audioContext.close().catch(() => undefined);
    stream.getTracks().forEach((track) => track.stop());
    activeExport = false;
  }
}
