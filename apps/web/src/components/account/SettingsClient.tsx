'use client';

import { useEffect, useState } from 'react';
import { Bell, Captions, LoaderCircle, Save, SlidersHorizontal, Volume2, WandSparkles } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { Dropdown } from '@/components/ui/Dropdown';
import { api } from '@/lib/api';
import type { UserSettings } from '@/types/api';

const languageOptions = ['English', 'Hindi', 'Hinglish'];
const voiceOptions = ['Aarav', 'Anaya', 'Dev', 'Mira'];
const aspectOptions = ['9:16', '16:9', '1:1'];

export function SettingsClient({ userId }: { userId: string }) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
    setSuccess(null);
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
      setSuccess('Settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <Card className="flex items-center gap-3">
        <LoaderCircle className="h-5 w-5 animate-spin text-[hsl(var(--color-accent))]" />
        <p className="text-sm text-muted">Loading settings...</p>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="space-y-3">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-text">Settings</h1>
        <p className="text-sm text-muted">Set your default creative preferences and communication controls for RangManch AI.</p>
      </Card>

      {error ? <p className="rounded-[var(--radius-md)] border border-[hsl(var(--color-danger)/0.3)] bg-[hsl(var(--color-danger)/0.08)] px-4 py-3 text-sm text-[hsl(var(--color-danger))]">{error}</p> : null}
      {success ? <p className="rounded-[var(--radius-md)] border border-[hsl(var(--color-success)/0.25)] bg-[hsl(var(--color-success)/0.08)] px-4 py-3 text-sm text-[hsl(var(--color-success))]">{success}</p> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="space-y-5">
          <div className="flex items-center gap-2">
            <WandSparkles className="h-5 w-5 text-[hsl(var(--color-accent))]" />
            <p className="text-sm font-semibold text-text">Creative defaults</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 text-sm font-semibold text-text">Default language</span>
              <Dropdown value={settings.default_language ?? ''} onChange={(event) => updateField('default_language', event.target.value || null)}>
                <option value="">Use per-project</option>
                {languageOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </Dropdown>
            </label>
            <label className="block">
              <span className="mb-2 text-sm font-semibold text-text">Default voice</span>
              <Dropdown value={settings.default_voice ?? ''} onChange={(event) => updateField('default_voice', event.target.value || null)}>
                <option value="">Use per-project</option>
                {voiceOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </Dropdown>
            </label>
            <label className="block md:col-span-2">
              <span className="mb-2 text-sm font-semibold text-text">Default aspect ratio</span>
              <Dropdown value={settings.default_aspect_ratio ?? ''} onChange={(event) => updateField('default_aspect_ratio', event.target.value || null)}>
                <option value="">Use per-project</option>
                {aspectOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </Dropdown>
            </label>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="space-y-4">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-[hsl(var(--color-accent))]" />
              <p className="text-sm font-semibold text-text">Notifications</p>
            </div>
            <label className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border bg-[hsl(var(--color-bg))] px-4 py-3">
              <span>
                <span className="block text-sm font-semibold text-text">Email notifications</span>
                <span className="mt-1 block text-xs text-muted">Receive job updates and key account events.</span>
              </span>
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={settings.email_notifications} onChange={(event) => updateField('email_notifications', event.target.checked)} />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border bg-[hsl(var(--color-bg))] px-4 py-3">
              <span>
                <span className="block text-sm font-semibold text-text">Marketing emails</span>
                <span className="mt-1 block text-xs text-muted">Receive feature launches, offers, and creator tips.</span>
              </span>
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={settings.marketing_emails} onChange={(event) => updateField('marketing_emails', event.target.checked)} />
            </label>
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-[hsl(var(--color-accent))]" />
              <p className="text-sm font-semibold text-text">Render defaults</p>
            </div>
            <label className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border bg-[hsl(var(--color-bg))] px-4 py-3">
              <span className="flex items-start gap-3">
                <Captions className="mt-0.5 h-4 w-4 text-[hsl(var(--color-accent))]" />
                <span>
                  <span className="block text-sm font-semibold text-text">Enable captions by default</span>
                  <span className="mt-1 block text-xs text-muted">New video jobs start with burned-in captions enabled.</span>
                </span>
              </span>
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={settings.auto_caption_default} onChange={(event) => updateField('auto_caption_default', event.target.checked)} />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border bg-[hsl(var(--color-bg))] px-4 py-3">
              <span className="flex items-start gap-3">
                <Volume2 className="mt-0.5 h-4 w-4 text-[hsl(var(--color-accent))]" />
                <span>
                  <span className="block text-sm font-semibold text-text">Duck music under narration</span>
                  <span className="mt-1 block text-xs text-muted">Background music is reduced automatically when voiceover is present.</span>
                </span>
              </span>
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={settings.music_ducking_default} onChange={(event) => updateField('music_ducking_default', event.target.checked)} />
            </label>
          </Card>
        </div>
      </div>

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
