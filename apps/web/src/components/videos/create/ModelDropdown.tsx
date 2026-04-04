'use client';

import { ChevronDown, Check } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { AIVideoModel } from '@/types/api';

type ModelDropdownProps = {
  models: AIVideoModel[];
  selectedModel: string;
  onChange: (value: string) => void;
  title?: string;
  description?: string;
};

export function ModelDropdown({
  models,
  selectedModel,
  onChange,
  title = 'Engine',
  description = 'Recommended engine',
}: ModelDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const enabledModels = useMemo(() => models.filter((model) => model.enabled !== false), [models]);
  const selected = useMemo(
    () => enabledModels.find((model) => model.key === selectedModel) ?? enabledModels[0] ?? models[0],
    [enabledModels, models, selectedModel],
  );

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const allDisabled = enabledModels.length === 0;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full rounded-[14px] border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-bg)/0.35)] px-3 py-2.5 text-left transition hover:border-[hsl(var(--color-accent)/0.28)]"
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-accent))]">{title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-text">{selected?.shortLabel ?? selected?.label ?? 'Choose model'}</p>
              {selected?.resolutionLabels?.length ? (
                <span className="text-[11px] text-muted">{selected.resolutionLabels.join(' / ')}</span>
              ) : null}
            </div>
            <p className="mt-1 line-clamp-1 text-xs text-muted">{selected?.frontendHint || description}</p>
          </div>
          <ChevronDown className={`h-5 w-5 shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-30 rounded-[14px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.98)] p-1.5 shadow-[var(--shadow-hard)] backdrop-blur-md">
          {allDisabled ? (
            <div className="rounded-[14px] px-3 py-3 text-sm text-muted">No active models are available in this lane right now.</div>
          ) : (
            <div className="space-y-1">
              {enabledModels.map((model) => {
                const active = model.key === selected?.key;
                return (
                  <button
                    key={model.key}
                    type="button"
                    onClick={() => {
                      onChange(model.key);
                      setOpen(false);
                    }}
                    className={`flex w-full items-start justify-between gap-3 rounded-[10px] px-3 py-2.5 text-left transition ${
                      active
                        ? 'bg-[hsl(var(--color-accent)/0.12)] text-text'
                        : 'bg-transparent text-text hover:bg-[hsl(var(--color-bg)/0.78)]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-text">{model.shortLabel ?? model.label}</p>
                        {model.resolutionLabels?.length ? (
                          <span className="text-[11px] text-muted">{model.resolutionLabels.join(' / ')}</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted">{model.frontendHint}</p>
                    </div>
                    <span className="mt-0.5 flex h-5 w-5 items-center justify-center">
                      {active ? <Check className="h-4 w-4 text-[hsl(var(--color-accent))]" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
