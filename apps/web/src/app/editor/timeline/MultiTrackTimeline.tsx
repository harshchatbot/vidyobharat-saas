'use client';

import { Magnet, Minus, Plus, Scissors, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { TimelineTrack } from './TimelineTrack';
import type { TimelineProject } from './types';

type Props = {
  project: TimelineProject;
  playbackTime: number;
  selectedItemId?: string | null;
  onSelectItem: (itemId: string) => void;
  onSeek: (time: number) => void;
  onMoveItem: (itemId: string, startTime: number) => void;
  onResizeItem: (
    itemId: string,
    edge: 'left' | 'right',
    time: number
  ) => void;
  onDeleteSelected: () => void;
  onSplitSelected: () => void;
};

const LABEL_WIDTH = 112;

export function MultiTrackTimeline({
  project,
  playbackTime,
  selectedItemId,
  onSelectItem,
  onSeek,
  onMoveItem,
  onResizeItem,
  onDeleteSelected,
  onSplitSelected,
}: Props) {
  const [pixelsPerSecond, setPixelsPerSecond] = useState(48);
  const [snapEnabled, setSnapEnabled] = useState(true);

  const cleanupSeekRef = useRef<(() => void) | null>(null);

  const snapTargets = [0, ...project.tracks.flatMap((track) => track.items.flatMap((item) =>
    [item.startTime, item.startTime + item.duration]))];
  const duration = Math.max(project.duration, 60);
  const timelineWidth = Math.max(duration * pixelsPerSecond, 600);

  const rulerStep =
    pixelsPerSecond >= 60 ? 1 : pixelsPerSecond >= 30 ? 2 : 5;

  const rulerMarks = Array.from(
    { length: Math.floor(duration / rulerStep) + 1 },
    (_, index) => index * rulerStep
  );

  // Remove global listeners if the component unmounts.
  useEffect(() => {
    return () => {
      cleanupSeekRef.current?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, button, [contenteditable="true"], [role="dialog"]')) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); setSnapEnabled((value) => !value); }
      if (event.key === '+' || event.key === '=') { event.preventDefault(); setPixelsPerSecond((value) => Math.min(120, value + 10)); }
      if (event.key === '-') { event.preventDefault(); setPixelsPerSecond((value) => Math.max(20, value - 10)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function beginSeek(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    // Capture the element while React's event is still active.
    const element = event.currentTarget;

    // Remove listeners from any previous drag.
    cleanupSeekRef.current?.();

    const rect = element.getBoundingClientRect();

    const seekToClientX = (clientX: number) => {
      const time = (clientX - rect.left) / pixelsPerSecond;

      onSeek(
        Math.max(0, Math.min(duration, time))
      );
    };

    // Seek immediately on pointer down.
    seekToClientX(event.clientX);

    const move = (moveEvent: globalThis.PointerEvent) => {
      seekToClientX(moveEvent.clientX);
    };

    const finish = () => {
      cleanup();
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);

      if (cleanupSeekRef.current === cleanup) {
        cleanupSeekRef.current = null;
      }
    };

    cleanupSeekRef.current = cleanup;

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#141b2b] text-white">
      <div className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3">
        <div className="flex items-center gap-1" aria-label="Timeline editing controls">
          <button type="button" disabled={!selectedItemId} onClick={onSplitSelected} title="Split selected video/audio at playhead (S)" className="inline-flex h-8 items-center gap-1.5 rounded px-2 text-xs text-white/70 hover:bg-white/10 disabled:text-white/30"><Scissors className="h-3.5 w-3.5" />Split</button>
          <button type="button" disabled={!selectedItemId} onClick={onDeleteSelected} title={selectedItemId ? 'Delete selected item' : 'Select an item to delete'} className="inline-flex h-8 items-center gap-1.5 rounded px-2 text-xs text-white/70 hover:bg-white/10 disabled:text-white/30"><Trash2 className="h-3.5 w-3.5" />Delete</button>
          <button type="button" onClick={() => setSnapEnabled((value) => !value)} title="Toggle snapping (N)" aria-pressed={snapEnabled} className={`hidden h-8 items-center gap-1.5 rounded px-2 text-xs sm:inline-flex ${snapEnabled ? 'bg-amber-400/15 text-amber-300' : 'text-white/50 hover:bg-white/10'}`}><Magnet className="h-3.5 w-3.5" />Snap</button>
        </div>

        <div
          className="flex items-center gap-2"
          aria-label="Timeline zoom controls"
        >
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() =>
              setPixelsPerSecond((value) => Math.max(20, value - 10))
            }
            className="grid h-8 w-8 place-items-center rounded border border-white/15 hover:bg-white/10"
          >
            <Minus className="h-4 w-4" />
          </button>

          <span className="w-12 text-center text-xs text-white/60">
            {Math.round((pixelsPerSecond / 48) * 100)}%
          </span>

          <button
            type="button"
            aria-label="Zoom in"
            onClick={() =>
              setPixelsPerSecond((value) => Math.min(120, value + 10))
            }
            className="grid h-8 w-8 place-items-center rounded border border-white/15 hover:bg-white/10"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div
          className="relative"
          style={{ width: LABEL_WIDTH + timelineWidth }}
        >
          <div className="flex h-9 border-b border-white/10">
            <div className="sticky left-0 z-30 w-28 shrink-0 border-r border-white/10 bg-[#1e293b]" />

            <div
              className="relative shrink-0 cursor-crosshair touch-none"
              style={{ width: timelineWidth }}
              onPointerDown={beginSeek}
            >
              {rulerMarks.map((second) => (
                <span
                  key={second}
                  className="pointer-events-none absolute bottom-1 text-[10px] text-white/55"
                  style={{ left: second * pixelsPerSecond }}
                >
                  {second}s
                </span>
              ))}
            </div>
          </div>

          {project.tracks.map((track) => (
            <TimelineTrack
              key={track.id}
              track={track}
              duration={duration}
              pixelsPerSecond={pixelsPerSecond}
              selectedItemId={selectedItemId}
              onSelectItem={onSelectItem}
              onMoveItem={onMoveItem}
              onResizeItem={onResizeItem}
              snapEnabled={snapEnabled}
              snapTargets={snapTargets}

            />
          ))}

          <div
            className="absolute bottom-0 top-9 z-10 w-[2px] cursor-ew-resize touch-none bg-[#f4c30f]"
            onPointerDown={beginSeek}
            style={{
              left:
                LABEL_WIDTH +
                Math.min(playbackTime, duration) * pixelsPerSecond,
            }}
          >
            <div className="absolute -left-[6px] -top-1 h-3 w-3 rounded-sm bg-[#f4c30f]" />
          </div>
        </div>
      </div>
    </div>
  );
}
