import { notFound } from 'next/navigation';

export default function BrowserMp4PocLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return children;
}
