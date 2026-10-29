import {
  addItem,
  moveItem,
  normalizeProject,
  projectItem,
  removeItem,
  reorderVideo,
  resizeItem,
  splitItem,
  updateItem,
} from './model.ts';
import { serializeTimelineProject } from './serialization.ts';
import {
  EFFECT_PRESETS,
  EDITOR_FONTS,
  MAX_TIMELINE_SECONDS,
  type EffectTimelineItem,
  type ProjectAspectRatio,
  type TextTimelineItem,
  type TimelineItem,
  type TimelineProject,
  type VideoTimelineItem,
  type AudioTimelineItem,
} from './types.ts';

export const COPILOT_EDIT_PLAN_VERSION = '1.0' as const;
export const MAX_COPILOT_OPERATIONS = 20;

type ReorderVisualsOperation = { op: 'reorder_visuals'; orderedItemIds: string[] };
type AddTextOperation = { op: 'add_text'; item: TextTimelineItem };
type AddMediaOperation = { op: 'add_media'; item: VideoTimelineItem };
type AddAudioOperation = { op: 'add_audio'; item: AudioTimelineItem };
type AddEffectOperation = { op: 'add_effect'; item: EffectTimelineItem };
type UpdateItemOperation = { op: 'update_item'; itemId: string; changes: Partial<TimelineItem> };
type MoveItemOperation = { op: 'move_item'; itemId: string; startTime: number };
type ResizeItemOperation = { op: 'resize_item'; itemId: string; edge: 'left' | 'right'; time: number };
type SplitItemOperation = { op: 'split_item'; itemId: string; time: number; newItemId: string };
type RemoveItemOperation = { op: 'remove_item'; itemId: string };
type SetAspectRatioOperation = { op: 'set_aspect_ratio'; aspectRatio: ProjectAspectRatio };

export type CopilotEditOperation =
  | ReorderVisualsOperation
  | AddTextOperation
  | AddMediaOperation
  | AddAudioOperation
  | AddEffectOperation
  | UpdateItemOperation
  | MoveItemOperation
  | ResizeItemOperation
  | SplitItemOperation
  | RemoveItemOperation
  | SetAspectRatioOperation;

export type CopilotEditPlan = {
  schemaVersion: typeof COPILOT_EDIT_PLAN_VERSION;
  requestId: string;
  projectRevision: string;
  summary: string;
  warnings: string[];
  operations: CopilotEditOperation[];
};

export type EditSummary = {
  operationIndex: number;
  operation: CopilotEditOperation['op'];
  itemId?: string;
  description: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export type AppliedEditPlan = {
  project: TimelineProject;
  previousRevision: string;
  projectRevision: string;
  summaries: EditSummary[];
  warnings: string[];
};

export type EditPlanErrorCode =
  | 'invalid_plan'
  | 'stale_project_revision'
  | 'invalid_item_id'
  | 'duplicate_item_id'
  | 'invalid_operation'
  | 'visual_overlap'
  | 'unsupported_operation';

export class EditPlanValidationError extends Error {
  readonly code: EditPlanErrorCode;
  readonly operationIndex?: number;

  constructor(
    code: EditPlanErrorCode,
    message: string,
    operationIndex?: number,
  ) {
    super(message);
    this.name = 'EditPlanValidationError';
    this.code = code;
    this.operationIndex = operationIndex;
  }
}

export async function calculateProjectRevision(project: TimelineProject): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(project));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function applyEditPlan(
  currentProject: TimelineProject,
  plan: CopilotEditPlan,
): Promise<AppliedEditPlan> {
  validatePlanEnvelope(plan);
  const previousRevision = await calculateProjectRevision(currentProject);
  if (plan.projectRevision !== previousRevision) {
    throw new EditPlanValidationError(
      'stale_project_revision',
      'The project changed after this edit plan was created.',
    );
  }

  let working = currentProject;
  const summaries: EditSummary[] = [];
  for (const [index, operation] of plan.operations.entries()) {
    try {
      const result = applyOperation(working, operation, index);
      working = result.project;
      summaries.push(result.summary);
    } catch (error) {
      if (error instanceof EditPlanValidationError) throw error;
      throw new EditPlanValidationError(
        'invalid_operation',
        error instanceof Error ? error.message : 'The edit operation is invalid.',
        index,
      );
    }
  }

  working = normalizeProject(working);
  validateFrontendProject(working);
  // This verifies the existing frontend export contract only. Full Pydantic
  // validation remains a backend responsibility in Phase B.
  serializeTimelineProject(working);
  return {
    project: working,
    previousRevision,
    projectRevision: await calculateProjectRevision(working),
    summaries,
    warnings: [...plan.warnings],
  };
}

