/**
 * Pure timing primitives for talking-head editing.
 * Source times are seconds in the uploaded recording; timeline times are seconds
 * in the edited reel. No media is mutated by these functions.
 */
export type SourceInterval = { start: number; end: number };
export type EditedSegment = {
  sourceStart: number;
  sourceEnd: number;
  timelineStart: number;
  duration: number;
};
export type TimedWord = { start: number; end: number; text: string };
export type EditedWord = TimedWord & { sourceStart: number; sourceEnd: number };

const EPSILON = 1e-6;

export function buildEditedSegments(
  sourceDuration: number,
  removals: readonly SourceInterval[],
  minKeepSeconds = 0.25,
): EditedSegment[] {
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) throw new Error('Invalid source duration.');
  if (!Number.isFinite(minKeepSeconds) || minKeepSeconds < 0) throw new Error('Invalid minimum segment duration.');
  const sorted = removals.map(({ start, end }) => {
    if (![start, end].every(Number.isFinite) || start < 0 || end <= start || end > sourceDuration + EPSILON) {
      throw new Error('Invalid removal interval.');
    }
    return { start: Math.min(start, sourceDuration), end: Math.min(end, sourceDuration) };
  }).sort((a, b) => a.start - b.start);
  const merged: SourceInterval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end + EPSILON) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  }
  const kept: SourceInterval[] = [];
  let cursor = 0;
  for (const interval of merged) {
    if (interval.start - cursor >= minKeepSeconds - EPSILON) kept.push({ start: cursor, end: interval.start });
    cursor = Math.max(cursor, interval.end);
  }
  if (sourceDuration - cursor >= minKeepSeconds - EPSILON) kept.push({ start: cursor, end: sourceDuration });
  let timelineStart = 0;
  return kept.map(({ start, end }) => {
    const duration = end - start;
    const segment = { sourceStart: start, sourceEnd: end, timelineStart, duration };
    timelineStart += duration;
    return segment;
  });
}

/** Translate a source timestamp into the edited timeline; removed portions return null. */
export function sourceToTimeline(time: number, segments: readonly EditedSegment[]): number | null {
  if (!Number.isFinite(time)) return null;
  for (const segment of segments) {
    if (time >= segment.sourceStart - EPSILON && time < segment.sourceEnd - EPSILON) {
      return segment.timelineStart + Math.max(0, time - segment.sourceStart);
    }
  }
  return null;
}

/** Split words at cuts so captions never drift or display through removed speech. */
export function remapWords(words: readonly TimedWord[], segments: readonly EditedSegment[]): EditedWord[] {
  const result: EditedWord[] = [];
  for (const word of words) {
    if (![word.start, word.end].every(Number.isFinite) || word.end <= word.start) continue;
    for (const segment of segments) {
      const sourceStart = Math.max(word.start, segment.sourceStart);
      const sourceEnd = Math.min(word.end, segment.sourceEnd);
      if (sourceEnd - sourceStart <= EPSILON) continue;
      result.push({
        text: word.text,
        sourceStart,
        sourceEnd,
        start: segment.timelineStart + sourceStart - segment.sourceStart,
        end: segment.timelineStart + sourceEnd - segment.sourceStart,
      });
    }
  }
  return result.sort((a, b) => a.start - b.start);
}

/** Conservative pause suggestions from timestamped speech; never cut through a word. */
export function suggestSpeechPauseCuts(
  words: readonly TimedWord[],
  duration: number,
  maxCuts = 5,
): SourceInterval[] {
  if (!Number.isFinite(duration) || duration <= 0 || !words.length) return [];
  const sorted = [...words].filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start)
    .sort((a, b) => a.start - b.start);
  const gaps: SourceInterval[] = [];
  let lastEnd = 0;
  for (const word of sorted) {
    const start = Math.max(0, Math.min(duration, word.start));
    const end = Math.max(start, Math.min(duration, word.end));
    if (start - lastEnd >= 0.85) {
      const from = lastEnd === 0 ? 0 : lastEnd + 0.18;
      const to = start - 0.18;
      if (to - from >= 0.45) gaps.push({ start: from, end: to });
    }
    lastEnd = Math.max(lastEnd, end);
  }
  if (duration - lastEnd >= 1.1) gaps.push({ start: lastEnd + 0.18, end: duration });
  // Prefer longer pauses while keeping chronological order and at most eight kept clips.
  return gaps.sort((a, b) => (b.end - b.start) - (a.end - a.start))
    .slice(0, Math.max(0, Math.min(5, maxCuts)))
    .sort((a, b) => a.start - b.start);
}
