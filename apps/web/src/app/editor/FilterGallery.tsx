'use client';

import { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useGuestMediaUrl } from './useGuestMediaUrl';
import { FILTER_DEFINITIONS, browserEffectStyle, type EffectSection, type FilterDefinition } from './timeline/filters';
import type { EffectTimelineItem } from './timeline/types';

type Props = {
  mediaId?: string;
  contentType?: string;
  timelineDuration: number;
  initialSection: EffectSection;
  onPreview: (effect?: EffectTimelineItem) => void;
  onApply: (effect: EffectTimelineItem) => void;
  onCancel: () => void;
};

const sections: Array<{ id: EffectSection; label: string }> = [{ id: 'filters', label: 'Color filters' }, { id: 'effects', label: 'Visual effects' }, { id: 'transitions', label: 'Transitions' }];

export function FilterGallery({ mediaId, contentType, timelineDuration, initialSection, onPreview, onApply, onCancel }: Props) {
  const [section, setSection] = useState<EffectSection>(initialSection);
  const [selected, setSelected] = useState<FilterDefinition | null>(null);
  const [intensity, setIntensity] = useState(1);
  const { url } = useGuestMediaUrl(mediaId);
  const visible = useMemo(() => FILTER_DEFINITIONS.filter((filter) => filter.section === section), [section]);

  function draft(filter: FilterDefinition, amount = intensity): EffectTimelineItem {
    return { id: 'filter-preview', kind: 'effect', trackId: 'effects', label: filter.name, preset: filter.preset, amount, startTime: 0, duration: Math.max(0.25, timelineDuration) };
  }

  function choose(filter: FilterDefinition) {
    setSelected(filter); setIntensity(filter.defaultIntensity); onPreview(draft(filter, filter.defaultIntensity));
  }

  function chooseSection(next: EffectSection) { setSection(next); setSelected(null); setIntensity(1); onPreview(undefined); }
  function clearSelection() { setSelected(null); setIntensity(1); onPreview(undefined); }

  return (
    <section className="border-t border-[#d9d7ce] bg-white p-4" aria-label="Filter gallery">
      <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Filters</h3><p className="text-xs text-[#526078]">Preview and export share the same filter values.</p></div><button type="button" onClick={() => { onPreview(undefined); onCancel(); }} aria-label="Close filters" className="grid h-10 w-10 place-items-center rounded-md hover:bg-[#f6f4ec]"><X className="h-4 w-4" /></button></div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist">{sections.map((entry) => <button key={entry.id} type="button" role="tab" aria-selected={section === entry.id} onClick={() => chooseSection(entry.id)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${section === entry.id ? 'bg-[#071d4a] text-white' : 'bg-[#f1efe7] text-[#526078]'}`}>{entry.label}</button>)}</div>
      <div className="mt-3 flex snap-x gap-3 overflow-x-auto pb-2">
        <button type="button" onClick={clearSelection} className={`w-24 shrink-0 snap-start text-left ${selected === null ? 'text-[#9a6f00]' : 'text-[#526078]'}`}><span className={`grid aspect-[9/12] place-items-center rounded-md border-2 bg-[#f6f4ec] text-xs font-bold ${selected === null ? 'border-[#f4c30f]' : 'border-transparent'}`}>Original</span><span className="mt-1 block text-xs font-semibold">None</span></button>
        {visible.map((filter) => {
          const preview = draft(filter, filter.defaultIntensity);
          return <button key={filter.id} type="button" onClick={() => choose(filter)} className={`w-24 shrink-0 snap-start text-left ${selected?.id === filter.id ? 'text-[#9a6f00]' : 'text-[#526078]'}`}>
            <span className={`relative block aspect-[9/12] overflow-hidden rounded-md border-2 ${selected?.id === filter.id ? 'border-[#f4c30f]' : 'border-transparent'} bg-[#071d4a]`}>
              {url && contentType?.startsWith('image/') && <img src={url} alt="" className="h-full w-full object-cover" style={browserEffectStyle([preview], 0.1)} />}
              {url && contentType?.startsWith('video/') && <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" style={browserEffectStyle([preview], 0.1)} />}
            </span><span className="mt-1 block truncate text-xs font-semibold">{filter.name}</span>
          </button>;
        })}
      </div>
      {selected && <label className="mt-3 block text-xs font-semibold">Intensity <span className="text-[#526078]">{Math.round(intensity * 100)}%</span><input type="range" min="0" max="2" step="0.05" value={intensity} onChange={(event) => { const value = Number(event.target.value); setIntensity(value); onPreview(draft(selected, value)); }} className="mt-2 w-full accent-[#c88b00]" /></label>}
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => { onPreview(undefined); onCancel(); }} className="min-h-10 rounded-md border border-[#d9d7ce] px-4 text-sm font-semibold">Cancel</button><button type="button" disabled={!selected} onClick={() => { if (!selected) return; const effect = draft(selected); onApply({ ...effect, id: crypto.randomUUID() }); onPreview(undefined); }} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#f4c30f] px-4 text-sm font-semibold text-[#071d4a] disabled:opacity-40"><Check className="h-4 w-4" />Apply</button></div>
    </section>
  );
}
