import type { ReactNode } from 'react';

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function StudioPageHeader({ eyebrow, title, description, actions, className = '' }: Props) {
  return (
    <section className={`rangmanch-studio-panel-strong rounded-[28px] px-5 py-5 sm:px-6 sm:py-6 ${className}`.trim()}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          {eyebrow ? <p className="rangmanch-section-eyebrow">{eyebrow}</p> : null}
          <h1 className="mt-1 font-heading text-3xl font-extrabold tracking-tight text-text sm:text-4xl">{title}</h1>
          {description ? <p className="mt-2 text-sm leading-7 text-muted sm:text-base">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}

