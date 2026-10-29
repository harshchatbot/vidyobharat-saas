import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Free Browser Video Editor',
  description: 'Create Instagram Reels and short videos from your photos with local AI editing, music, transitions, text, and browser-based MP4 export.',
  path: '/editor',
  keywords: ['free browser video editor', 'Instagram Reel editor', 'photo video maker'],
});

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