function applyOperation(
  project: TimelineProject,
  operation: CopilotEditOperation,
  operationIndex: number,
): { project: TimelineProject; summary: EditSummary } {
  validateOperationShape(operation, operationIndex);
  switch (operation.op) {
    case 'add_media':
    case 'add_audio':
    case 'add_text':
    case 'add_effect': {
      if (projectItem(project, operation.item.id)) fail('duplicate_item_id', 'The new item ID is already in use.', operationIndex);
      validateNewItem(operation.item, operationIndex);
      const next = addItem(project, operation.item);
      const added = requiredItem(next, operation.item.id, operationIndex);
      return result(operationIndex, operation.op, operation.item.id, null, itemSummary(added), `Added ${added.label}` , next);
    }
    case 'update_item': {
      const before = requiredItem(project, operation.itemId, operationIndex);
      const changes = validateUpdates(before, operation.changes, operationIndex);
      const candidate = { ...before, ...changes } as TimelineItem;
      if (candidate.kind === 'video') assertVisualInterval(project, candidate.id, candidate.startTime, candidate.duration, operationIndex);
      const next = updateItem(project, operation.itemId, changes);
      const after = requiredItem(next, operation.itemId, operationIndex);
      return result(operationIndex, operation.op, operation.itemId, itemSummary(before), itemSummary(after), `Updated ${before.label}`, next);
    }
    case 'move_item': {
      finite(operation.startTime, 'startTime', operationIndex);
      const before = requiredItem(project, operation.itemId, operationIndex);
      if (before.kind === 'video') assertVisualInterval(project, before.id, operation.startTime, before.duration, operationIndex);
      const next = moveItem(project, operation.itemId, operation.startTime);
      const after = requiredItem(next, operation.itemId, operationIndex);
      return result(operationIndex, operation.op, operation.itemId, itemSummary(before), itemSummary(after), `Moved ${before.label} from ${seconds(before.startTime)} to ${seconds(after.startTime)}`, next);
    }
    case 'resize_item': {
      finite(operation.time, 'time', operationIndex);
      const before = requiredItem(project, operation.itemId, operationIndex);
      if (before.kind === 'video' && operation.edge === 'left') fail('unsupported_operation', 'Visual clips cannot be resized from the left edge.', operationIndex);
      if (before.kind === 'video') assertVisualInterval(project, before.id, before.startTime, operation.time - before.startTime, operationIndex);
      const next = resizeItem(project, operation.itemId, operation.edge, operation.time);
      const after = requiredItem(next, operation.itemId, operationIndex);
      return result(operationIndex, operation.op, operation.itemId, itemSummary(before), itemSummary(after), `Resized ${before.label} to ${seconds(after.duration)}`, next);
    }
    case 'split_item': {
      if (projectItem(project, operation.newItemId)) fail('duplicate_item_id', 'The split item ID is already in use.', operationIndex);
      finite(operation.time, 'time', operationIndex);
      const before = requiredItem(project, operation.itemId, operationIndex);
      const next = splitItem(project, operation.itemId, operation.time, operation.newItemId);
      const created = projectItem(next, operation.newItemId);
      if (!created) fail('invalid_operation', 'The item cannot be split at the requested time.', operationIndex);
      return result(operationIndex, operation.op, operation.itemId, itemSummary(before), itemSummary(requiredItem(next, operation.itemId, operationIndex)), `Split ${before.label} at ${seconds(operation.time)}`, next);
    }
    case 'remove_item': {
      const before = requiredItem(project, operation.itemId, operationIndex);
      const next = removeItem(project, operation.itemId);
      return result(operationIndex, operation.op, operation.itemId, itemSummary(before), null, `Removed ${before.label}`, next);
    }
    case 'reorder_visuals': {
      const beforeItems = visualItems(project);
      const actualIds = beforeItems.map((item) => item.id);
      if (operation.orderedItemIds.length !== actualIds.length || new Set(operation.orderedItemIds).size !== actualIds.length || operation.orderedItemIds.some((id) => !actualIds.includes(id))) {
        fail('invalid_operation', 'Visual reorder must contain every current visual item exactly once.', operationIndex);
      }
      let next = project;
      operation.orderedItemIds.forEach((id, targetIndex) => {
        const currentIndex = visualItems(next).findIndex((item) => item.id === id);
        if (currentIndex !== targetIndex) next = reorderVideo(next, id, targetIndex);
      });
      return result(operationIndex, operation.op, undefined, { orderedItemIds: actualIds }, { orderedItemIds: visualItems(next).map((item) => item.id) }, 'Reordered visual clips', next);
    }
    case 'set_aspect_ratio': {
      const before = project.aspectRatio;
      const next = { ...project, aspectRatio: operation.aspectRatio };
      return result(operationIndex, operation.op, undefined, { aspectRatio: before }, { aspectRatio: next.aspectRatio }, `Changed aspect ratio from ${before} to ${next.aspectRatio}`, next);
    }
  }
}

