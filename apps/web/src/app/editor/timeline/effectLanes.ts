import type { EffectTimelineItem } from './types.ts';

export type EffectLaneGroup = 'looks' | 'fades';

export type PackedEffectItem = {
  item: EffectTimelineItem;
  group: EffectLaneGroup;
  row: number;
};

export type PackedEffectLanes = {
  items: PackedEffectItem[];
  rowCounts: Record<EffectLaneGroup, number>;
};

export function effectLaneGroup(item: EffectTimelineItem): EffectLaneGroup {
  return item.preset === 'fade-in' || item.preset === 'fade-out' ? 'fades' : 'looks';
}

export function packEffectLanes(items: readonly EffectTimelineItem[]): PackedEffectLanes {
  const packed: PackedEffectItem[] = [];
  const rowCounts: Record<EffectLaneGroup, number> = { looks: 1, fades: 1 };

  for (const group of ['looks', 'fades'] as const) {
    const rowEnds: number[] = [];
    const sorted = [...items]
      .filter((item) => effectLaneGroup(item) === group)
      .sort((left, right) => left.startTime - right.startTime
        || left.duration - right.duration
        || left.id.localeCompare(right.id));

    for (const item of sorted) {
      const row = rowEnds.findIndex((end) => item.startTime >= end - 1e-9);
      const targetRow = row === -1 ? rowEnds.length : row;
      rowEnds[targetRow] = item.startTime + item.duration;
      packed.push({ item, group, row: targetRow });
    }
    rowCounts[group] = Math.max(1, rowEnds.length);
  }

  return { items: packed, rowCounts };
}
