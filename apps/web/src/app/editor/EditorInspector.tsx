'use client';

import { Trash2 } from 'lucide-react';
import { EDITOR_FONTS, EFFECT_PRESETS, type TimelineItem } from './timeline/types';

type Props = { item?: TimelineItem; onUpdate: (updates: Partial<TimelineItem>) => void; onRemove: () => void; className?: string };
const field = 'mt-1 min-h-10 w-full rounded-md border border-[#d9d7ce] bg-white px-3 text-sm focus:border-[#c88b00] focus:outline-none focus:ring-2 focus:ring-[#f4c30f]/30';

export function EditorInspector({ item, onUpdate, onRemove, className = '' }: Props) {
  if (!item) return <aside className={`${className} rounded-lg border border-[#d9d7ce] bg-white p-4`}><h2 className="font-semibold">Inspector</h2><p className="mt-3 text-sm leading-6 text-[#526078]">Select a clip, text, effect, or audio item to edit it.</p></aside>;
  return (
    <aside className={`${className} rounded-lg border border-[#d9d7ce] bg-white p-4`}>
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#9a6f00]">{item.kind}</p><h2 className="mt-1 truncate font-semibold">{item.label}</h2></div><button type="button" onClick={onRemove} aria-label={`Remove ${item.label}`} className="grid h-10 w-10 place-items-center rounded-md text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div>
      {item.kind === 'text' && <div className="mt-5 space-y-4">
        <label className="block text-sm font-medium">Text<textarea value={item.text} onChange={(event) => onUpdate({ text: event.target.value, label: event.target.value || 'Text' })} rows={3} className={`${field} py-2`} /></label>
        <label className="block text-sm font-medium">Font<select value={item.fontFamily} onChange={(event) => onUpdate({ fontFamily: event.target.value })} className={field}>{EDITOR_FONTS.map((font) => <option key={font}>{font}</option>)}</select></label>
        <label className="block text-sm font-medium">Size <span className="text-[#526078]">{item.fontSize}px</span><input type="range" min="12" max="120" value={item.fontSize} onChange={(event) => onUpdate({ fontSize: Number(event.target.value) })} className="mt-2 w-full accent-[#c88b00]" /></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Color<input type="color" value={item.color} onChange={(event) => onUpdate({ color: event.target.value })} className="mt-1 h-10 w-full rounded border border-[#d9d7ce] p-1" /></label><label className="flex items-end gap-2 pb-2 text-sm font-medium"><input type="checkbox" checked={item.bold} onChange={(event) => onUpdate({ bold: event.target.checked })} /> Bold</label></div>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Horizontal<input type="number" min="0.02" max="0.98" step="0.01" value={item.x} onChange={(event) => onUpdate({ x: Number(event.target.value) })} className={field} /></label><label className="text-sm font-medium">Vertical<input type="number" min="0.02" max="0.98" step="0.01" value={item.y} onChange={(event) => onUpdate({ y: Number(event.target.value) })} className={field} /></label></div>
        <label className="block text-sm font-medium">Text box width <span className="text-[#526078]">{Math.round(item.width * 100)}%</span><input type="range" min="0.1" max="0.96" step="0.01" value={item.width} onChange={(event) => onUpdate({ width: Number(event.target.value) })} className="mt-2 w-full accent-[#c88b00]" /></label>
        <label className="block text-sm font-medium">Rotation <span className="text-[#526078]">{item.rotation.toFixed(0)}°</span><input type="range" min="-180" max="180" step="1" value={item.rotation} onChange={(event) => onUpdate({ rotation: Number(event.target.value) })} className="mt-2 w-full accent-[#c88b00]" /></label>
        <fieldset><legend className="text-sm font-medium">Alignment</legend><div className="mt-2 grid grid-cols-3 gap-1 rounded-md bg-[#f1efe7] p-1">{(['left', 'center', 'right'] as const).map((alignment) => <button key={alignment} type="button" onClick={() => onUpdate({ alignment })} className={`min-h-9 rounded text-xs font-semibold capitalize ${item.alignment === alignment ? 'bg-white text-[#071d4a] shadow-sm' : 'text-[#526078]'}`}>{alignment}</button>)}</div></fieldset>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Outline<input type="color" value={item.outlineColor} onChange={(event) => onUpdate({ outlineColor: event.target.value })} className="mt-1 h-10 w-full rounded border border-[#d9d7ce] p-1" /></label><label className="text-sm font-medium">Width<input type="number" min="0" max="12" step="1" value={item.outlineWidth} onChange={(event) => onUpdate({ outlineWidth: Number(event.target.value) })} className={field} /></label></div>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={item.shadow} onChange={(event) => onUpdate({ shadow: event.target.checked })} /> Shadow</label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Background<input type="color" value={item.backgroundColor} onChange={(event) => onUpdate({ backgroundColor: event.target.value })} className="mt-1 h-10 w-full rounded border border-[#d9d7ce] p-1" /></label><label className="text-sm font-medium">Opacity<input type="range" min="0" max="1" step="0.05" value={item.backgroundOpacity} onChange={(event) => onUpdate({ backgroundOpacity: Number(event.target.value) })} className="mt-3 w-full accent-[#c88b00]" /></label></div>
      </div>}
      {item.kind === 'effect' && <div className="mt-5 space-y-4">
        <label className="block text-sm font-medium">Preset<select value={item.preset} onChange={(event) => onUpdate({ preset: event.target.value as typeof item.preset, label: event.target.value })} className={field}>{EFFECT_PRESETS.map((effect) => <option key={effect} value={effect}>{effect.replace('-', ' ')}</option>)}</select></label>
        {!item.preset.startsWith('fade') && <label className="block text-sm font-medium">Amount <span className="text-[#526078]">{item.amount.toFixed(1)}</span><input type="range" min="0" max="2" step="0.1" value={item.amount} onChange={(event) => onUpdate({ amount: Number(event.target.value) })} className="mt-2 w-full accent-[#c88b00]" /></label>}
        <p className="text-xs leading-5 text-[#526078]">The export uses the same effect values. Browser and FFmpeg rendering can differ slightly.</p>
      </div>}
      {(item.kind === 'audio' || item.kind === 'video') && <div className="mt-5 space-y-4">
        <label className="block text-sm font-medium">Volume <span className="text-[#526078]">{Math.round(item.volume * 100)}%</span><input type="range" min="0" max="1" step="0.05" value={item.volume} onChange={(event) => onUpdate({ volume: Number(event.target.value) })} className="mt-2 w-full accent-[#c88b00]" /></label>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={item.muted} onChange={(event) => onUpdate({ muted: event.target.checked })} /> Mute</label>
        {item.kind === 'video' && <label className="block text-sm font-medium">Fit<select value={item.cropMode} onChange={(event) => onUpdate({ cropMode: event.target.value as 'cover' | 'contain' })} className={field}><option value="cover">Fill frame</option><option value="contain">Fit inside</option></select></label>}
      </div>}
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[#e5e2d8] pt-4"><label className="text-sm font-medium">Start<input type="number" min="0" max="60" step="0.1" value={item.startTime} disabled={item.kind === 'video'} onChange={(event) => onUpdate({ startTime: Number(event.target.value) })} className={field} /></label><label className="text-sm font-medium">Duration<input type="number" min="0.25" max="60" step="0.1" value={item.duration} onChange={(event) => onUpdate({ duration: Number(event.target.value) })} className={field} /></label></div>
    </aside>
  );
}