function validatePlanEnvelope(plan: CopilotEditPlan): void {
  if (!isRecord(plan)) fail('invalid_plan', 'The edit plan must be an object.');
  exactKeys(plan, ['schemaVersion', 'requestId', 'projectRevision', 'summary', 'warnings', 'operations']);
  if (plan.schemaVersion !== COPILOT_EDIT_PLAN_VERSION) fail('invalid_plan', 'The edit plan schema version is unsupported.');
  if (!nonEmpty(plan.requestId, 128) || !nonEmpty(plan.projectRevision, 80) || !nonEmpty(plan.summary, 500)) fail('invalid_plan', 'The edit plan metadata is invalid.');
  if (!Array.isArray(plan.warnings) || plan.warnings.length > 20 || plan.warnings.some((warning) => !nonEmpty(warning, 500))) fail('invalid_plan', 'The edit plan warnings are invalid.');
  if (!Array.isArray(plan.operations) || plan.operations.length === 0 || plan.operations.length > MAX_COPILOT_OPERATIONS) fail('invalid_plan', `An edit plan must contain 1-${MAX_COPILOT_OPERATIONS} operations.`);
}

function validateOperationShape(operation: CopilotEditOperation, index: number): void {
  if (!isRecord(operation) || typeof operation.op !== 'string') fail('invalid_operation', 'The edit operation is invalid.', index);
  const keys: Record<CopilotEditOperation['op'], string[]> = {
    reorder_visuals: ['op', 'orderedItemIds'], add_media: ['op', 'item'], add_audio: ['op', 'item'], add_text: ['op', 'item'], add_effect: ['op', 'item'],
    update_item: ['op', 'itemId', 'changes'], move_item: ['op', 'itemId', 'startTime'],
    resize_item: ['op', 'itemId', 'edge', 'time'], split_item: ['op', 'itemId', 'time', 'newItemId'],
    remove_item: ['op', 'itemId'], set_aspect_ratio: ['op', 'aspectRatio'],
  };
  if (!(operation.op in keys)) fail('unsupported_operation', 'The edit operation is unsupported.', index);
  exactKeys(operation, keys[operation.op], index);
  if ('itemId' in operation && !nonEmpty(operation.itemId, 128)) fail('invalid_item_id', 'The item ID is invalid.', index);
  if (operation.op === 'split_item' && !nonEmpty(operation.newItemId, 128)) fail('invalid_item_id', 'The new item ID is invalid.', index);
  if (operation.op === 'resize_item' && !['left', 'right'].includes(operation.edge)) fail('invalid_operation', 'The resize edge is invalid.', index);
  if (operation.op === 'set_aspect_ratio' && !['9:16', '16:9', '1:1', '4:5'].includes(operation.aspectRatio)) fail('invalid_operation', 'The aspect ratio is unsupported.', index);
}

