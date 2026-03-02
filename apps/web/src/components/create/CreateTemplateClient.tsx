'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { CreateFlowShell } from '@/components/create/CreateFlowShell';
import { useCreateDraft } from '@/components/create/useCreateDraft';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Grid } from '@/components/ui/Grid';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { api } from '@/lib/api';
import type { Template } from '@/types/api';

type Props = {
  userId: string;
};

export function CreateTemplateClient({ userId }: Props) {
  const router = useRouter();
  const { draft, update } = useCreateDraft();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [aspectRatio, setAspectRatio] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(draft.templateId);

  useEffect(() => {
    let cancelled = false;
    void api
      .listTemplates(userId, { search, category: category || undefined, aspect_ratio: aspectRatio || undefined })
      .then((data) => {
        if (!cancelled) setTemplates(data);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, search, category, aspectRatio]);

  return (
    <CreateFlowShell
      step={2}
      title="Select a template"
      subtitle="Pick a launch-ready template. You can edit script, brand assets, and music next."
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search template" />
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          <option value="business">Business</option>
          <option value="marketing">Marketing</option>
          <option value="product">Product</option>
          <option value="education">Education</option>
        </Select>
        <Select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
          <option value="">Any aspect</option>
          <option value="16:9">16:9</option>
          <option value="9:16">9:16</option>
        </Select>
      </div>

      <Grid className="mt-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => setSelectedTemplate(template.id)}
            className={`overflow-hidden rounded-[var(--radius-lg)] border text-left transition ${
              selectedTemplate === template.id
                ? 'border-[hsl(var(--color-accent))] shadow-soft'
                : 'border-[hsl(var(--color-border))]'
            }`}
          >
            <img src={template.thumbnail_url} alt={template.name} className="h-36 w-full object-cover" />
            <div className="p-3">
              <p className="font-semibold text-text">{template.name}</p>
              <p className="text-xs text-muted">{template.category} • {template.aspect_ratio}</p>
            </div>
          </button>
        ))}
      </Grid>

      <Card className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted">{selectedTemplate ? `Template selected: ${selectedTemplate}` : 'Select one template to continue.'}</p>
        <Button
          onClick={() => {
            if (!selectedTemplate) return;
            update({ creationType: 'template', templateId: selectedTemplate });
            router.push('/create/script');
          }}
          disabled={!selectedTemplate}
        >
          Continue to Script
        </Button>
      </Card>
    </CreateFlowShell>
  );
}
