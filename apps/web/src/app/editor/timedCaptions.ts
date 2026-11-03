import { remapWords, type EditedSegment, type TimedWord } from './talkingHeadTiming.ts';
import { createBasicText } from './timeline/textTemplates.ts';
import type { TextTimelineItem } from './timeline/types.ts';

/** Speech engine adapter contract: timestamps refer to the ORIGINAL uploaded recording. */
export type WordTranscript = {
  language?: string;
  words: TimedWord[];
};

export function validateWordTranscript(value: unknown, sourceDuration: number): WordTranscript {
  if (!value || typeof value !== 'object' || !('words' in value) || !Array.isArray(value.words)) {
    throw new Error('Speech recognition did not return timestamped words.');
  }
  const words = value.words as unknown[];
  if (words.length > 1000) throw new Error('Transcript exceeds the word limit.');
  let previous = -1;
  const valid: TimedWord[] = [];
  for (const word of words) {
    if (!word || typeof word !== 'object') throw new Error('Invalid transcript word.');
    const w = word as Record<string, unknown>;
    if (typeof w.text !== 'string' || !w.text.trim() || w.text.length > 100 ||
        typeof w.start !== 'number' || typeof w.end !== 'number' ||
        !Number.isFinite(w.start) || !Number.isFinite(w.end) ||
        w.start < 0 || w.end <= w.start || w.end > sourceDuration + 0.05 || w.start < previous) {
      throw new Error('Transcript contains invalid or unsorted word timestamps.');
    }
    valid.push({ text: w.text.trim(), start: w.start, end: w.end });
    previous = w.start;
  }
  return { words: valid };
}

/** One readable, animated caption per short phrase, aligned to speech and cuts. */
export function buildTimedCaptions(
  transcript: WordTranscript,
  segments: readonly EditedSegment[],
  limit = 8,
): TextTimelineItem[] {
  const words = remapWords(transcript.words, segments);
  const phrases: typeof words[] = [];
  let current: typeof words = [];
  for (const word of words) {
    const last = current.at(-1);
    if (last && (word.start - last.end > 0.35 || word.end - current[0].start > 1.8 || current.length >= 4)) {
      phrases.push(current);
      current = [];
    }
    current.push(word);
  }
  if (current.length) phrases.push(current);
  return phrases.slice(0, limit).filter((phrase) => phrase.at(-1)!.end - phrase[0].start >= 0.25).map((phrase) => {
    const startTime = Math.round(phrase[0].start * 30) / 30;
    const endTime = Math.round(phrase.at(-1)!.end * 30) / 30;
    const text = phrase.map((word) => word.text).join(' ');
    return {
      ...createBasicText(startTime),
      id: crypto.randomUUID(), label: `Caption: ${text}`, text,
      startTime, duration: Math.max(0.25, endTime - startTime),
      fontFamily: 'Noto Sans', fontSize: 42, bold: true,
      color: '#ffffff', outlineColor: '#000000', outlineWidth: 4,
      shadow: true, backgroundColor: '#000000', backgroundOpacity: 0.45,
      y: 0.78, width: 0.88, alignment: 'center',
      inAnimation: 'pop-in', inAnimationDuration: 0.18,
      outAnimation: 'fade-out', outAnimationDuration: 0.12,
    };
  });
}