function validateNewItem(item: TimelineItem, index: number): void {
  if (!isRecord(item) || !nonEmpty(item.id, 128) || !nonEmpty(item.label, 200)) fail('invalid_operation', 'The new item metadata is invalid.', index);
  if (item.kind === 'text') {
    exactKeys(item, ['id', 'kind', 'trackId', 'label', 'startTime', 'duration', 'text', 'fontFamily', 'fontSize', 'color', 'bold', 'x', 'y', 'width', 'rotation', 'alignment', 'outlineColor', 'outlineWidth', 'shadow', 'backgroundColor', 'backgroundOpacity', 'inAnimation', 'outAnimation', 'loopAnimation', 'inAnimationDuration', 'outAnimationDuration'], index);
    if (item.trackId !== 'text' || !EDITOR_FONTS.includes(item.fontFamily as typeof EDITOR_FONTS[number])) fail('invalid_operation', 'The text font or track is unsupported.', index);
    if (!nonEmpty(item.text, 500) || !['left', 'center', 'right'].includes(item.alignment) || !['none', 'fade-in', 'slide-up', 'pop-in'].includes(item.inAnimation) || !['none', 'fade-out', 'slide-down'].includes(item.outAnimation) || !['none', 'pulse', 'float'].includes(item.loopAnimation)) fail('invalid_operation', 'The text content or style is unsupported.', index);
    if (![item.color, item.outlineColor, item.backgroundColor].every(validColor)) fail('invalid_operation', 'Text colors must use six-digit hex values.', index);
  } else if (item.kind === 'audio') {
    exactKeys(item, ['id', 'kind', 'trackId', 'label', 'startTime', 'duration', 'mediaId', 'contentType', 'sourceStart', 'muted', 'volume'], index);
    if (!['music', 'sfx', 'voice'].includes(item.trackId) || !nonEmpty(item.mediaId, 256) || !nonEmpty(item.contentType, 256) || item.volume < 0 || item.volume > 1) fail('invalid_operation', 'The audio media item is invalid.', index);
  } else if (item.kind === 'video') {
    exactKeys(item, ['id', 'kind', 'trackId', 'label', 'startTime', 'duration', 'mediaId', 'contentType', 'sourceStart', 'cropMode', 'muted', 'volume', 'transitionOut'], index);
    if (item.trackId !== 'video' || item.cropMode !== 'cover' && item.cropMode !== 'contain' || !nonEmpty(item.mediaId, 256) || !nonEmpty(item.contentType, 256)) fail('invalid_operation', 'The image media item is invalid.', index);
    if (item.transitionOut && (!['none', 'crossfade', 'slide-left', 'slide-right'].includes(item.transitionOut.type) || !Number.isFinite(item.transitionOut.duration) || item.transitionOut.duration <= 0 || item.transitionOut.duration > Math.min(2, item.duration))) fail('invalid_operation', 'The clip transition is invalid.', index);
  } else if (item.kind === 'effect') {
    exactKeys(item, ['id', 'kind', 'trackId', 'label', 'startTime', 'duration', 'preset', 'amount'], index);
    if (item.trackId !== 'effects' || !EFFECT_PRESETS.includes(item.preset)) fail('invalid_operation', 'The effect preset or track is unsupported.', index);
  } else fail('unsupported_operation', 'Only images, text, and effects can be added by a plan.', index);
  for (const [key, value] of Object.entries(item)) if (typeof value === 'number') finite(value, key, index);
  if (item.startTime < 0 || item.duration <= 0 || item.startTime + item.duration > MAX_TIMELINE_SECONDS + 1e-9) fail('invalid_operation', 'The new item timing is outside the timeline bounds.', index);
}

function validateUpdates(item: TimelineItem, changes: Partial<TimelineItem>, index: number): Partial<TimelineItem> {
  if (!isRecord(changes) || Object.keys(changes).length === 0) fail('invalid_operation', 'Item updates cannot be empty.', index);
  const common = ['label', 'startTime', 'duration'];
  const fieldsByKind = {
    video: [...common, 'sourceStart', 'cropMode', 'muted', 'volume'],
    audio: [...common, 'sourceStart', 'muted', 'volume'],
    effect: [...common, 'preset', 'amount'],
    text: [...common, 'text', 'fontFamily', 'fontSize', 'color', 'bold', 'x', 'y', 'width', 'rotation', 'alignment', 'outlineColor', 'outlineWidth', 'shadow', 'backgroundColor', 'backgroundOpacity', 'inAnimation', 'outAnimation', 'loopAnimation', 'inAnimationDuration', 'outAnimationDuration'],
  };
  const knownFields = Object.values(fieldsByKind).flat();
  // Null is a provider placeholder only for known schema fields. Unknown keys
  // still fail validation, even when null; never discard meaningful edits.
  changes = Object.fromEntries(Object.entries(changes).filter(([key, value]) => value !== null || !knownFields.includes(key))) as Partial<TimelineItem>;
  if (Object.keys(changes).length === 0) fail('invalid_operation', 'Item updates cannot be empty.', index);
  const allowed = fieldsByKind[item.kind];
  if (Object.keys(changes).some((key) => !allowed.includes(key))) fail('invalid_operation', `The update contains fields unsupported for a ${item.kind} item.`, index);
  for (const [key, value] of Object.entries(changes)) if (typeof value === 'number') finite(value, key, index);
  if ('preset' in changes && !EFFECT_PRESETS.includes(changes.preset as EffectTimelineItem['preset'])) fail('invalid_operation', 'The effect preset is unsupported.', index);
  if ('fontFamily' in changes && !EDITOR_FONTS.includes(changes.fontFamily as typeof EDITOR_FONTS[number])) fail('invalid_operation', 'The text font is unsupported.', index);
  const updateRecord = changes as Record<string, unknown>;
  for (const key of ['color', 'outlineColor', 'backgroundColor']) {
    if (key in updateRecord && !validColor(updateRecord[key])) fail('invalid_operation', `${key} must use a six-digit hex value.`, index);
  }
  return changes;
}

