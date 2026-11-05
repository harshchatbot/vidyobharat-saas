'use client';

import Link from 'next/link';
import { Bot, Send, Film, X } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import {
  COPILOT_SUGGESTIONS,
  operationDescription,
  type CopilotClientError,
  type CopilotHistoryMessage,
  type CopilotProposal,
} from './copilot';
import type { BrowserAiProgress } from '@/lib/browser-ai/webllmService';
import { AIActivityIndicator, MotionReveal, StatusTransition } from '@/components/ui/MotionPrimitives';
import { BrandLoading } from './BrandLoading';

type Props = {
  history: CopilotHistoryMessage[];
  loading: boolean;
  proposal: CopilotProposal | null;
  autoEditReady?: boolean;
  error: CopilotClientError | null;
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
  onApply: () => void;
  onAbort: () => void;
  browserProvider?: boolean;
  progress?: BrowserAiProgress | null;
};

export function CopilotPanel({ history, loading, proposal, autoEditReady = false, error, onSubmit, onCancel, onApply, onAbort, browserProvider = false, progress }: Props) {
  const [prompt, setPrompt] = useState('');
  const promptRef = useRef('');
  const submit = () => {
    const value = (promptRef.current || prompt).trim();
    if (!value || loading || proposal) return;
    promptRef.current = '';
    setPrompt('');
    onSubmit(value);
  };
  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  };

  return <aside aria-label="AI Copilot" className="rm-editor-copilot flex h-full min-h-0 flex-col bg-[#111118]">
    <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-400/15 text-amber-300"><Bot className="h-4 w-4" /></span>
        <div><h2 className="text-sm font-semibold text-white">AI Editing Copilot</h2><p className="text-xs text-slate-200">{browserProvider ? 'Local WebLLM · browser only' : 'Proposes edits. You stay in control.'}</p><p className="mt-1 text-sm leading-6 text-white">Greetings and quick guidance use built-in help. Edit proposals use the configured AI provider and strict validation.</p></div>
      </div>

      {history.length === 0 && !proposal && <MotionReveal><section className="mt-5" aria-label="Suggested prompts">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-200">Try asking · select then Propose</p>
        <div className="mt-2 grid gap-2">{COPILOT_SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" disabled={loading} onClick={() => { promptRef.current = suggestion; setPrompt(suggestion); }} className="rm-copilot-suggestion min-h-11 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs leading-5 text-white transition-colors hover:border-amber-400/30 hover:bg-amber-400/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-primary-light)/0.7)] disabled:opacity-50">{suggestion}</button>)}</div>
      </section></MotionReveal>}

      {history.length > 0 && <div className="mt-4 space-y-2" aria-label="Copilot conversation">{history.map((message, index) => <MotionReveal key={`${message.role}-${index}`} delay={index === history.length - 1 ? 0.03 : 0}><div className={`rounded-lg px-3 py-2 text-xs leading-5 ${message.role === 'user' ? 'rm-copilot-user ml-5 border border-amber-400/40 bg-[#302514] text-white' : 'rm-copilot-assistant mr-5 border border-white/20 bg-[#252531] text-white'}`}><span className="rm-copilot-role mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200">{message.role === 'user' ? 'You' : 'RangManch AI'}</span><FormattedCopilotMessage content={message.content} /></div></MotionReveal>)}</div>}

      {loading && <div className="mt-4 text-xs text-slate-300">{browserProvider ? <BrandLoading size="contextual" label={progress?.message ?? 'Getting everything ready…'} progress={progress?.progress} firstRun={!progress || progress.phase === 'checking'} /> : <AIActivityIndicator label="Creating a safe edit proposal…" />}<button type="button" onClick={onAbort} className="mt-3 min-h-10 text-xs font-semibold text-slate-300 underline">Cancel request</button></div>}

      {error && <StatusTransition tone="error" label="Copilot could not complete that request" detail={error.message} className="mt-4">{error.code === 'signed_out' && <Link href="/login?next=%2Feditor" className="mt-3 inline-flex min-h-10 items-center font-semibold text-amber-300 underline">Sign in to continue</Link>}{error.retryable && prompt.trim() && <button type="button" onClick={submit} className="mt-3 block min-h-10 font-semibold text-amber-300 underline">Retry request</button>}</StatusTransition>}

      {proposal && <MotionReveal><section className="rm-copilot-proposal mt-4 rounded-xl border border-amber-400/45 bg-[#20202b] p-3" aria-label="Proposed edits">
        <div className="flex items-start gap-2"><Film className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-white">{autoEditReady ? 'Auto Edit is ready!' : 'Proposal ready'}</h3><span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-100">Review required</span></div><p className="mt-1 text-xs leading-5 text-slate-300">{proposal.response.plan.summary}</p></div></div>
        {autoEditReady && <p role="status" className="rm-copilot-ready-note mt-3 rounded-lg border border-violet-400/25 bg-violet-500/10 px-3 py-2 text-xs font-medium leading-5 text-violet-100">Your edited preview is ready. Review the changes, then select Apply edits below to enable export.</p>}
        <ol className="mt-3 list-none space-y-1.5">{proposal.response.plan.operations.map((operation, index) => <li key={`${operation.op}-${index}`} className="rm-copilot-operation rounded-md border border-white/10 bg-[#2a2a36] px-2.5 py-2 text-xs leading-5 text-white"><span className="mr-2 font-semibold text-amber-200">{index + 1}.</span>{operationDescription(operation)}</li>)}</ol>
        {proposal.response.plan.warnings.length > 0 && <div className="rm-copilot-review-notes mt-3 space-y-2 border-t border-white/20 pt-3" aria-label="Auto Edit review notes">{proposal.response.plan.warnings.map((warning, index) => <p key={index} className="rm-copilot-warning rounded-md border border-white/10 bg-[#24242d] px-3 py-2 text-xs font-medium leading-5 text-white"><span className="mr-2 font-bold text-amber-300" aria-hidden="true">•</span>{warning}</p>)}</div>}
        <p className="mt-3 text-xs text-slate-300">{proposal.response.usage.inputTokens + proposal.response.usage.outputTokens} tokens · estimated ${proposal.response.usage.estimatedCostUsd.toFixed(4)}</p>
      </section></MotionReveal>}
    </div>

    <div className="shrink-0 border-t border-white/10 p-3">
      {proposal ? <div className="grid grid-cols-2 gap-2"><button type="button" onClick={onCancel} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/15 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-primary-light)/0.7)]"><X className="h-4 w-4" />Cancel</button><button type="button" onClick={onApply} className={`min-h-11 rounded-lg bg-amber-400 px-3 text-xs font-bold text-slate-950 transition-transform hover:bg-amber-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-primary-light)/0.7)] ${autoEditReady ? 'ring-2 ring-amber-200 ring-offset-2 ring-offset-[#111118] shadow-[0_0_22px_rgba(251,191,36,0.4)] animate-pulse' : ''}`}>Apply edits</button></div> : <><label htmlFor="copilot-prompt" className="sr-only">Ask AI Copilot to edit the project</label><textarea id="copilot-prompt" value={prompt} maxLength={2000} rows={3} disabled={loading} onChange={(event) => { promptRef.current = event.target.value; setPrompt(event.target.value); }} onKeyDown={onComposerKeyDown} placeholder="Describe the edit you want…" className="w-full resize-none rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-400 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/10 disabled:opacity-60" /><div className="mt-2 flex items-center justify-between"><span className="text-[10px] tabular-nums text-slate-600">{prompt.length}/2000 · ⌘/Ctrl Enter</span><button type="button" disabled={!prompt.trim() || loading} onClick={submit} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-400 px-3 text-xs font-bold text-slate-950 transition-transform hover:bg-amber-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-primary-light)/0.7)] disabled:opacity-40"><Send className="h-3.5 w-3.5" />Propose</button></div></>}
    </div>
  </aside>;
}

// Safe text-only formatting (no HTML or external Markdown runtime).
function formatInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
      : part
  );
}

export function FormattedCopilotMessage({ content }: { content: string }) {
  const normalized = content.replace(/\s+(?=\d{1,2}[.)]\s)/g, '\n').trim();
  const sections = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return <div className="space-y-2 whitespace-normal break-words">
    {sections.map((line, i) => {
      const match = line.match(/^(\d{1,2})[.)]\s+(.+)$/);
      return match
        ? <div key={i} className="flex gap-2"><span className="shrink-0 font-bold text-violet-200">{match[1]}.</span><span>{formatInline(match[2])}</span></div>
        : <p key={i} className="leading-5">{formatInline(line.replace(/^[-*]\s+/, '• '))}</p>;
    })}
  </div>;
}
