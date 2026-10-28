'use client';

import type { KeyboardEvent, PointerEvent } from 'react';
import { GuestMediaThumbnail } from '../GuestMediaThumbnail';
import type { TimelineItem, TimelineTrack as Track } from './types';

type Props = {
  track: Track;
  pixelsPerSecond: number;
  duration: number;
  selectedItemId?: string | null;
  onSelectItem: (itemId: string) => void;
  onMoveItem: (itemId: string, startTime: number) => void;
  onResizeItem: (itemId: string, edge: 'left' | 'right', time: number) => void;
  onReorderVideo: (itemId: string, targetIndex: number) => void;
};

const trackColors: Record<Track['type'], string> = {
  video: 'bg-[#315b9d]', text: 'bg-[#8b5f30]', effects: 'bg-[#a87600]', music: 'bg-[#257a62]', sfx: 'bg-[#167283]', voice: 'bg-[#585e91]',
};

export function TimelineTrack({ track, pixelsPerSecond, duration, selectedItemId, onSelectItem, onMoveItem, onResizeItem, onReorderVideo }: Props) {
  function beginPointer(event: PointerEvent<HTMLElement>, item: TimelineItem, mode: 'move' | 'left' | 'right') {
    event.preventDefault();
    event.stopPropagation();
    onSelectItem(item.id);
    const startX = event.clientX;
    const initialStart = item.startTime;
    const initialEnd = item.startTime + item.duration;
    event.currentTarget.setPointerCapture(event.pointerId);
    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = (moveEvent.clientX - startX) / pixelsPerSecond;
      if (mode === 'left') onResizeItem(item.id, 'left', initialStart + delta);
      else if (mode === 'right') onResizeItem(item.id, 'right', initialEnd + delta);
      else if (item.kind === 'video') onReorderVideo(item.id, Math.round((initialStart + delta) / Math.max(item.duration, 0.25)));
      else onMoveItem(item.id, initialStart + delta);
    };
    const finish = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', finish, { once: true });
    window.addEventListener('pointercancel', finish, { once: true });
  }

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, item: TimelineItem) {
    const step = event.shiftKey ? 1 : 0.1;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    if (item.kind === 'video') {
      const index = track.items.findIndex((entry) => entry.id === item.id);
      onReorderVideo(item.id, index + (event.key === 'ArrowLeft' ? -1 : 1));
    } else {
      onMoveItem(item.id, item.startTime + (event.key === 'ArrowLeft' ? -step : step));
    }
  }

  return (
    <div className="flex min-h-9 border-b border-white/10">
      <div className="sticky left-0 z-20 flex w-28 shrink-0 items-center border-r border-white/10 bg-[#1e293b] px-3"><span className="truncate text-xs font-semibold text-white">{track.name}</span></div>
      <div className="relative min-h-9 shrink-0 bg-[#141b2b]" style={{ width: Math.max(duration * pixelsPerSecond, 600) }}>
        {track.items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectItem(item.id)}
            onPointerDown={(event) => beginPointer(event, item, 'move')}
            onKeyDown={(event) => handleKey(event, item)}
            title={`${item.label}. Drag to move; use arrow keys for precision.`}
            className={`group absolute top-1 flex h-7 touch-none items-center overflow-hidden rounded border px-2 text-left text-[11px] font-medium text-white ${trackColors[track.type]} ${selectedItemId === item.id ? 'border-[#f4c30f] ring-1 ring-[#f4c30f]' : 'border-white/20'}`}
            style={{ left: item.startTime * pixelsPerSecond, width: Math.max(item.duration * pixelsPerSecond, 18) }}
          >
            {item.kind !== 'video' && <span role="presentation" onPointerDown={(event) => beginPointer(event, item, 'left')} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-black/15 opacity-0 group-hover:opacity-100" />}
            {item.kind === 'video' && <GuestMediaThumbnail mediaId={item.mediaId} contentType={item.contentType} alt="" className="mr-1.5 h-5 w-7 shrink-0 rounded-sm" />}
            <span className="truncate">{item.label}</span>
            <span role="presentation" onPointerDown={(event) => beginPointer(event, item, 'right')} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-black/15 opacity-0 group-hover:opacity-100" />
          </button>
        ))}
      </div>
    </div>
  );
}
