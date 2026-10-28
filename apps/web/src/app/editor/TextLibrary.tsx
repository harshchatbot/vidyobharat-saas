'use client';

import { Check, Plus, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { applyTextTemplate, createBasicText, TEXT_TEMPLATES } from './timeline/textTemplates';
import type { TextInAnimation, TextLoopAnimation, TextOutAnimation, TextTimelineItem } from './timeline/types';

type Section = 'basic' | 'templates' | 'animations';
type Props = {
  selectedText?: TextTimelineItem;
  startTime: number;
  onPreview: (item?: TextTimelineItem) => void;
  onApply: (item: TextTimelineItem, targetId?: string) => void;
  onCancel: () => void;
};

const inAnimations: Array<{ id: TextInAnimation; label: string }> = [{ id: 'none', label: 'None' }, { id: 'fade-in', label: 'Fade In' }, { id: 'slide-up', label: 'Slide Up' }, { id: 'pop-in', label: 'Pop In' }];
const outAnimations: Array<{ id: TextOutAnimation; label: string }> = [{ id: 'none', label: 'None' }, { id: 'fade-out', label: 'Fade Out' }, { id: 'slide-down', label: 'Slide Down' }];
const loopAnimations: Array<{ id: TextLoopAnimation; label: string }> = [{ id: 'none', label: 'None' }, { id: 'pulse', label: 'Pulse' }, { id: 'float', label: 'Float' }];

export function TextLibrary({ selectedText, startTime, onPreview, onApply, onCancel }: Props) {
  const base = selectedText ?? createBasicText(startTime);
  const [section, setSection] = useState<Section>('basic');
  const [draft, setDraft] = useState(base);
  const [choice, setChoice] = useState<string | null>(null);
  const dirty = choice !== null;

  function preview(next: TextTimelineItem, id: string) { setDraft(next); setChoice(id); onPreview(next); }
  function resetOriginal() { setDraft(base); setChoice('original'); onPreview(base); }
  function patchAnimation(updates: Partial<TextTimelineItem>, id: string) { preview({ ...draft, ...updates }, id); }

  return <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#111118] text-slate-100" aria-label="Text library">
    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><h2 className="text-sm font-semibold">Text</h2><p className="mt-1 text-xs text-slate-400">{selectedText ? 'Style selected text' : 'Preview before adding'}</p></div><button type="button" onClick={() => { onPreview(undefined); onCancel(); }} aria-label="Close text library" className="grid h-9 w-9 place-items-center rounded-md hover:bg-white/10"><X className="h-4 w-4" /></button></div>
    <div className="flex gap-1 overflow-x-auto border-b border-white/10 p-2" role="tablist">{(['basic', 'templates', 'animations'] as const).map((id) => <button key={id} type="button" role="tab" aria-selected={section === id} onClick={() => setSection(id)} className={`min-h-9 shrink-0 rounded-md px-3 text-xs font-semibold capitalize ${section === id ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/5'}`}>{id === 'basic' ? 'Basic Text' : id === 'templates' ? 'Text Templates' : 'Animations'}</button>)}</div>
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      {section === 'basic' && <div className="grid grid-cols-2 gap-2"><Option selected={choice === 'basic'} onClick={() => preview(createBasicText(startTime), 'basic')}><span className="text-lg font-bold">T</span><span>Basic text</span></Option><Option selected={choice === 'original'} onClick={resetOriginal}><span className="text-lg">Aa</span><span>Original</span></Option></div>}
      {section === 'templates' && <div className="grid grid-cols-2 gap-2"><Option selected={choice === 'original'} onClick={resetOriginal}><span className="text-lg">Aa</span><span>Original</span></Option>{TEXT_TEMPLATES.map((template) => <button key={template.id} type="button" onClick={() => preview(applyTextTemplate(base, template), template.id)} className={`min-w-0 rounded-md border p-2 text-left ${choice === template.id ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 hover:border-white/25'}`}><span className="grid aspect-[4/3] place-items-center overflow-hidden rounded-sm bg-black px-2 text-center" style={{ fontFamily: template.style.fontFamily, color: template.style.color, fontWeight: template.style.bold ? 700 : 400, textShadow: template.style.shadow ? '0 2px 8px rgba(0,0,0,.8)' : undefined, WebkitTextStroke: template.style.outlineWidth ? `1px ${template.style.outlineColor}` : undefined, backgroundColor: template.style.backgroundOpacity ? template.style.backgroundColor : undefined }}><span className="text-sm">{template.sample}</span></span><span className="mt-2 block truncate text-xs font-semibold">{template.name}</span></button>)}</div>}
      {section === 'animations' && <div className="space-y-4"><AnimationGroup label="In" values={inAnimations} value={draft.inAnimation} onChange={(value) => patchAnimation({ inAnimation: value as TextInAnimation }, `in-${value}`)} />{draft.inAnimation !== 'none' && <Duration label="In duration" value={draft.inAnimationDuration} onChange={(value) => patchAnimation({ inAnimationDuration: value }, `in-duration-${value}`)} />}<AnimationGroup label="Out" values={outAnimations} value={draft.outAnimation} onChange={(value) => patchAnimation({ outAnimation: value as TextOutAnimation }, `out-${value}`)} />{draft.outAnimation !== 'none' && <Duration label="Out duration" value={draft.outAnimationDuration} onChange={(value) => patchAnimation({ outAnimationDuration: value }, `out-duration-${value}`)} />}<AnimationGroup label="Loop" values={loopAnimations} value={draft.loopAnimation} onChange={(value) => patchAnimation({ loopAnimation: value as TextLoopAnimation }, `loop-${value}`)} /></div>}
    </div>
    <div className="flex shrink-0 justify-end gap-2 border-t border-white/10 p-3"><button type="button" onClick={() => { onPreview(undefined); onCancel(); }} className="min-h-10 rounded-md border border-white/15 px-4 text-xs font-semibold">Cancel</button><button type="button" disabled={!dirty} onClick={() => onApply(draft, selectedText?.id)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-amber-400 px-4 text-xs font-bold text-slate-950 disabled:opacity-40">{selectedText ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{selectedText ? 'Apply' : 'Add text'}</button></div>
  </section>;
}

function Option({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-md border text-xs font-semibold ${selected ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 hover:border-white/25'}`}>{children}</button>;
}

function AnimationGroup({ label, values, value, onChange }: { label: string; values: Array<{ id: string; label: string }>; value: string; onChange: (value: string) => void }) {
  return <fieldset><legend className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</legend><div className="mt-2 grid grid-cols-3 gap-2">{values.map((entry) => <button key={entry.id} type="button" onClick={() => onChange(entry.id)} className={`min-h-14 rounded-md border px-2 text-xs font-semibold ${value === entry.id ? 'border-amber-400 bg-amber-400/10 text-amber-200' : 'border-white/10 text-slate-300'}`}><span aria-hidden="true" className={`rm-animation-thumbnail rm-animation-${entry.id}`}>Aa</span><span className="mt-1 block">{entry.label}</span></button>)}</div></fieldset>;
}

function Duration({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="block text-xs font-semibold text-slate-300">{label} <span className="text-slate-500">{value.toFixed(1)}s</span><input type="range" min="0.1" max="2" step="0.1" value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full accent-amber-400" /></label>;
}
