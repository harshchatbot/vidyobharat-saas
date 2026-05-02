import Link from 'next/link';

import { BrandLogo } from '@/components/brand/BrandLogo';

export function LandingFooter() {
  return (
    <footer className="rounded-[32px] border border-[hsl(var(--color-border)/0.7)] bg-[linear-gradient(180deg,hsl(var(--color-surface)/0.92),hsl(var(--color-bg-soft)/0.95))] px-4 py-8 shadow-[var(--shadow-soft)]">
      <div className="px-2 sm:px-2">
        <div className="grid items-start gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <BrandLogo href="/" variant="full" size="md" className="max-w-[250px]" priority="footer" />
            <p className="mt-2 text-sm text-muted">
              India-first AI creation platform for avatar ads, anime reels, freeform videos, and image generation.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Product</p>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              <li><Link href="/signup" className="hover:text-text">Avatar Product ads</Link></li>
              <li><Link href="/signup" className="hover:text-text">Anime Lofi Reel</Link></li>
              <li><Link href="/signup" className="hover:text-text">Freeform video studio</Link></li>
              <li><Link href="/signup" className="hover:text-text">Image generation</Link></li>
              <li><Link href="/templates" className="hover:text-text">Templates & workflows</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Company</p>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              <li><Link href="/company" className="hover:text-text">About</Link></li>
              <li><Link href="/pricing" className="hover:text-text">Pricing</Link></li>
              <li>
                <a href="mailto:harshveernirwan@techfilabs.com" className="hover:text-text">
                  Contact
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Support</p>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              <li><Link href="/learning" className="hover:text-text">Help Center</Link></li>
              <li><Link href="/use-cases" className="hover:text-text">Creator workflows</Link></li>
              <li>
                <a href="mailto:harshveernirwan@techfilabs.com" className="hover:text-text">
                  Email support
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t border-[hsl(var(--color-border)/0.72)] pt-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} RangManch AI. All rights reserved.</p>
          <span className="inline-flex w-fit rounded-[12px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.78)] px-3 py-1 font-medium text-text shadow-[var(--shadow-soft)]">
            Made with ❤️ in India by&nbsp;
            <a
              href="https://techfilabs.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[hsl(var(--color-accent))] hover:underline decoration-[hsl(var(--color-accent))] underline-offset-4 transition-all"
            >
              TechFi Labs
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
