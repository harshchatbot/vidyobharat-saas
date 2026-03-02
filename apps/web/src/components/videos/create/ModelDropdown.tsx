import { Info } from 'lucide-react';

import { Dropdown } from '@/components/ui/Dropdown';

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
  const selected = models.find((model) => model.key === selectedModel) ?? models[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 2xl:grid-cols-2">
        {models.map((model) => {
          const Icon = MODEL_ICONS[model.key] ?? Info;
          const active = model.key === selectedModel;
          return (
            <button
              key={model.key}
              type="button"
              onClick={() => onChange(model.key)}
              title={model.frontendHint}
              className={`rounded-[var(--radius-lg)] border p-4 text-left transition ${
                active
                  ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)] shadow-soft'
                  : 'border-border bg-bg hover:bg-elevated'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-heading text-lg font-extrabold tracking-tight text-text">{model.label}</p>
                  <p className="mt-1 text-sm text-muted">{model.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="block">
          <span className="mb-1 flex items-center gap-2 text-sm font-semibold text-text">
            Model
            <span title="Choose based on output style and realism, not only provider name.">
              <Info className="h-4 w-4 text-muted" />
            </span>
          </span>
          <Dropdown value={selectedModel} onChange={(event) => onChange(event.target.value)}>
            {models.map((model) => (
              <option key={model.key} value={model.key}>
                {model.label}
              </option>
            ))}
          </Dropdown>
        </label>
        <div className="rounded-[var(--radius-md)] border border-border bg-bg px-4 py-3 text-sm text-muted">
          <span className="font-semibold text-text">Why this model:</span> {selected?.frontendHint}
        </div>
      </div>
    </div>
  );
}
