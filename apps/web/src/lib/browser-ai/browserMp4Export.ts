export const EXPORT_WIDTH = 720;
export const EXPORT_HEIGHT = 1280;
export const EXPORT_FPS = 30;
export const EXPORT_DURATION_SECONDS = 60;

export function browserExportDimensions(aspectRatio: TimelineProject["aspectRatio"], resolution: TimelineProject["exportSettings"]["resolution"]) {
  const base = resolution === "1080p" ? 1080 : 720;
  const ratios: Record<TimelineProject["aspectRatio"], [number, number]> = {
    "9:16": [9, 16], "16:9": [16, 9], "1:1": [1, 1], "4:5": [4, 5],
  };
  const [w, h] = ratios[aspectRatio];
  return h >= w ? { width: base, height: Math.round(base * h / w / 2) * 2 } : { width: Math.round(base * w / h / 2) * 2, height: base };
}

import type { EffectTimelineItem, GuestMedia, TextTimelineItem, TimelineItem, TimelineProject, VideoTimelineItem } from '../../app/editor/timeline/types.ts';
import { browserEffectState, transitionProgress } from '../../app/editor/timeline/filters.ts';
import { textAnimationFrame } from '../../app/editor/timeline/textAnimations.ts';

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

export type BrowserTimelineAssets = { images: Record<string, HTMLImageElement>; videos?: Record<string, HTMLVideoElement>; audio?: Record<string, HTMLAudioElement>; media: GuestMedia[] };

