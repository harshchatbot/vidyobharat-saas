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
  aspectRatio = '4 / 5',
  href,
  roundedClassName = 'rounded-[18px]',
  imageClassName = '',
  bodyClassName = 'space-y-1.5 p-2.5',
  titleClassName = 'line-clamp-2 text-xs font-semibold text-text',
  meta,
  actions,
  footer,
}: Props) {
  const Wrapper = href ? 'a' : 'div';
  const wrapperProps = href ? { href } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`rangmanch-poster-card group block overflow-hidden ${roundedClassName} transition hover:-translate-y-0.5`}
    >
      <div className="relative">
        <img
          src={preview}
          alt={title}
          className={`w-full object-cover transition duration-300 group-hover:scale-[1.02] ${imageClassName}`}
          style={{ aspectRatio }}
        />
        {actions ? <div className="absolute inset-x-2 top-2 z-10 flex items-start justify-end gap-1.5">{actions}</div> : null}
      </div>
      <div className={bodyClassName}>
        <p className={titleClassName}>{title}</p>
        {meta}
        {footer}
      </div>
    </Wrapper>
  );
}
