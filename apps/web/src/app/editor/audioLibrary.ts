import { getApiUrl } from '../../lib/env.ts';

export type AudioLibraryEntry = {
  id: string;
  title: string;
  category: string;
  type: 'music' | 'sfx';
  duration_seconds: number;
  content_type: string;
  tags: string[];
  license: string;
  attribution: string | null;
  source: string;
  evidence_reference: string;
  playback_url: string;
};

export const catalogMediaId = (id: string) => `catalog:${id}`;
export const isCatalogMediaId = (id: string) => id.startsWith('catalog:');

/** Resolve persisted pre-migration numeric catalog IDs without treating arbitrary labels as IDs. */
export function resolveCatalogEntry(entries: AudioLibraryEntry[], mediaId: string): AudioLibraryEntry | undefined {
  if (!isCatalogMediaId(mediaId)) return undefined;
  const id = mediaId.slice('catalog:'.length);
  const direct = entries.find((entry) => entry.id === id);
  if (direct || !/^\d{6,}$/.test(id)) return direct;
  return entries.find((entry) => entry.title.trim().split(/\s+/)[0] === id);
}

export async function fetchAudioLibrary(category?: 'music' | 'sfx', query?: string): Promise<AudioLibraryEntry[]> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (query?.trim()) params.set('query', query.trim());
  const response = await fetch(`${getApiUrl()}/api/editor/audio-library?${params.toString()}`, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail = typeof payload?.detail === 'string' ? payload.detail : null;
    throw new Error(`Sound library could not load (HTTP ${response.status})${detail ? `: ${detail}` : '. Check that the editor API and Firebase catalog are available.'}`);
  }
  const body = await response.json() as { items?: AudioLibraryEntry[] };
  return body.items ?? [];
}

export function catalogPlaybackUrl(entry: AudioLibraryEntry): string {
  return entry.playback_url.startsWith('http') ? entry.playback_url : `${getApiUrl()}${entry.playback_url}`;
}
