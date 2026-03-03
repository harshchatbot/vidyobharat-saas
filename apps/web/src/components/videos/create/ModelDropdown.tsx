import { ChevronRight, Info } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import type { AIVideoModel } from '@/types/api';

import { MODEL_ICONS } from './constants';

export function ModelDropdown({
  models,
  selectedModel,
  onChange,
}: {
  models: AIVideoModel[];
  selectedModel: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => models.find((model) => model.key === selectedModel) ?? models[0],
    [models, selectedModel],
  );
  const SelectedIcon = MODEL_ICONS[selected?.key] ?? Info;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] p-4 text-left transition hover:bg-[hsl(var(--color-elevated))]"
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.55)] text-[hsl(var(--color-accent))]">
            <SelectedIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--color-accent))]">Selected model</p>
            <p className="mt-1 text-lg font-semibold text-text">{selected?.label ?? 'Choose a model'}</p>
            <p className="mt-1 text-sm text-muted">
              {selected?.frontendHint ?? 'Pick the output engine that best matches your creative intent.'}
            </p>
          </div>
          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted" />
        </div>
      </button>

      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--color-accent))]">Model selection</p>
              <h3 className="mt-1 text-xl font-semibold text-text">Choose your video model</h3>
              <p className="mt-1 text-sm text-muted">Select the model, then keep the composer focused on script, voice, and output.</p>
            </div>
            {selected ? <Badge>{selected.label}</Badge> : null}
          </div>
          <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {models.map((model) => {
              const Icon = MODEL_ICONS[model.key] ?? Info;
              const active = model.key === selectedModel;
              return (
                <button
                  key={model.key}
                  type="button"
                  onClick={() => {
                    onChange(model.key);
                    setOpen(false);
                  }}
                  className={`w-full rounded-[24px] border p-4 text-left transition ${
                    active
                      ? 'border-[hsl(var(--color-accent))] bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.16),transparent)] shadow-soft'
                      : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.7)] hover:bg-[hsl(var(--color-elevated))]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.55)] text-[hsl(var(--color-accent))]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-base font-semibold text-text">{model.label}</p>
                        {active ? <Badge>Selected</Badge> : null}
                      </div>
                      <p className="mt-1 text-sm text-muted">{model.description}</p>
                      <p className="mt-2 text-xs text-[hsl(var(--color-accent))]">{model.frontendHint}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Modal>
    </>
  );
}
