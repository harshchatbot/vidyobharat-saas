import { Search } from 'lucide-react';

import { Input } from '@/components/ui/Input';

import type { TemplateOption } from './constants';

export function TemplateSelector({
  search,
  onSearchChange,
  templates,
  selectedTemplate,
  onSelect,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  templates: TemplateOption[];
  selectedTemplate: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
        <div>
          <p className="text-sm font-semibold text-text">Content direction</p>
          <p className="mt-1 text-sm text-muted">Select a starting point to shape topic hints and script assistance.</p>
        </div>
        <label className="block">
          <span className="mb-1 flex items-center gap-2 text-sm font-semibold text-text">
            <Search className="h-4 w-4 text-[hsl(var(--color-accent))]" />
            Search templates
          </span>
          <Input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search by category or use case" />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => {
          const Icon = template.icon;
          const active = selectedTemplate === template.key;
          return (
            <button
              key={template.key}
              type="button"
              onClick={() => onSelect(template.key)}
              className={`rounded-[var(--radius-lg)] border p-4 text-left transition ${
                active
                  ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)] shadow-soft'
                  : 'border-border bg-bg hover:bg-elevated'
              }`}
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]">
                <Icon className="h-5 w-5" />
              </span>
              <p className="mt-4 font-heading text-lg font-extrabold tracking-tight text-text">{template.label}</p>
              <p className="mt-1 text-sm text-muted">{template.description}</p>
              <div className="mt-4 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-xs text-muted">
                Hint: {template.topicHint}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