export function supportedTimelineItems(project: TimelineProject, assets: BrowserTimelineAssets): { videos: VideoTimelineItem[]; texts: TextTimelineItem[]; audio: import('../../app/editor/timeline/types.ts').AudioTimelineItem[]; effects: EffectTimelineItem[] } {
  const media = new Map(assets.media.map((item) => [item.media_id, item]));
  const items = project.tracks.flatMap((track) => track.items);
  const videos = items.filter((item): item is VideoTimelineItem => item.kind === 'video');
  for (const video of videos) {
    if (!((media.get(video.mediaId)?.media_type === 'image' && assets.images[video.mediaId]) || (media.get(video.mediaId)?.media_type === 'video' && assets.videos?.[video.mediaId]))) throw new Error(`Missing visual media for timeline item ${video.id}.`);
    if (video.startTime < 0 || video.duration <= 0) throw new Error(`Invalid timing for timeline item ${video.id}.`);
  }

  const audio = items.filter((item): item is import('../../app/editor/timeline/types.ts').AudioTimelineItem => item.kind === 'audio');
  const effects = items.filter((item): item is EffectTimelineItem => item.kind === 'effect');
  if (effects.some((effect) => !['fade-in', 'fade-out', 'zoom-in', 'zoom-out'].includes(effect.preset))) throw new Error('This browser export does not support one or more visual effects.');
  for (const item of audio) if (!assets.audio?.[item.mediaId]) throw new Error(`Unsupported or missing audio media for timeline item ${item.id}.`);
  for (const item of items) if (item.kind !== 'video' && item.kind !== 'text' && item.kind !== 'audio' && item.kind !== 'effect') throw new Error(`Unsupported timeline element: ${(item as TimelineItem).kind}.`);
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
  const WIDTH = context.canvas.width;
  const HEIGHT = context.canvas.height;
  const { videos, texts, effects } = supportedTimelineItems(project, assets);
  const time = frameTime(frame);
  context.fillStyle = '#000'; context.fillRect(0, 0, WIDTH, HEIGHT);
  const video = videos.find((item) => time >= item.startTime && time < item.startTime + item.duration);
  const previous = video ? videos[video ? videos.indexOf(video) - 1 : -1] : undefined;
  const transition = previous?.transitionOut && video && Math.abs((previous.startTime + previous.duration) - video.startTime) < 1e-6 ? previous.transitionOut : undefined;
  const drawVideo = (item: VideoTimelineItem, alpha = 1, offset = 0) => {
    const image = assets.images[item.mediaId] || assets.videos?.[item.mediaId];
    if (!image) return;
    const naturalWidth = image instanceof HTMLVideoElement ? image.videoWidth : image.naturalWidth;
    const naturalHeight = image instanceof HTMLVideoElement ? image.videoHeight : image.naturalHeight;
    if (naturalWidth <= 0 || naturalHeight <= 0) return;
    const scale = item.cropMode === 'contain' ? Math.min(WIDTH / naturalWidth, HEIGHT / naturalHeight) : Math.max(WIDTH / naturalWidth, HEIGHT / naturalHeight);
    const width = naturalWidth * scale; const height = naturalHeight * scale;
    const state = browserEffectState(effects.filter((effect) => time >= effect.startTime && time < effect.startTime + effect.duration), time);
    context.save(); context.globalAlpha = state.opacity * alpha; context.filter = state.filter || 'none'; context.translate(WIDTH / 2 + offset, HEIGHT / 2); context.scale(state.scale, state.scale); context.drawImage(image, -width / 2, -height / 2, width, height); context.restore();
  };
  if (video && transition && time >= video.startTime - transition.duration / 2 && time <= video.startTime + transition.duration / 2) {
    const progress = transitionProgress(video.startTime, transition.duration, time);
    drawVideo(previous!, 1 - progress, transition.type === 'slide-left' ? -WIDTH * progress : transition.type === 'slide-right' ? WIDTH * progress : 0);
    drawVideo(video, progress, transition.type === 'slide-left' ? WIDTH * (1 - progress) : transition.type === 'slide-right' ? -WIDTH * (1 - progress) : 0);
  } else if (video) drawVideo(video);
  for (const text of texts) {
    if (time < text.startTime || time >= text.startTime + text.duration) continue;
    const localTime = time - text.startTime;
    const motion = textAnimationFrame(text, localTime);
    const unit = WIDTH / 720;
    context.save();
    context.globalAlpha = motion.opacity;
    const fontSize = Math.round(text.fontSize * unit);
    context.font = `${text.bold ? 'bold ' : ''}${fontSize}px "${text.fontFamily.replace(/["\\\\]/g, '')}", sans-serif`;
    context.textAlign = text.alignment;
    context.textBaseline = 'middle';
    const x = text.x * WIDTH; const y = text.y * HEIGHT;
    context.translate(x, y);
    context.rotate(text.rotation * Math.PI / 180);
    context.translate(0, motion.translateY * unit);
    context.scale(motion.scale, motion.scale);
    const maxWidth = text.width * WIDTH;
    const captionWords = text.captionWords?.length && text.captionWords.map((word) => word.text).join(' ') === text.text.trim() ? text.captionWords : undefined;
    const lines = wrapTextLines(context, text.text, Math.max(1, maxWidth - 16 * unit));
    const lineHeight = Math.round(fontSize * 1.12);
    const blockHeight = Math.max(lineHeight, lines.length * lineHeight) + 8 * unit;
    const originX = text.alignment === 'left' ? -maxWidth / 2 + 8 * unit : text.alignment === 'right' ? maxWidth / 2 - 8 * unit : 0;
    if (text.backgroundOpacity > 0) {
      context.save();
      context.globalAlpha *= text.backgroundOpacity;
      context.fillStyle = text.backgroundColor;
      context.fillRect(-maxWidth / 2, -blockHeight / 2, maxWidth, blockHeight);
      context.restore();
    }
    context.fillStyle = text.color;
    if (text.shadow) { context.shadowColor = 'rgba(0,0,0,.55)'; context.shadowBlur = 8 * unit; context.shadowOffsetY = 2 * unit; }
    const firstLineY = -((lines.length - 1) * lineHeight) / 2;
    for (let index = 0; index < lines.length; index += 1) {
      const baseline = firstLineY + index * lineHeight;
      if (text.outlineWidth > 0) {
        context.strokeStyle = text.outlineColor;
        context.lineWidth = text.outlineWidth * unit;
        context.strokeText(lines[index], originX, baseline);
      }
      if (!captionWords) {
        context.fillText(lines[index], originX, baseline);
      } else {
        // Match the word wrapping above, then paint each word individually.
        const words = lines[index].split(/\s+/).filter(Boolean);
        const spaceWidth = context.measureText(' ').width;
        const totalWidth = context.measureText(lines[index]).width;
        let cursor = text.alignment === 'center' ? -totalWidth / 2 : text.alignment === 'right' ? originX - totalWidth : originX;
        const previousWordCount = lines.slice(0, index).reduce((count, line) => count + line.split(/\s+/).filter(Boolean).length, 0);
        context.save(); context.textAlign = 'left';
        for (const [wordIndex, word] of words.entries()) {
          const timing = captionWords[previousWordCount + wordIndex];
          context.fillStyle = timing && localTime >= timing.start && localTime < timing.end ? '#ffe066' : text.color;
          const energetic = (text.fontFamily === 'Arial Black' || text.fontFamily === 'Noto Sans Devanagari') && text.fontSize >= 50;
          const active = Boolean(timing && localTime >= timing.start && localTime < timing.end);
          if (energetic && active) {
            context.save();
            const wordWidth = context.measureText(word).width;
            context.translate(cursor + wordWidth / 2, baseline - 2 * unit);
            context.scale(1.13, 1.13);
            context.fillText(word, -wordWidth / 2, 0);
            context.restore();
          } else context.fillText(word, cursor, baseline);
          cursor += context.measureText(word).width + spaceWidth;
        }
        context.restore();
      }
    }
    context.restore();
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

export function drawRangManchWatermark(context: CanvasRenderingContext2D): void {
  const { width, height } = context.canvas;
  // Standard transparent wordmark: subtle white lettering with a dark outline,
  // no opaque badge or colored background obscuring the creator's footage.
  const fontSize = Math.max(15, Math.round(width * 0.024));
  const inset = Math.max(16, Math.round(width * 0.032));
  context.save();
  context.font = `700 ${fontSize}px sans-serif`;
  context.textAlign = 'right';
  context.textBaseline = 'bottom';
  context.globalAlpha = 0.78;
  context.lineWidth = Math.max(2, fontSize * 0.17);
  context.lineJoin = 'round';
  context.strokeStyle = 'rgba(0,0,0,0.55)';
  context.strokeText('RangManch AI', width - inset, height - inset);
  context.fillStyle = '#ffffff';
  context.fillText('RangManch AI', width - inset, height - inset);
  context.restore();
}

export async function exportTimelineMp4(project: TimelineProject, assets: BrowserTimelineAssets, options: { signal?: AbortSignal; onProgress?: (progress: number) => void; watermark?: boolean } = {}): Promise<Blob> {
  if (activeExport) throw new Error('An export is already in progress. Please wait for it to finish or cancel it.');
  validateExportDuration(project.duration);
  throwIfAborted(options.signal);
  const { audio, videos: videoItems } = supportedTimelineItems(project, assets);
  if (typeof document === 'undefined') throw new Error('Browser export is unavailable outside the browser.');
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported('video/mp4')) throw new Error('This browser cannot encode compatible MP4 locally. Use a supported Chromium-based browser.');
  // Ensure the export canvas uses the same downloaded web fonts as the editor preview.
  if (document.fonts?.load) {
    const texts = project.tracks.flatMap((track) => track.items).filter((item): item is TextTimelineItem => item.kind === 'text');
    await Promise.all([...new Map(texts.map((item) => [
      item.fontFamily + ':' + item.bold,
      document.fonts.load(`${item.bold ? '700' : '400'} 24px "${item.fontFamily.replace(/["\\]/g, '')}", sans-serif`, item.text),
    ])).values()]);
    await document.fonts.ready;
  }
  const dimensions = browserExportDimensions(project.aspectRatio, project.exportSettings.resolution);
  const canvas = document.createElement('canvas'); canvas.width = dimensions.width; canvas.height = dimensions.height;
  const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas 2D rendering is unavailable.');
  const fps = project.exportSettings.fps;
  const stream = canvas.captureStream(fps); const chunks: BlobPart[] = [];
  const AudioContextCtor = globalThis.AudioContext;
  const sourceVideos = [...new Set(videoItems.filter((item) => Boolean(assets.videos?.[item.mediaId])).map((item) => item.mediaId))];
  const needsAudioMix = audio.length > 0 || videoItems.some((item) => Boolean(assets.videos?.[item.mediaId]) && !item.muted);
  if (needsAudioMix && !AudioContextCtor) throw new Error('This browser cannot mix original speech or timeline audio during MP4 export.');
  const audioContext = needsAudioMix && AudioContextCtor ? new AudioContextCtor() : null;
  const destination = audioContext?.createMediaStreamDestination();
  const sources: MediaElementAudioSourceNode[] = [];
  const gains: GainNode[] = [];
  // A media element can only be connected to one MediaElementAudioSourceNode.
  // Route each source video once, and gate its speech by the active timeline clip.
  // Never route editor preview elements into an export AudioContext: the browser
  // permits only one MediaElementAudioSourceNode per element for its lifetime.
  const exportVideos: Record<string, HTMLVideoElement> = {};
  const videoNodes = sourceVideos.map((mediaId) => {
    const preview = assets.videos![mediaId];
    const element = document.createElement('video');
    element.crossOrigin = preview.crossOrigin;
    element.preload = 'auto';
    element.playsInline = true;
    element.src = preview.currentSrc || preview.src;
    exportVideos[mediaId] = element;
    if (!audioContext) return { mediaId, element, gain: null as GainNode | null };
    const source = audioContext.createMediaElementSource(element);
    const gain = audioContext.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(destination!);
    sources.push(source); gains.push(gain);
    return { mediaId, element, gain };
  });
  const nodes = audio.map((item) => {
<<<<<<< HEAD
    const preview = assets.audio![item.mediaId];
    const element = document.createElement('audio');
    element.crossOrigin = preview.crossOrigin;
    element.preload = 'auto';
    element.src = preview.currentSrc || preview.src;
=======
    // Export must own its audio element. Reusing a preview element fails on
    // subsequent exports because a media element can only have one source node.
    const previewElement = assets.audio![item.mediaId];
    const element = new Audio(previewElement.currentSrc || previewElement.src);
    element.crossOrigin = previewElement.crossOrigin;
    element.preload = 'auto';
>>>>>>> 9dc43ef (fix(editor): isolate audio elements for repeated browser MP4 exports)
    const source = audioContext!.createMediaElementSource(element);
    const gain = audioContext!.createGain(); gain.gain.value = 0;
    source.connect(gain).connect(destination!);
    sources.push(source); gains.push(gain);
    return { item, element, gain };
  });
  destination?.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: 'video/mp4', videoBitsPerSecond: project.exportSettings.quality === 'high' ? 9_000_000 : 5_000_000 });
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
    if (audioContext && audioContext.state === 'suspended') await audioContext.resume();
    let activeClipId: string | null = null;
    // MediaRecorder records wall-clock time, not logical timeline frames.
    // Never allow slow canvas rendering or video decoding to stretch a 29s
    // timeline into a multi-minute recording.
    const renderStart = performance.now();
    let lastFrame = -1;
    while (true) {
      throwIfAborted(options.signal);
      const elapsed = (performance.now() - renderStart) / 1000;
      if (elapsed >= project.duration) break;
      const frame = Math.floor(elapsed * fps);
      if (frame === lastFrame) { await nextAnimationFrame(options.signal); continue; }
      lastFrame = frame;
      const time = elapsed;
      const activeClip = videoItems.find((item) =>
        Boolean(assets.videos?.[item.mediaId]) && time >= item.startTime && time < item.startTime + item.duration
      );
      if ((activeClip?.id ?? null) !== activeClipId) {
        activeClipId = activeClip?.id ?? null;
        for (const node of videoNodes) {
          const isActive = activeClip?.mediaId === node.mediaId;
          if (!isActive) {
            node.gain?.gain.setValueAtTime(0, audioContext!.currentTime);
            node.element.pause();
            continue;
          }
          // Even when two clips use the same file, seek to the retained source segment.
          node.gain?.gain.setValueAtTime(0, audioContext!.currentTime);
          node.element.pause();
          node.element.currentTime = activeClip.sourceStart + time - activeClip.startTime;
          // A muted media element can feed silence into createMediaElementSource.
          // The element is routed ONLY to MediaStreamDestination (not speakers),
          // so unmuting is required to preserve original speech in the recording.
          node.element.muted = false;
          try { await node.element.play(); } catch { throw new Error('Video playback could not start during export.'); }
          node.gain?.gain.setValueAtTime(activeClip.muted ? 0 : activeClip.volume, audioContext!.currentTime);
        }
      }
      for (const { item, element, gain } of nodes) {
        const active = time >= item.startTime && time < item.startTime + item.duration;
        gain.gain.setValueAtTime(active && !item.muted ? item.volume : 0, audioContext!.currentTime);
        if (!active) { element.pause(); continue; }
        if (element.paused) {
          element.currentTime = item.sourceStart + time - item.startTime;
          try { await element.play(); } catch { throw new Error('Audio playback could not start for export.'); }
        }
      }
      // Draw from dedicated export decoders, never from a paused editor preview.
      // Waiting for a decoded frame avoids recording a stale frame after a seek.
      if (activeClip) {
        const activeElement = exportVideos[activeClip.mediaId];
        if (activeElement && activeElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => { cleanup(); reject(new Error('Video decoding stalled during export. Try 720p or a shorter clip.')); }, 3000);
            const onReady = () => { cleanup(); resolve(); };
            const cleanup = () => { clearTimeout(timeout); activeElement.removeEventListener('loadeddata', onReady); activeElement.removeEventListener('error', onReady); };
            activeElement.addEventListener('loadeddata', onReady, { once: true });
            activeElement.addEventListener('error', onReady, { once: true });
          });
        }
      }
      drawTimelineFrame(context, project, { ...assets, videos: exportVideos }, Math.round(frame * EXPORT_FPS / fps));
      if (options.watermark !== false) drawRangManchWatermark(context);
      options.onProgress?.(Math.min(1, time / project.duration));
      await nextAnimationFrame(options.signal);
    }
    if (recorder.state === 'recording') recorder.stop();
    return await finished;
  } catch (error) {
    if (recorder.state === 'recording') recorder.stop();
    await finished.catch(() => undefined);
    throw error instanceof DOMException && error.name === 'AbortError' ? error : error instanceof Error ? error : new Error('The browser MP4 export failed.');
  } finally {
    nodes.forEach(({ element, gain }) => { gain.gain.value = 0; element.pause(); element.removeAttribute('src'); element.load(); });
    videoNodes.forEach(({ element, gain }) => { if (gain) gain.gain.value = 0; element.pause(); element.removeAttribute('src'); element.load(); });
    sources.forEach((source) => source.disconnect());
    gains.forEach((gain) => gain.disconnect());
    if (audioContext) await audioContext.close().catch(() => undefined);
    stream.getTracks().forEach((track) => track.stop());
    activeExport = false;
  }
}
