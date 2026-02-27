'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dropdown } from '@/components/ui/Dropdown';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { Project, Render } from '@/types/api';

type Props = {
  project: Project;
  initialRenders: Render[];
  userId: string;
};

export function EditorClient({ project, initialRenders, userId }: Props) {
  const [script, setScript] = useState(project.script);
  const [language, setLanguage] = useState(project.language);
  const [voice, setVoice] = useState(project.voice);
  const [template, setTemplate] = useState(project.template);
  const [renders, setRenders] = useState<Render[]>(initialRenders);
  const [render, setRender] = useState<Render | null>(initialRenders[0] ?? null);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveFingerprint = useRef(`${project.script}|${project.language}|${project.voice}|${project.template}`);
  const { show } = useToast();

  const shouldPoll = useMemo(
    () => Boolean(render && (render.status === 'pending' || render.status === 'rendering')),
    [render],
  );

  useEffect(() => {
    if (!shouldPoll || !render) return;

    const id = window.setInterval(async () => {
      const latest = await api.getRender(render.id, userId);
      setRender(latest);
      setRenders((prev) => prev.map((item) => (item.id === latest.id ? latest : item)));
      if (latest.status === 'completed') {
        show('Render completed');
      }
    }, 2000);

    return () => window.clearInterval(id);
  }, [shouldPoll, render, userId, show]);

  useEffect(() => {
    const fingerprint = `${script}|${language}|${voice}|${template}`;
    if (fingerprint === saveFingerprint.current) return;

    const timer = window.setTimeout(async () => {
      try {
        setSaveState('saving');
        await api.updateProject(
          project.id,
          { script, language, voice, template },
          userId,
        );
        saveFingerprint.current = fingerprint;
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [language, project.id, script, template, userId, voice]);

  const generate = async () => {
    setLoading(true);
    try {
      const created = await api.createRender({
        project_id: project.id,
        user_id: userId,
        include_broll: true,
      }, userId);
      setRender(created);
      setRenders((prev) => [created, ...prev]);
      show('Render started');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Script</h2>
          <span className="text-xs text-muted">
            {saveState === 'saving' && 'Saving...'}
            {saveState === 'saved' && 'Saved'}
            {saveState === 'error' && 'Save failed'}
          </span>
        </div>
        <Textarea rows={14} value={script} onChange={(e) => setScript(e.target.value)} />
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Settings</h2>
        <div className="space-y-3">
          <Dropdown value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="hi-IN">Hindi</option>
            <option value="en-IN">English (India)</option>
          </Dropdown>
          <Dropdown value={voice} onChange={(e) => setVoice(e.target.value)}>
            <option value="Aarav">Aarav</option>
            <option value="Ishita">Ishita</option>
          </Dropdown>
          <Dropdown value={template} onChange={(e) => setTemplate(e.target.value)}>
            <option value="clean-corporate">Clean Corporate</option>
            <option value="edu-modern">Edu Modern</option>
          </Dropdown>
          <Button className="w-full" onClick={generate} disabled={loading}>
            {loading ? 'Queueing...' : 'Generate'}
          </Button>
        </div>

        <div className="mt-6 space-y-2 border-t border-border pt-4">
          <p className="text-sm font-medium">Latest Render</p>
          {!render && <p className="text-sm text-muted">No render yet.</p>}
          {render && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{render.status}</Badge>
                <span className="text-sm text-muted">{render.progress}%</span>
                {shouldPoll && <Spinner />}
              </div>
              {render.video_url && (
                <a className="break-all text-sm font-semibold text-accent" href={`${API_URL}${render.video_url}`} target="_blank" rel="noreferrer">
                  Open Video URL
                </a>
              )}
              {render.status === 'failed' && render.error_message && (
                <p className="text-sm text-danger">{render.error_message}</p>
              )}
              {render.status === 'failed' && (
                <Button variant="secondary" onClick={generate} disabled={loading}>
                  Retry Render
                </Button>
              )}
            </>
          )}
        </div>

        <div className="mt-6 space-y-2 border-t border-border pt-4">
          <p className="text-sm font-medium">Render History</p>
          {renders.length === 0 && <p className="text-sm text-muted">No previous renders.</p>}
          {renders.slice(0, 5).map((item) => (
            <button
              key={item.id}
              className="flex w-full items-center justify-between rounded-md border border-border bg-bg px-3 py-2 text-left"
              onClick={() => setRender(item)}
            >
              <span className="text-xs text-muted">{item.id.slice(0, 8)}</span>
              <span className="text-xs font-medium">{item.status} · {item.progress}%</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
