import { ChevronDown, Crown, Info, Lock, Sparkles, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import type { AIVideoModel } from '@/types/api';

import { MODEL_ICONS } from './constants';

function toneClass(tone: string) {
  if (tone.toLowerCase().includes('premium') || tone.toLowerCase().includes('highest')) {
    return 'border-[hsl(var(--color-accent)/0.35)] bg-[hsl(var(--color-accent)/0.14)] text-text';
  }
  if (tone.toLowerCase().includes('fast')) {
    return 'border-[hsl(var(--color-success)/0.28)] bg-[hsl(var(--color-success)/0.12)] text-[hsl(var(--color-success))]';
  }
  return 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.72)] text-muted';
}

export function ModelDropdown({
  models,
  selectedModel,
  onChange,
  title = 'Choose your video engine',
  description = 'Pick the model for this lane.',
}: {
  models: AIVideoModel[];
  selectedModel: string;
  onChange: (value: string) => void;
  title?: string;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => models.find((model) => model.key === selectedModel) ?? models.find((model) => model.enabled !== false) ?? models[0],
    [models, selectedModel],
  );
  const enabledModels = useMemo(() => models.filter((model) => model.enabled !== false), [models]);
  const allDisabled = enabledModels.length === 0;
  const featuredModels = useMemo(
    () => models.filter((model) => (model.key === 'sora2' || model.key === 'sora2_pro') && (model.enabled !== false || model.key === selectedModel)),
    [models, selectedModel],
  );
  const otherModels = useMemo(
    () => models.filter((model) => model.key !== 'sora2' && model.key !== 'sora2_pro' && model.enabled !== false),
    [models],
  );
  const SelectedIcon = MODEL_ICONS[selected?.key] ?? Info;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.68)] px-4 py-3 text-left shadow-[var(--shadow-soft)] transition hover:border-[hsl(var(--color-accent)/0.35)] hover:bg-[hsl(var(--color-elevated)/0.9)]"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--color-border))] bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.24),hsl(var(--color-surface)/0.72))] text-[hsl(var(--color-accent))]">
            <SelectedIcon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--color-accent))]">Model</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-text">{selected?.shortLabel ?? selected?.label ?? 'Choose model'}</p>
              {selected?.resolutionLabels?.length ? (
                <span className="truncate text-[11px] text-muted">{selected.resolutionLabels.join(' / ')}</span>
              ) : null}
            </div>
            <p className="mt-1 line-clamp-1 text-xs text-muted">{selected?.frontendHint ?? 'Pick the output engine that best matches your creative goal.'}</p>
          </div>
          <ChevronDown className="h-5 w-5 shrink-0 text-muted" />
        </div>
      </button>

      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--color-accent))]">Model picker</p>
              <h3 className="mt-1 text-2xl font-semibold text-text">{title}</h3>
              <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
            </div>
            {selected ? <Badge variant="warning">{selected.shortLabel ?? selected.label}</Badge> : null}
          </div>

          {allDisabled ? (
            <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.56)] p-4 text-left">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-text">Models in this lane</p>
                <Badge variant="outline">Beta</Badge>
              </div>
              <div className="space-y-2">
                {models.map((model) => (
                  <div
                    key={model.key}
                    className="flex items-center justify-between rounded-[14px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.62)] px-3 py-2"
                  >
                    <span className="text-sm font-medium text-text">{model.shortLabel ?? model.label}</span>
                    <span className="text-xs text-muted">Coming soon</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {featuredModels.map((model) => {
              const Icon = MODEL_ICONS[model.key] ?? Crown;
              const active = model.key === selectedModel;
              const disabled = model.enabled === false;
              return (
                <button
                  key={model.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    onChange(model.key);
                    setOpen(false);
                  }}
                  className={`group relative overflow-hidden rounded-[28px] border p-5 text-left backdrop-blur-md transition ${
                    active
                      ? 'border-[hsl(var(--color-accent)/0.55)] bg-[linear-gradient(145deg,hsl(var(--color-accent)/0.2),hsl(var(--color-surface)/0.9))] shadow-[var(--shadow-hard)]'
                      : disabled
                        ? 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.55)] opacity-80'
                        : 'border-[hsl(var(--color-border))] bg-[linear-gradient(145deg,hsl(var(--color-surface)/0.86),hsl(var(--color-elevated)/0.88))] hover:border-[hsl(var(--color-accent)/0.32)] hover:bg-[linear-gradient(145deg,hsl(var(--color-elevated)/0.95),hsl(var(--color-surface)/0.92))]'
                  }`}
                >
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_left,hsl(var(--color-accent)/0.2),transparent_62%)] opacity-80" />
                  <div className="relative flex items-start justify-between gap-3">
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] text-[hsl(var(--color-accent))]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="flex flex-wrap justify-end gap-2">
                      {model.qualityBadge ? <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClass(model.qualityBadge)}`}>{model.qualityBadge}</span> : null}
                      {model.speedBadge ? <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClass(model.speedBadge)}`}>{model.speedBadge}</span> : null}
                      {model.creditBadge ? <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClass(model.creditBadge)}`}>{model.creditBadge}</span> : null}
                    </div>
                  </div>
                  <div className="relative mt-5 space-y-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xl font-semibold text-text">{model.shortLabel ?? model.label}</p>
                        {active ? <Badge>Selected</Badge> : null}
                        {disabled ? <Badge variant="outline">Coming soon</Badge> : null}
                      </div>
                      <p className="mt-2 text-sm text-muted">{model.description}</p>
                    </div>
                    {model.resolutionLabels?.length ? (
                      <div className="rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.54)] px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Output</p>
                        <p className="mt-1 text-sm font-medium text-text">{model.resolutionLabels.join(' / ')}</p>
                      </div>
                    ) : null}
                    <p className="text-sm text-[hsl(var(--color-accent))]">{model.frontendHint}</p>
                    {disabled ? (
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <Lock className="h-4 w-4" />
                        <span>Visible in studio, backend routing is feature-gated.</span>
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
          )}

          {otherModels.length ? (
            <div className="rounded-[28px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.62)] p-4 backdrop-blur-md">
              <div className="mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                <p className="text-sm font-semibold text-text">Other available models</p>
              </div>
              <div className="max-h-[40vh] space-y-2 overflow-y-auto pr-1">
                {otherModels.map((model) => {
                  const Icon = MODEL_ICONS[model.key] ?? Info;
                  const active = model.key === selectedModel;
                  const disabled = model.enabled === false;
                  return (
                    <button
                      key={model.key}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) return;
                        onChange(model.key);
                        setOpen(false);
                      }}
                      className={`w-full rounded-[22px] border p-3 text-left transition ${
                        active
                          ? 'border-[hsl(var(--color-accent)/0.45)] bg-[hsl(var(--color-accent)/0.12)]'
                          : disabled
                            ? 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.42)] opacity-65'
                            : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.62)] hover:bg-[hsl(var(--color-elevated)/0.92)]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.72)] text-[hsl(var(--color-accent))]">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold text-text">{model.shortLabel ?? model.label}</p>
                            {model.resolutionLabels?.length ? <span className="text-xs text-muted">{model.resolutionLabels.join(' / ')}</span> : null}
                            {active ? <Badge>Selected</Badge> : null}
                            {disabled ? <Badge variant="outline">Coming soon</Badge> : null}
                          </div>
                          <p className="mt-1 text-sm text-muted">{model.frontendHint}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {model.speedBadge ? <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${toneClass(model.speedBadge)}`}>{model.speedBadge}</span> : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!allDisabled && models.some((model) => model.enabled === false && model.key !== selectedModel) ? (
            <p className="text-xs text-muted">
              Some premium or upcoming models are hidden here until backend routing is enabled, to keep the picker focused.
            </p>
          ) : null}

          <div className="flex items-center justify-between rounded-[22px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.58)] px-4 py-3 text-sm text-muted">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[hsl(var(--color-accent))]" />
              <span>Pricing is driven by the shared credit engine and final backend validation.</span>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
