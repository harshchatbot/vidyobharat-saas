'use client';

import Link from 'next/link';
import { Bot, Send, Sparkles, X } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';

import {
  COPILOT_SUGGESTIONS,
  operationDescription,
  type CopilotClientError,
  type CopilotHistoryMessage,
  type CopilotProposal,
} from './copilot';
import type { BrowserAiProgress } from '@/lib/browser-ai/webllmService';
import { AIActivityIndicator, MotionReveal, StatusTransition } from '@/components/ui/MotionPrimitives';

type Props = {
  history: CopilotHistoryMessage[];
  loading: boolean;
  proposal: CopilotProposal | null;
  error: CopilotClientError | null;
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
  onApply: () => void;
  onAbort: () => void;
  browserProvider?: boolean;
  progress?: BrowserAiProgress | null;
};

export function CopilotPanel({ history, loading, proposal, error, onSubmit, onCancel, onApply, onAbort, browserProvider = false, progress }: Props) {
  const [prompt, setPrompt] = useState('');
  const promptRef = useRef('');
  const submit = () => {
    const value = promptRef.current.trim();
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

  return <aside aria-label="AI Copilot" className="flex h-full min-h-0 flex-col bg-[#111118]">
    <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-400/15 text-amber-300"><Bot className="h-4 w-4" /></span>
        <div><h2 className="text-sm font-semibold text-white">AI Editing Copilot</h2><p className="text-[11px] text-slate-500">{browserProvider ? 'Local WebLLM · browser only' : 'Proposes edits. You stay in control.'}</p><p className="mt-1 text-[10px] text-slate-600">Greetings and quick guidance use built-in help. Edit proposals use the configured AI provider and strict validation.</p></div>
      </div>

      {history.length === 0 && !proposal && <MotionReveal><section className="mt-5" aria-label="Suggested prompts">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Try asking</p>
        <div className="mt-2 grid gap-2">{COPILOT_SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" disabled={loading} onClick={() => setPrompt(suggestion)} className="min-h-11 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs leading-5 text-slate-300 transition-colors hover:border-amber-400/30 hover:bg-amber-400/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-primary-light)/0.7)] disabled:opacity-50">{suggestion}</button>)}</div>
      </section></MotionReveal>}

      {history.length > 0 && <div className="mt-4 space-y-2" aria-label="Copilot conversation">{history.map((message, index) => <MotionReveal key={`${message.role}-${index}`} delay={index === history.length - 1 ? 0.03 : 0}><div className={`rounded-lg px-3 py-2 text-xs leading-5 ${message.role === 'user' ? 'ml-5 border border-amber-400/10 bg-amber-400/10 text-amber-100' : 'mr-5 border border-white/5 bg-white/5 text-slate-300'}`}><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{message.role === 'user' ? 'You' : 'RangManch AI'}</span>{message.content}</div></MotionReveal>)}</div>}

      {loading && <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300"><AIActivityIndicator label={progress?.message ?? (browserProvider ? 'Preparing your AI Copilot…' : 'Creating a safe edit proposal…')} />{browserProvider && !progress && <p className="mt-2 text-[11px] leading-4 text-slate-500">The first request may take longer while the local model is prepared.</p>}{typeof progress?.progress === 'number' && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-amber-400 transition-[width]" style={{ width: `${Math.max(0, Math.min(100, progress.progress))}%` }} /></div>}<button type="button" onClick={onAbort} className="mt-3 min-h-10 text-xs font-semibold text-slate-300 underline">Cancel request</button></div>}

      {error && <StatusTransition tone="error" label="Copilot could not complete that request" detail={error.message} className="mt-4">{error.code === 'signed_out' && <Link href="/login?next=%2Feditor" className="mt-3 inline-flex min-h-10 items-center font-semibold text-amber-300 underline">Sign in to continue</Link>}{error.retryable && prompt.trim() && <button type="button" onClick={submit} className="mt-3 block min-h-10 font-semibold text-amber-300 underline">Retry request</button>}</StatusTransition>}

      {proposal && <MotionReveal><section className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3" aria-label="Proposed edits">
        <div className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-white">Proposal ready</h3><span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">Review required</span></div><p className="mt-1 text-xs leading-5 text-slate-300">{proposal.response.plan.summary}</p></div></div>
        <ol className="mt-3 space-y-1.5">{proposal.response.plan.operations.map((operation, index) => <li key={`${operation.op}-${index}`} className="rounded-md bg-black/20 px-2.5 py-2 text-[11px] leading-4 text-slate-300"><span className="mr-2 text-slate-500">{index + 1}.</span>{operationDescription(operation)}</li>)}</ol>
        {proposal.response.plan.warnings.length > 0 && <div className="mt-3 border-t border-white/10 pt-3 text-[11px] leading-4 text-amber-200">{proposal.response.plan.warnings.map((warning) => <p key={warning}>• {warning}</p>)}</div>}
        <p className="mt-3 text-[10px] text-slate-500">{proposal.response.usage.inputTokens + proposal.response.usage.outputTokens} tokens · estimated ${proposal.response.usage.estimatedCostUsd.toFixed(4)}</p>
      </section></MotionReveal>}
    </div>

    <div className="shrink-0 border-t border-white/10 p-3">
      {proposal ? <div className="grid grid-cols-2 gap-2"><button type="button" onClick={onCancel} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/15 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-primary-light)/0.7)]"><X className="h-4 w-4" />Cancel</button><button type="button" onClick={onApply} className="min-h-11 rounded-lg bg-amber-400 px-3 text-xs font-bold text-slate-950 transition-transform hover:bg-amber-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-primary-light)/0.7)]">Apply edits</button></div> : <><label htmlFor="copilot-prompt" className="sr-only">Ask AI Copilot to edit the project</label><textarea id="copilot-prompt" value={prompt} maxLength={2000} rows={3} disabled={loading} onChange={(event) => { promptRef.current = event.target.value; setPrompt(event.target.value); }} onKeyDown={onComposerKeyDown} placeholder="Describe the edit you want…" className="w-full resize-none rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/10 disabled:opacity-60" /><div className="mt-2 flex items-center justify-between"><span className="text-[10px] tabular-nums text-slate-600">{prompt.length}/2000 · ⌘/Ctrl Enter</span><button type="button" disabled={!prompt.trim() || loading} onClick={submit} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-400 px-3 text-xs font-bold text-slate-950 transition-transform hover:bg-amber-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--color-primary-light)/0.7)] disabled:opacity-40"><Send className="h-3.5 w-3.5" />Propose</button></div></>}
    </div>
  </aside>;
}
