'use client';

import { useEffect, useState } from 'react';
import { LoaderCircle, Save, WandSparkles } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { Dropdown } from '@/components/ui/Dropdown';
import { PacmanLoader } from '@/components/ui/PacmanLoader';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import type { UserSettings } from '@/types/api';
const aspectOptions = ['9:16', '16:9', '1:1'];

export function SettingsClient({ userId }: { userId: string }) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();

  useEffect(() => {
    let cancelled = false;
    void api.getMySettings(userId)
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load settings');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const updateField = (field: keyof UserSettings, value: string | boolean | null) => {
    setSettings((current) => (current ? { ...current, [field]: value } : current));
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateMySettings(
        {
          default_language: settings.default_language,
          default_voice: settings.default_voice,
          default_aspect_ratio: settings.default_aspect_ratio,
          email_notifications: settings.email_notifications,
          marketing_emails: settings.marketing_emails,
          auto_caption_default: settings.auto_caption_default,
          music_ducking_default: settings.music_ducking_default,
        },
        userId,
      );
      setSettings(updated);
      show({ title: 'Settings saved', message: 'Your default creative preferences were updated.', variant: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save settings';
      setError(message);
      show({ title: 'Could not save settings', message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <Card className="border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.65)] backdrop-blur-md">
        <PacmanLoader centered size="md" label="Loading settings..." />
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card
        className="space-y-3 border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.62)] backdrop-blur-md"
        style={{
          background:
            'radial-gradient(circle at top right, hsl(var(--color-accent)/0.15), transparent 45%), linear-gradient(145deg, hsl(var(--color-surface)/0.82), hsl(var(--color-elevated)/0.72))',
        }}
      >
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-text">Settings</h1>
        <p className="text-sm text-muted">Set the defaults that actually shape your create workspace today.</p>
      </Card>

      {error ? <p className="rounded-[var(--radius-md)] border border-[hsl(var(--color-danger)/0.3)] bg-[hsl(var(--color-danger)/0.08)] px-4 py-3 text-sm text-[hsl(var(--color-danger))]">{error}</p> : null}

      <Card className="space-y-5 border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.62)] backdrop-blur-md">
        <div className="flex items-center gap-2">
          <WandSparkles className="h-5 w-5 text-[hsl(var(--color-accent))]" />
          <p className="text-sm font-semibold text-text">Workspace default</p>
        </div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,280px)_1fr] md:items-start">
          <label className="block">
            <span className="mb-2 text-sm font-semibold text-text">Default aspect ratio</span>
            <Dropdown value={settings.default_aspect_ratio ?? ''} onChange={(event) => updateField('default_aspect_ratio', event.target.value || null)}>
              <option value="">Use 9:16</option>
              {aspectOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </Dropdown>
          </label>
          <div className="rounded-[var(--radius-md)] border border-border bg-[hsl(var(--color-bg))] px-4 py-3 text-sm text-muted">
            This default is applied when you open the create composer for new drafts. Recipe-specific formats can still override it when a recipe is designed for a fixed outcome.
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[hsl(var(--color-accent))] px-5 py-3 text-sm font-semibold text-[hsl(var(--color-accent-contrast))] disabled:opacity-60"
        >
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving...' : 'Save settings'}
        </button>
      </div>
    </div>
  );
}
