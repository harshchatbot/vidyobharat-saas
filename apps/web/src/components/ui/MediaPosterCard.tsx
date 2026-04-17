'use client';

import React from 'react';

type Props = {
  preview: string;
  title: string;
  aspectRatio?: string;
  href?: string;
  roundedClassName?: string;
  imageClassName?: string;
  bodyClassName?: string;
  titleClassName?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
};

export function MediaPosterCard({
  preview,
  title,
  aspectRatio = '5 / 4',
  href,
  roundedClassName = 'rounded-[14px] sm:rounded-[16px]',
  imageClassName = '',
  bodyClassName = 'space-y-1 p-1.5 sm:p-2',
  titleClassName = 'line-clamp-2 text-[10px] font-semibold leading-4 text-text sm:text-[11px]',
  meta,
  actions,
  footer,
}: Props) {
  const Wrapper = href ? 'a' : 'div';
  const wrapperProps = href ? { href } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`rangmanch-poster-card group block overflow-hidden ${roundedClassName} border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-surface)/0.38)] transition duration-200 hover:-translate-y-0.5 hover:border-[hsl(var(--color-accent)/0.26)] hover:shadow-[var(--shadow-hard)]`}
    >
      <div className="relative">
        <img
          src={preview}
          alt={title}
          className={`w-full object-cover transition duration-300 group-hover:scale-[1.025] ${imageClassName}`}
          style={{ aspectRatio }}
          loading="lazy"
          decoding="async"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[hsl(var(--color-bg)/0.18)] via-transparent to-transparent opacity-90" />
        {actions ? (
          <div className="absolute inset-x-1.5 top-1.5 z-10 flex items-start justify-end gap-1 sm:inset-x-2 sm:top-2 sm:gap-1.5">
            {actions}
          </div>
        ) : null}
      </div>
      <div className={bodyClassName}>
        <p className={titleClassName}>{title}</p>
        {meta}
        {footer}
      </div>
    </Wrapper>
  );
}