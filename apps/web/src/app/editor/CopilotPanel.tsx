'use client';

import Link from 'next/link';
import { AlertTriangle, Bot, LoaderCircle, Send, Sparkles, X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

import {
  COPILOT_SUGGESTIONS,
  operationDescription,
  type CopilotClientError,
  type CopilotHistoryMessage,
  type CopilotProposal,
} from './copilot';

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
};

export function CopilotPanel({ history, loading, proposal, error, onSubmit, onCancel, onApply, onAbort, browserProvider = false }: Props) {
  const [prompt, setPrompt] = useState('');
  const submit = () => {
    const value = prompt.trim();
    if (!value || loading || proposal) return;
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
        <div><h2 className="text-sm font-semibold text-white">AI Editing Copilot</h2><p className="text-[11px] text-slate-500">{browserProvider ? 'Local WebLLM · browser only' : 'Proposes edits. You stay in control.'}</p></div>
      </div>

      {history.length === 0 && !proposal && <section className="mt-5" aria-label="Suggested prompts">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Try asking</p>
        <div className="mt-2 grid gap-2">{COPILOT_SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" disabled={loading} onClick={() => setPrompt(suggestion)} className="min-h-11 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs leading-5 text-slate-300 hover:border-amber-400/30 hover:bg-amber-400/5 disabled:opacity-50">{suggestion}</button>)}</div>
      </section>}

      {history.length > 0 && <div className="mt-4 space-y-2" aria-label="Copilot conversation">{history.map((message, index) => <div key={`${message.role}-${index}`} className={`rounded-lg px-3 py-2 text-xs leading-5 ${message.role === 'user' ? 'ml-5 bg-amber-400/10 text-amber-100' : 'mr-5 bg-white/5 text-slate-300'}`}>{message.content}</div>)}</div>}

      {loading && <div role="status" aria-live="polite" className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300"><span className="flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin text-amber-300" />Creating a safe edit proposal…</span><button type="button" onClick={onAbort} className="mt-3 min-h-10 text-xs font-semibold text-slate-300 underline">Cancel request</button></div>}

      {error && <div role="alert" className="mt-4 rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-xs leading-5 text-red-100"><span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error.message}</span>{error.code === 'signed_out' && <Link href="/login?next=%2Feditor" className="mt-3 inline-flex min-h-10 items-center font-semibold text-amber-300 underline">Sign in to continue</Link>}{error.retryable && prompt.trim() && <button type="button" onClick={submit} className="mt-3 block min-h-10 font-semibold text-amber-300 underline">Retry request</button>}</div>}

      {proposal && <section className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3" aria-label="Proposed edits">
        <div className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div><h3 className="text-sm font-semibold text-white">Previewing proposal</h3><p className="mt-1 text-xs leading-5 text-slate-300">{proposal.response.plan.summary}</p></div></div>
        <ol className="mt-3 space-y-1.5">{proposal.response.plan.operations.map((operation, index) => <li key={`${operation.op}-${index}`} className="rounded-md bg-black/20 px-2.5 py-2 text-[11px] leading-4 text-slate-300"><span className="mr-2 text-slate-500">{index + 1}.</span>{operationDescription(operation)}</li>)}</ol>
        {proposal.response.plan.warnings.length > 0 && <div className="mt-3 border-t border-white/10 pt-3 text-[11px] leading-4 text-amber-200">{proposal.response.plan.warnings.map((warning) => <p key={warning}>• {warning}</p>)}</div>}
        <p className="mt-3 text-[10px] text-slate-500">{proposal.response.usage.inputTokens + proposal.response.usage.outputTokens} tokens · estimated ${proposal.response.usage.estimatedCostUsd.toFixed(4)}</p>
      </section>}
    </div>

    <div className="shrink-0 border-t border-white/10 p-3">
      {proposal ? <div className="grid grid-cols-2 gap-2"><button type="button" onClick={onCancel} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/15 text-xs font-semibold text-slate-200"><X className="h-4 w-4" />Cancel</button><button type="button" onClick={onApply} className="min-h-11 rounded-lg bg-amber-400 px-3 text-xs font-bold text-slate-950 hover:bg-amber-300">Apply edits</button></div> : <><label htmlFor="copilot-prompt" className="sr-only">Ask AI Copilot to edit the project</label><textarea id="copilot-prompt" value={prompt} maxLength={2000} rows={3} disabled={loading} onChange={(event) => setPrompt(event.target.value)} onKeyDown={onComposerKeyDown} placeholder="Describe the edit you want…" className="w-full resize-none rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/10 disabled:opacity-60" /><div className="mt-2 flex items-center justify-between"><span className="text-[10px] tabular-nums text-slate-600">{prompt.length}/2000 · ⌘/Ctrl Enter</span><button type="button" disabled={!prompt.trim() || loading} onClick={submit} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-400 px-3 text-xs font-bold text-slate-950 disabled:opacity-40"><Send className="h-3.5 w-3.5" />Propose</button></div></>}
    </div>
  </aside>;
}
