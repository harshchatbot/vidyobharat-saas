'use client';

import type { KeyboardEvent, PointerEvent } from 'react';
import { GuestMediaThumbnail } from '../GuestMediaThumbnail';
import { packEffectLanes } from './effectLanes';
import { snapTimelineTime } from './model';
import type { EffectTimelineItem, TimelineItem, TimelineTrack as Track } from './types';

type Props = {
  track: Track;
  pixelsPerSecond: number;
  duration: number;
  selectedItemId?: string | null;
  snapEnabled: boolean;
  snapTargets: number[];
  onSelectItem: (itemId: string) => void;
  onMoveItem: (itemId: string, startTime: number, transactionKey?: string) => void;
  onResizeItem: (itemId: string, edge: 'left' | 'right', time: number, transactionKey?: string) => void;
  onEditStart: (key: string) => void;
  onEditEnd: (key: string) => void;
};

const trackColors: Record<Track['type'], string> = {
  video: 'bg-[#315b9d]', text: 'bg-[#8b5f30]', effects: 'bg-[#a87600]',
  music: 'bg-[#257a62]', sfx: 'bg-[#167283]', voice: 'bg-[#585e91]',
};

const EFFECT_ROW_HEIGHT = 32;

export function TimelineTrack({ track, pixelsPerSecond, duration, selectedItemId, snapEnabled, snapTargets, onSelectItem, onMoveItem, onResizeItem, onEditStart, onEditEnd }: Props) {
  const effectLayout = track.type === 'effects'
    ? packEffectLanes(track.items.filter((item): item is EffectTimelineItem => item.kind === 'effect'))
    : null;
  const effectItemLayout = new Map(effectLayout?.items.map((entry) => [entry.item.id, entry]));
  const looksHeight = (effectLayout?.rowCounts.looks ?? 0) * EFFECT_ROW_HEIGHT;
  const trackHeight = effectLayout
    ? (effectLayout.rowCounts.looks + effectLayout.rowCounts.fades) * EFFECT_ROW_HEIGHT
    : 36;
  const snap = (value: number, item: TimelineItem, mode: 'move' | 'left' | 'right') => {
    return snapEnabled
      ? snapTimelineTime(value, item, mode, snapTargets, 8 / pixelsPerSecond)
      : value;
  };

  function beginPointer(event: PointerEvent<HTMLElement>, item: TimelineItem, mode: 'move' | 'left' | 'right') {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const transactionKey = `timeline:${item.id}:${mode}`;
    onEditStart(transactionKey);
    onSelectItem(item.id);
    const startX = event.clientX;
    const initialStart = item.startTime;
    const initialEnd = item.startTime + item.duration;
    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = (moveEvent.clientX - startX) / pixelsPerSecond;
      if (mode === 'left') onResizeItem(item.id, 'left', snap(initialStart + delta, item, 'left'), transactionKey);
      else if (mode === 'right') onResizeItem(item.id, 'right', snap(initialEnd + delta, item, 'right'), transactionKey);
      else onMoveItem(item.id, snap(initialStart + delta, item, 'move'), transactionKey);
    };
    const finish = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
      onEditEnd(transactionKey);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', finish, { once: true });
    window.addEventListener('pointercancel', finish, { once: true });
    window.addEventListener('blur', finish, { once: true });
  }

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, item: TimelineItem) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 1 : 1 / 30;
    const requested = item.startTime + (event.key === 'ArrowLeft' ? -step : step);
    onMoveItem(item.id, snap(requested, item, 'move'));
  }

  return (
    <div className="flex border-b border-white/10" style={{ height: trackHeight }}>
      <div className="sticky left-0 z-20 w-28 shrink-0 border-r border-white/10 bg-[#1e293b]">
        {effectLayout ? <>
          <div className="flex items-center px-3 text-[10px] font-semibold text-white" style={{ height: looksHeight }}>Looks &amp; effects</div>
          <div className="flex items-center border-t border-white/10 px-3 text-[10px] font-semibold text-amber-200" style={{ height: effectLayout.rowCounts.fades * EFFECT_ROW_HEIGHT }}>Fades</div>
        </> : <div className="flex h-full items-center px-3"><span className="truncate text-xs font-semibold text-white">{track.name}</span></div>}
      </div>
      <div className="relative shrink-0 bg-[#141b2b]" style={{ width: Math.max(duration * pixelsPerSecond, 600), height: trackHeight }}>
        {effectLayout && <div className="pointer-events-none absolute inset-x-0 border-t border-white/10" style={{ top: looksHeight }} />}
        {track.items.map((item) => {
          const packed = effectItemLayout.get(item.id);
          const top = packed
            ? (packed.group === 'looks' ? packed.row * EFFECT_ROW_HEIGHT : looksHeight + packed.row * EFFECT_ROW_HEIGHT) + 3
            : 4;
          return (
          <button key={item.id} type="button"
            onClick={() => onSelectItem(item.id)}
            onPointerDown={(event) => beginPointer(event, item, 'move')}
            onKeyDown={(event) => handleKey(event, item)}
            title={`${item.label}. Drag to move; use arrow keys for precision.`}
            className={`group absolute z-[1] flex h-7 touch-none items-center overflow-hidden rounded border px-2 text-left text-[11px] font-medium text-white focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4c30f] ${trackColors[track.type]} ${selectedItemId === item.id ? 'z-10 border-[#f4c30f] ring-1 ring-[#f4c30f]' : 'border-white/20'}`}
            style={{ top, left: item.startTime * pixelsPerSecond, width: Math.max(item.duration * pixelsPerSecond, 24) }}
          >
            {item.kind !== 'video' && <span role="presentation" onPointerDown={(event) => beginPointer(event, item, 'left')} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-black/15 opacity-0 group-hover:opacity-100" />}
            {item.kind === 'video' && <GuestMediaThumbnail mediaId={item.mediaId} contentType={item.contentType} alt="" className="mr-1.5 h-5 w-7 shrink-0 rounded-sm" />}
            <span className="truncate">{item.label}</span>
            <span role="presentation" onPointerDown={(event) => beginPointer(event, item, 'right')} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-black/15 opacity-0 group-hover:opacity-100" />
          </button>
        );})}
      </div>
    </div>
  );
}
