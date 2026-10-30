import type { GuestMedia, TimelineProject, VideoTimelineItem } from '../../app/editor/timeline/types.ts';

export type BrowserIntent =
  | { op: 'add_media'; mediaReference: 'second_image' | 'first_image'; start?: number; duration?: number }
  | { op: 'add_text'; text: string; clipReferences: Array<'clip_1' | 'clip_2'>; start?: number; duration?: number; position: 'center'; animation?: 'fade-in'; animationDuration?: number }
  | { op: 'add_audio'; mediaReference: 'music'; volume: number; muted?: boolean; start?: number }
  | { op: 'add_effect'; preset: 'fade-in' | 'fade-out' | 'zoom-in' | 'zoom-out'; target: 'video' | 'text'; start?: number; duration?: number }
  | { op: 'update_item'; itemReference: 'clip_1' | 'clip_2' | 'music'; changes: Record<string, number | string | boolean> }
  | { op: 'set_duration'; target: 'all_images'; seconds: number };

export type ResolvedBrowserIntent = BrowserIntent & { resolvedItemIds?: string[]; resolvedMediaId?: string };
export type BrowserRequestRoute = { kind: 'CREATE_REEL'; duration?: number; style: 'elegant' | 'energetic' | 'cinematic'; title?: string; musicVolume?: number; transition?: 'crossfade' | 'slide-left' | 'slide-right' } | { kind: 'EDIT_TIMELINE' } | { kind: 'CLARIFICATION'; message: string };
export type BrowserConversationResponse = { kind: 'chat' | 'advice'; message: string };

