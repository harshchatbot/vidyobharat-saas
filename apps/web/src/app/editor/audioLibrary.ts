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

export async function fetchAudioLibrary(category?: 'music' | 'sfx', query?: string): Promise<AudioLibraryEntry[]> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (query?.trim()) params.set('query', query.trim());
  const response = await fetch(`${getApiUrl()}/api/editor/audio-library?${params.toString()}`, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error('The audio library is temporarily unavailable.');
  const body = await response.json() as { items?: AudioLibraryEntry[] };
  return body.items ?? [];
}

export function catalogPlaybackUrl(entry: AudioLibraryEntry): string {
  return entry.playback_url.startsWith('http') ? entry.playback_url : `${getApiUrl()}${entry.playback_url}`;
}