function validateFrontendProject(project: TimelineProject): void {
  if (project.duration < 0 || project.duration > MAX_TIMELINE_SECONDS) fail('invalid_plan', 'The resulting project exceeds the editor duration limit.');
  const visuals = visualItems(project);
  for (let index = 1; index < visuals.length; index += 1) {
    if (visuals[index].startTime < visuals[index - 1].startTime + visuals[index - 1].duration - 1e-9) fail('visual_overlap', 'The resulting project contains overlapping visual clips.');
  }
}

function assertVisualInterval(project: TimelineProject, itemId: string, startTime: number, duration: number, index: number): void {
  finite(startTime, 'startTime', index); finite(duration, 'duration', index);
  if (startTime < 0 || duration <= 0 || startTime + duration > MAX_TIMELINE_SECONDS + 1e-9) fail('invalid_operation', 'The visual timing is outside the timeline bounds.', index);
  const overlaps = visualItems(project).some((item) => item.id !== itemId && startTime < item.startTime + item.duration - 1e-9 && startTime + duration > item.startTime + 1e-9);
  if (overlaps) fail('visual_overlap', 'Visual clips cannot overlap.', index);
}

function requiredItem(project: TimelineProject, id: string, index: number): TimelineItem {
  const item = projectItem(project, id);
  if (!item) fail('invalid_item_id', 'The referenced timeline item does not exist.', index);
  return item;
}

function visualItems(project: TimelineProject): VideoTimelineItem[] {
  return (project.tracks.find((track) => track.id === 'video')?.items ?? []).filter((item): item is VideoTimelineItem => item.kind === 'video');
}

function itemSummary(item: TimelineItem): Record<string, unknown> {
  const base: Record<string, unknown> = { id: item.id, kind: item.kind, label: item.label, startTime: item.startTime, duration: item.duration };
  if (item.kind === 'video' || item.kind === 'audio') return { ...base, sourceStart: item.sourceStart, muted: item.muted, volume: item.volume };
  if (item.kind === 'effect') return { ...base, preset: item.preset, amount: item.amount };
  return { ...base, text: item.text, fontFamily: item.fontFamily, fontSize: item.fontSize, x: item.x, y: item.y };
}

function result(index: number, operation: CopilotEditOperation['op'], itemId: string | undefined, before: Record<string, unknown> | null, after: Record<string, unknown> | null, description: string, project: TimelineProject) {
  return { project, summary: { operationIndex: index, operation, itemId, description, before, after } };
}

function canonicalJson(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new EditPlanValidationError('invalid_plan', 'Project values must be finite.');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  throw new EditPlanValidationError('invalid_plan', 'Project values must be JSON-compatible.');
}

function exactKeys(value: Record<string, unknown>, allowed: string[], index?: number): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) fail('invalid_operation', `Unsupported field: ${extras[0]}.`, index);
}

function finite(value: unknown, field: string, index?: number): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('invalid_operation', `${field} must be a finite number.`, index);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function validColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function seconds(value: number): string { return `${value.toFixed(2)}s`; }

function fail(code: EditPlanErrorCode, message: string, operationIndex?: number): never {
  throw new EditPlanValidationError(code, message, operationIndex);
}
