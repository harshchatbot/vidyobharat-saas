'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Upload } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import type { Template, TemplateInputField } from '@/types/api';

const emptyTemplate = (): Template => ({
  id: '',
  type: 'video',
  category: 'education',
  subcategory: '',
  name: '',
  slug: '',
  description: '',
  short_description: '',
  thumbnail_url: '',
  preview_image_url: '',
  preview_video_url: '',
  visual_prompt: '',
  aspect_ratio: '9:16',
  inputs: [],
  script_hint: '',
  topic_hint: '',
  prompt_template: '',
  active: true,
  trending: false,
  featured: false,
  order: 0,
  generation_defaults: { model_key: '', aspect_ratio: '9:16', resolution: '', voice: '', language: '', duration_seconds: 8, quality: 'standard' },
});

function normalizeTemplateInput(field: TemplateInputField): TemplateInputField {
  return { ...field, options: field.options || [] };
}

export function AdminTemplatesClient({ userId }: { userId: string }) {
  const { show } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function loadTemplates() {
    setLoading(true);
    try {
      const data = await api.listUnifiedTemplates(userId, { active: undefined, search: search || undefined });
      setTemplates(data);
    } catch (err) {
      show(err instanceof Error ? err.message : 'Failed to load templates.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTemplates();
  }, [search]);

  const visible = useMemo(() => templates, [templates]);

  function updateField<K extends keyof Template>(key: K, value: Template[K]) {
    setEditing((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateInput(index: number, patch: Partial<TemplateInputField>) {
    setEditing((current) => {
      if (!current) return current;
      const nextInputs = [...(current.inputs || [])];
      nextInputs[index] = { ...normalizeTemplateInput(nextInputs[index]), ...patch };
      return { ...current, inputs: nextInputs };
    });
  }

  async function saveTemplate() {
    if (!editing) return;
    setSaving(true);
    try {
      const payload: Template = {
        ...editing,
        id: editing.id || editing.slug || '',
        inputs: (editing.inputs || []).map((field) => ({ ...field, options: field.options || [] })),
      };
      const result = editing.id ? await api.updateAdminTemplate(editing.id, payload, userId) : await api.createAdminTemplate(payload, userId);
      show('Template saved.');
      setEditing(result);
      await loadTemplates();
    } catch (err) {
      show(err instanceof Error ? err.message : 'Failed to save template.');
    } finally {
      setSaving(false);
    }
  }

  async function uploadPreview(file: File) {
    setUploading(true);
    try {
      const result = await api.uploadTemplatePreview(file, userId);
      setEditing((current) => (current ? { ...current, thumbnail_url: result.url, preview_image_url: result.url } : current));
      show('Preview uploaded.');
    } catch (err) {
      show(err instanceof Error ? err.message : 'Failed to upload preview.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="rangmanch-section-eyebrow">Admin</p>
          <h1 className="rangmanch-section-title">Manage templates</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates" className="sm:w-72" />
          <Button onClick={() => setEditing(emptyTemplate())}><Plus className="mr-2 h-4 w-4" />New template</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {loading ? <div className="text-sm text-muted">Loading templates...</div> : null}
        {visible.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => setEditing({ ...template, inputs: (template.inputs || []).map(normalizeTemplateInput) })}
            className="overflow-hidden rounded-[24px] border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-surface)/0.42)] text-left shadow-[var(--shadow-soft)] transition hover:border-[hsl(var(--color-accent)/0.35)]"
          >
            <img src={template.thumbnail_url} alt={template.name} className="aspect-[4/3] w-full object-cover" />
            <div className="space-y-2 p-4">
              <div className="flex flex-wrap gap-2 text-xs text-muted">
                <span>{template.type}</span>
                <span>{template.category}</span>
                <span>{template.active ? 'Active' : 'Inactive'}</span>
              </div>
              <p className="text-lg font-semibold text-text">{template.name}</p>
              <p className="line-clamp-2 text-sm text-muted">{template.short_description || template.description}</p>
            </div>
          </button>
        ))}
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)}>
        {editing ? (
          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-4">
              <img src={editing.preview_image_url || editing.thumbnail_url || 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&q=80'} alt={editing.name || 'Preview'} className="aspect-[4/5] w-full rounded-[24px] object-cover" />
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.52)] px-4 py-2 text-sm text-text">
                <Upload className="h-4 w-4" />
                {uploading ? 'Uploading...' : 'Upload preview'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadPreview(file);
                }} />
              </label>
            </div>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input value={editing.name || ''} onChange={(e) => updateField('name', e.target.value)} placeholder="Name" />
                <Input value={editing.slug || ''} onChange={(e) => updateField('slug', e.target.value)} placeholder="slug" />
                <Dropdown value={editing.type || 'video'} onChange={(e) => updateField('type', e.target.value as 'video' | 'image')}>
                  <option value="video">Video</option>
                  <option value="image">Image</option>
                </Dropdown>
                <Input value={editing.category || ''} onChange={(e) => updateField('category', e.target.value)} placeholder="Category" />
                <Input value={editing.subcategory || ''} onChange={(e) => updateField('subcategory', e.target.value)} placeholder="Subcategory" />
                <Dropdown value={editing.aspect_ratio || '9:16'} onChange={(e) => updateField('aspect_ratio', e.target.value)}>
                  <option value="9:16">9:16</option>
                  <option value="16:9">16:9</option>
                  <option value="4:5">4:5</option>
                  <option value="1:1">1:1</option>
                </Dropdown>
              </div>
              <Textarea value={editing.description || ''} onChange={(e) => updateField('description', e.target.value)} placeholder="Description" />
              <Input value={editing.short_description || ''} onChange={(e) => updateField('short_description', e.target.value)} placeholder="Short description" />
              <Textarea value={editing.prompt_template || ''} onChange={(e) => updateField('prompt_template', e.target.value)} placeholder="Prompt template with {placeholders}" />
              <Input value={editing.script_hint || ''} onChange={(e) => updateField('script_hint', e.target.value)} placeholder="Script hint" />
              <Input value={editing.topic_hint || ''} onChange={(e) => updateField('topic_hint', e.target.value)} placeholder="Topic hint" />
              <Textarea value={editing.visual_prompt || ''} onChange={(e) => updateField('visual_prompt', e.target.value)} placeholder="Visual prompt" />
              <div className="rounded-[20px] border border-[hsl(var(--color-border))] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-medium text-text">Template inputs</p>
                  <Button variant="secondary" onClick={() => updateField('inputs', [...(editing.inputs || []), { key: '', label: '', type: 'text', required: true, placeholder: '', options: [] }])}>Add input</Button>
                </div>
                <div className="space-y-3">
                  {(editing.inputs || []).map((field, index) => (
                    <div key={`${field.key}-${index}`} className="grid gap-2 rounded-[18px] border border-[hsl(var(--color-border))] p-3 sm:grid-cols-2">
                      <Input value={field.key} onChange={(e) => updateInput(index, { key: e.target.value })} placeholder="key" />
                      <Input value={field.label} onChange={(e) => updateInput(index, { label: e.target.value })} placeholder="Label" />
                      <Dropdown value={field.type} onChange={(e) => updateInput(index, { type: e.target.value as TemplateInputField['type'] })}>
                        <option value="text">Text</option>
                        <option value="textarea">Textarea</option>
                        <option value="select">Select</option>
                        <option value="number">Number</option>
                      </Dropdown>
                      <Input value={field.placeholder || ''} onChange={(e) => updateInput(index, { placeholder: e.target.value })} placeholder="Placeholder" />
                      <Input value={(field.options || []).map((item) => typeof item === 'string' ? item : item.value).join(', ')} onChange={(e) => updateInput(index, { options: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="Select options CSV" className="sm:col-span-2" />
                      <label className="inline-flex items-center gap-2 text-sm text-muted sm:col-span-2">
                        <input type="checkbox" checked={field.required} onChange={(e) => updateInput(index, { required: e.target.checked })} />
                        Required
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[20px] border border-[hsl(var(--color-border))] p-4">
                <p className="mb-3 font-medium text-text">Generation defaults</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input value={editing.generation_defaults?.model_key || ''} onChange={(e) => updateField('generation_defaults', { ...(editing.generation_defaults || {}), model_key: e.target.value })} placeholder="model key" />
                  <Input value={editing.generation_defaults?.resolution || ''} onChange={(e) => updateField('generation_defaults', { ...(editing.generation_defaults || {}), resolution: e.target.value })} placeholder="resolution" />
                  <Input value={editing.generation_defaults?.voice || ''} onChange={(e) => updateField('generation_defaults', { ...(editing.generation_defaults || {}), voice: e.target.value })} placeholder="voice" />
                  <Input value={editing.generation_defaults?.language || ''} onChange={(e) => updateField('generation_defaults', { ...(editing.generation_defaults || {}), language: e.target.value })} placeholder="language" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={editing.active ?? true} onChange={(e) => updateField('active', e.target.checked)} />Active</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={editing.trending ?? false} onChange={(e) => updateField('trending', e.target.checked)} />Trending</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={editing.featured ?? false} onChange={(e) => updateField('featured', e.target.checked)} />Featured</label>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => void saveTemplate()} disabled={saving}>{saving ? 'Saving...' : 'Save template'}</Button>
                {editing.id ? (
                  <Button variant="secondary" onClick={() => void api.deleteAdminTemplate(editing.id!, userId).then(() => { show('Template archived.'); setEditing(null); void loadTemplates(); }).catch((err) => show(err instanceof Error ? err.message : 'Failed to archive template.'))}>Archive</Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
