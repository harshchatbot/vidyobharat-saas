'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Maximize2, RotateCw } from 'lucide-react';
import { moveTextGeometry, resizeTextGeometry } from './timeline/textGeometry';
import { textAnimationStyle } from './timeline/textAnimations';
import { editorFontStack, type TextTimelineItem, type TimelineItem } from './timeline/types';

type Props = {
  item: TextTimelineItem;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<TimelineItem>, transactionKey?: string) => void;
  animationTime: number;
  onEditStart: (key: string) => void;
  onEditEnd: (key: string) => void;
};

export function TextOverlayCanvas({ item, selected, onSelect, onUpdate, animationTime, onEditStart, onEditEnd }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(720);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const canvas = rootRef.current?.parentElement;
    if (!canvas) return;
    const update = () => setCanvasWidth(canvas.getBoundingClientRect().width || 720);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  function beginDrag(event: PointerEvent<HTMLDivElement>) {
    if (editing) return;
    event.preventDefault(); event.stopPropagation(); onSelect();
    const canvas = rootRef.current?.parentElement?.getBoundingClientRect();
    if (!canvas) return;
    const startX = event.clientX; const startY = event.clientY;
    const origin = { x: item.x, y: item.y, width: item.width, fontSize: item.fontSize };
    const move = (next: globalThis.PointerEvent) => {
      onUpdate(moveTextGeometry(origin, { x: next.clientX - startX, y: next.clientY - startY }, canvas), `canvas:${item.id}:move`);
    };
    listen(move, `canvas:${item.id}:move`);
  }

  function beginResize(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault(); event.stopPropagation();
    const canvas = rootRef.current?.parentElement?.getBoundingClientRect();
    if (!canvas) return;
    const startX = event.clientX;
    const origin = { x: item.x, y: item.y, width: item.width, fontSize: item.fontSize };
    const move = (next: globalThis.PointerEvent) => {
      onUpdate(resizeTextGeometry(origin, next.clientX - startX, canvas.width), `canvas:${item.id}:resize`);
    };
    listen(move, `canvas:${item.id}:resize`);
  }

  function beginRotate(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault(); event.stopPropagation();
    const bounds = rootRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const centerX = bounds.left + bounds.width / 2; const centerY = bounds.top + bounds.height / 2;
    const move = (next: globalThis.PointerEvent) => {
      const degrees = Math.atan2(next.clientY - centerY, next.clientX - centerX) * 180 / Math.PI + 90;
      onUpdate({ rotation: Math.max(-180, Math.min(180, Math.round(degrees * 10) / 10)) }, `canvas:${item.id}:rotate`);
    };
    listen(move, `canvas:${item.id}:rotate`);
  }

  function listen(move: (event: globalThis.PointerEvent) => void, transactionKey: string) {
    onEditStart(transactionKey);
    const finish = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); window.removeEventListener('blur', finish); onEditEnd(transactionKey); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish, { once: true });
    window.addEventListener('pointercancel', finish, { once: true });
    window.addEventListener('blur', finish, { once: true });
  }

  const fontSize = item.fontSize * canvasWidth / 720;
  const textStyle: CSSProperties = {
    color: item.color, fontFamily: editorFontStack(item.fontFamily), fontSize, fontWeight: item.bold ? 700 : 400,
    lineHeight: 1.12, textAlign: item.alignment, overflowWrap: 'anywhere',
    WebkitTextStroke: item.outlineWidth > 0 ? `${item.outlineWidth * canvasWidth / 720}px ${item.outlineColor}` : undefined,
    textShadow: item.shadow ? `0 ${2 * canvasWidth / 720}px ${8 * canvasWidth / 720}px rgba(0,0,0,.55)` : undefined,
    backgroundColor: hexToRgba(item.backgroundColor, item.backgroundOpacity),
    ...textAnimationStyle(item, animationTime),
  };

  return <div ref={rootRef} data-testid="text-overlay" className={`absolute z-20 touch-none ${selected ? 'cursor-move' : 'cursor-pointer'}`} style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, width: `${item.width * 100}%`, transform: `translate(-50%, -50%) rotate(${item.rotation}deg)` }} onPointerDown={beginDrag} onDoubleClick={(event) => { event.stopPropagation(); setEditing(true); }}>
    <div className={`relative px-2 py-1 ${selected ? 'outline outline-1 outline-[#f4c30f]' : ''}`} style={textStyle}>
      {editing ? <textarea autoFocus value={item.text} onFocus={() => onEditStart(`canvas:${item.id}:text`)} onChange={(event) => onUpdate({ text: event.target.value, label: event.target.value || 'Text' }, `canvas:${item.id}:text`)} onBlur={() => { onEditEnd(`canvas:${item.id}:text`); setEditing(false); }} onPointerDown={(event) => event.stopPropagation()} className="block min-h-16 w-full resize-none bg-white/90 p-2 text-[#071d4a] outline-none" style={{ font: 'inherit', textAlign: item.alignment }} /> : item.text}
      {selected && <>
        <button type="button" aria-label="Rotate text" onPointerDown={beginRotate} className="absolute -top-11 left-1/2 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full bg-[#f4c30f] text-[#071d4a] shadow"><RotateCw className="h-4 w-4" /></button>
        <button type="button" aria-label="Resize text" onPointerDown={beginResize} className="absolute -bottom-4 -right-4 grid h-9 w-9 place-items-center rounded-full bg-[#f4c30f] text-[#071d4a] shadow"><Maximize2 className="h-4 w-4" /></button>
        <button type="button" onClick={(event) => { event.stopPropagation(); setEditing(true); }} className="absolute -bottom-12 left-1/2 min-h-9 -translate-x-1/2 rounded-full bg-[#071d4a] px-4 text-xs font-semibold text-white md:hidden">Edit text</button>
      </>}
    </div>
  </div>;
}

function hexToRgba(hex: string, opacity: number): string | undefined {
  if (opacity <= 0 || !/^#[0-9a-f]{6}$/i.test(hex)) return undefined;
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${opacity})`;
}
