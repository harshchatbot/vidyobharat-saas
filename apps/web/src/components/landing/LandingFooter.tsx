'use client';

import { motion } from 'framer-motion';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { GlassPanel } from '@/components/landing/GlassPanel';

export function LandingFooter() {
  return (
    <motion.footer
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="py-8"
    >
      <GlassPanel className="px-6 py-6">
        <div className="grid items-start gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <BrandLogo href="/" variant="full" size="md" className="max-w-[250px]" priority="footer" />
            <p className="mt-2 text-sm text-muted">India-first AI video creation platform for creators, brands, and storytellers.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Product</p>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              <li>Text to video</li>
              <li>Image to video</li>
              <li>AI influencer studio</li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Company</p>
            <p className="mt-2 text-sm text-muted">About</p>
            <p className="mt-1 text-sm text-muted">Pricing</p>
            <p className="mt-1 text-sm text-muted">Contact</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Support</p>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              <li>Help Center</li>
              <li>Creator workflows</li>
              <li>Email support</li>
            </ul>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t border-[hsl(var(--color-border)/0.72)] pt-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} RangManch AI. All rights reserved.</p>
          <span className="inline-flex w-fit rounded-full border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-bg)/0.42)] px-3 py-1 font-medium text-text">
            Made with ❤️ in India by&nbsp;
            <a
              href="https://techfilabs.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[hsl(var(--color-accent))] hover:underline decoration-[hsl(var(--color-accent))] underline-offset-4 transition-all"
            >
              TechFi Labs
            </a>
          </span>
        </div>
      </GlassPanel>
    </motion.footer>
  );
}
