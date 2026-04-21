'use client';

import type { ReactNode } from 'react';

import { Modal } from '@/components/ui/Modal';

type Props = {
  open: boolean;
  onClose: () => void;
  imageUrl: string;
  imageAlt: string;
  title: string;
  subtitle?: string | null;
  prompt?: string | null;
  promptActions?: ReactNode;
  badges?: ReactNode;
  details?: ReactNode;
  actions?: ReactNode;
  imageAspectRatio?: string;
};

export function ImageDetailModal({
  open,
  onClose,
  imageUrl,
  imageAlt,
  title,
  subtitle,
  prompt,
  promptActions,
  badges,
  details,
  actions,
  imageAspectRatio,
}: Props) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_360px]">
        <div className="flex min-h-[240px] items-center justify-center rounded-[22px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] px-3 py-3 sm:min-h-[320px] sm:px-4 sm:py-4">
          <img
            src={imageUrl}
            alt={imageAlt}
            className="max-h-[68dvh] w-full rounded-[18px] object-contain"
            style={imageAspectRatio ? { aspectRatio: imageAspectRatio } : undefined}
          />
        </div>

        <div className="rounded-[22px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-surface)/0.82)] p-4 sm:p-5">
          <div className="max-h-[60dvh] overflow-y-auto pr-1">
            {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}

            <div className="mt-3">
              <h3 className="font-heading text-xl font-extrabold tracking-tight text-text sm:text-2xl">{title}</h3>
              {subtitle ? <p className="mt-1 text-xs text-muted">{subtitle}</p> : null}
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-text">Prompt</p>
                {promptActions}
              </div>
              <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-3">
                {prompt ? (
                  <p className="text-sm leading-6 text-muted">{prompt}</p>
                ) : (
                  <p className="text-sm text-muted">No prompt saved for this image.</p>
                )}
              </div>
            </div>

            {details ? <div className="mt-4">{details}</div> : null}
          </div>

          {actions ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[hsl(var(--color-border)/0.55)] pt-4">
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