export function classifyBrowserConversation(instruction: string, project: TimelineProject, media: GuestMedia[]): BrowserConversationResponse | null {
  const text = instruction.trim();
  const lower = text.toLowerCase();
  if (/^(hi|hello|hey|namaste|नमस्ते)[!. ]*$/.test(lower)) {
    return { kind: 'chat', message: "Hey! I'm your AI video editing assistant. What would you like to create today?" };
  }
  if (/\b(how|suggest|advice|ideas?|what can you do)\b/.test(lower) && /\b(reel|video|edit|engag|story|pacing|feature)\b/.test(lower)) {
    const visualCount = project.tracks.find((track) => track.id === 'video')?.items.length ?? 0;
    const availableImages = media.filter((item) => item.media_type === 'image' && item.availability !== 'unavailable').length;
    const message = visualCount > 0
      ? `Your timeline has ${visualCount} visual ${visualCount === 1 ? 'clip' : 'clips'}. Try a clear opening title, varied pacing, and one restrained transition style; I can propose supported edits for you to review.`
      : availableImages > 0
        ? `You have ${availableImages} uploaded ${availableImages === 1 ? 'image' : 'images'}. Add them to the timeline or ask me to create a reel, then use a short title and consistent pacing.`
        : 'Upload photos or video clips first. Then I can help with pacing, titles, transitions, music, and a complete Auto Edit reel.';
    return { kind: 'advice', message };
  }
  const asksForTitle = /\b(add|create|show)\b[^.]{0,80}\btitle\b/i.test(text);
  const hasExactTitle = /title[^"']*["'][^"']+["']/i.test(text) || /title\s*:\s*\S+/i.test(text);
  if (asksForTitle && !hasExactTitle && routeBrowserRequest(text).kind !== 'CREATE_REEL') {
    return { kind: 'chat', message: 'What should the title say? Put the exact text in quotation marks so I can propose it safely.' };
  }
  return null;
}

export function routeBrowserRequest(instruction: string): BrowserRequestRoute {
  const lower = instruction.toLowerCase();
  const create = /\b(create|make|generate|produce)\b/.test(lower) && /\b(reel|video|promotional|instagram|products?|photos?)\b/.test(lower);
  if (!create) return { kind: 'EDIT_TIMELINE' };
  const durationMatch = lower.match(/(\d+(?:\.\d+)?)\s*[- ]?second/);
  const title = instruction.match(/title\s+["']([^"']+)["']/i)?.[1] ?? instruction.match(/title\s+([^,.]+?)(?:\.|,|$)/i)?.[1]?.trim();
  const style = /energetic|dynamic/.test(lower) ? 'energetic' : /cinematic|film/.test(lower) ? 'cinematic' : 'elegant';
  const transition = /slide/.test(lower) ? 'slide-left' : /smooth|blend|crossfade/.test(lower) ? 'crossfade' : undefined;
  const musicVolume = /soft|gentle|quiet/.test(lower) ? 0.3 : /music/.test(lower) ? 0.5 : undefined;
  if (/music/.test(lower) && /multiple|different|several/.test(lower)) return { kind: 'CLARIFICATION', message: 'Please choose one uploaded music track for this reel.' };
  return { kind: 'CREATE_REEL', duration: durationMatch ? Number(durationMatch[1]) : undefined, style, title, musicVolume, transition };
}

export function parseBrowserIntent(instruction: string): BrowserIntent[] {
  const intents: BrowserIntent[] = [];
  const lower = instruction.toLowerCase();
  if (/add|include|also/.test(lower) && /second image/.test(lower)) intents.push({ op: 'add_media', mediaReference: 'second_image' });
  const title = instruction.match(/(?:text|title)[^"']*["']([^"']+)["']/i) ?? instruction.match(/(?:show|add)\s+([A-Za-z][A-Za-z ]{1,120}?)(?:\s+across\s+both\s+clips|\s+on\s+clip\s*\d)/i);
  if (title) intents.push({ op: 'add_text', text: title[1].trim(), clipReferences: (/clip\s*1[^.]{0,80}clip\s*2/i.test(instruction) || /both\s+clips/i.test(instruction)) ? ['clip_1', 'clip_2'] : ['clip_1'], position: 'center' });
  if (/music/.test(lower)) {
    const volume = instruction.match(/(\d+(?:\.\d+)?)\s*%\s*volume/i);
    const muted = /\bmute|muted\b/.test(lower);
    intents.push({ op: 'add_audio', mediaReference: 'music', volume: volume ? Number(volume[1]) / 100 : /quieter|lower|soft|quiet/.test(lower) ? 0.5 : 1, muted });
  }
  if (/blend|crossfade/.test(lower)) throw new Error('Crossfade requires overlapping visual clips and is not supported without changing clip timing.');
  else if (/fade[- ]in|start smoothly|starting smoothly/.test(lower)) intents.push({ op: 'add_effect', preset: 'fade-in', target: /text/.test(lower) ? 'text' : 'video', start: 0, duration: 1 });
  if (/fade[- ]out|end smoothly/.test(lower)) intents.push({ op: 'add_effect', preset: 'fade-out', target: 'video', start: undefined, duration: 1 });
  if (/zoom\s+out/.test(lower)) intents.push({ op: 'add_effect', preset: 'zoom-out', target: 'video', duration: 3 });
  else if (/zoom|zoom\s+in/.test(lower)) intents.push({ op: 'add_effect', preset: 'zoom-in', target: 'video', duration: 3 });
  return intents;
}

export function resolveBrowserIntent(intents: BrowserIntent[], project: TimelineProject, media: GuestMedia[]): ResolvedBrowserIntent[] {
  const images = media.filter((item) => item.media_type === 'image');
  const audio = media.filter((item) => item.media_type === 'audio');
  const visuals = (project.tracks.find((track) => track.id === 'video')?.items ?? []).filter((item): item is VideoTimelineItem => item.kind === 'video').sort((a, b) => a.startTime - b.startTime);
  return intents.map((intent) => {
    if (intent.op === 'add_media') {
      const candidate = intent.mediaReference === 'second_image' ? images[1] : images[0];
      if (!candidate) throw new Error(`Missing uploaded media reference: ${intent.mediaReference}.`);
      return { ...intent, resolvedMediaId: candidate.media_id };
    }
    if (intent.op === 'add_audio') {
      if (intent.volume < 0 || intent.volume > 1) throw new Error('Music volume must be between 0 and 100 percent.');
      if (audio.length !== 1) throw new Error(audio.length === 0 ? 'Missing uploaded music reference.' : 'Ambiguous music reference: choose exactly one audio asset.');
      return { ...intent, resolvedMediaId: audio[0].media_id };
    }
    if (intent.op === 'add_text') {
      const selected = intent.clipReferences.map((reference) => visuals[reference === 'clip_1' ? 0 : 1]);
      if (selected.some((item) => !item)) throw new Error('The requested text clip reference does not exist.');
      const start = selected[0].startTime;
      const end = selected[selected.length - 1].startTime + selected[selected.length - 1].duration;
      if (intent.duration !== undefined && (!Number.isFinite(intent.duration) || intent.duration <= 0)) throw new Error('Text duration must be greater than zero.');
      return { ...intent, start: intent.start ?? start, duration: intent.duration ?? end - start };
    }
    if (intent.op === 'add_effect') {
      if (visuals.length === 0) throw new Error('The requested video effect has no visual target.');
      const start = intent.preset === 'fade-out' ? Math.max(0, visuals.at(-1)!.startTime + visuals.at(-1)!.duration - (intent.duration ?? 1)) : intent.start ?? visuals[0].startTime;
      return { ...intent, start, duration: intent.duration ?? 1 };
    }
    return intent;
  });
}
