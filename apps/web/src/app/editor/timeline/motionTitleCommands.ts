import { applyTextTemplate, createBasicText, TEXT_TEMPLATES } from './textTemplates.ts';
import { MAX_TIMELINE_SECONDS, type TextTimelineItem } from './types.ts';

/**
 * Typed, allowlisted motion-title commands for future MCP tools.
 * Pure builder: this module never invokes models, uploads media or edits a project.
 * The caller must add the returned item through the existing Copilot EditPlan validator.
 */
export const MOTION_TITLE_PRESETS = ['motion-reveal', 'motion-pop', 'motion-float'] as const;
export type MotionTitlePreset = typeof MOTION_TITLE_PRESETS[number];
export type MotionTitleCommand = {
  op: 'add_motion_title';
  preset: MotionTitlePreset;
  text: string;
  start: number;
  duration: number;
};
export function createMotionTitleFromCommand(command: MotionTitleCommand): TextTimelineItem {
  if (command.op !== 'add_motion_title' || !MOTION_TITLE_PRESETS.includes(command.preset)) {
    throw new Error('Unsupported motion title command.');
  }
  if (typeof command.text !== 'string' || !command.text.trim() || command.text.length > 500) {
    throw new Error('Motion title text must contain 1–500 characters.');
  }
  if (!Number.isFinite(command.start) || !Number.isFinite(command.duration) || command.start < 0 ||
      command.duration < 0.25 || command.start + command.duration > MAX_TIMELINE_SECONDS) {
    throw new Error('Motion title timing is outside the timeline.');
  }
  const template = TEXT_TEMPLATES.find((item) => item.id === command.preset);
  if (!template) throw new Error('Motion title preset is unavailable.');
  const title = applyTextTemplate(createBasicText(command.start), template);
  return { ...title, label: command.text.trim(), text: command.text.trim(), duration: command.duration,
    inAnimationDuration: Math.min(title.inAnimationDuration, command.duration),
    outAnimationDuration: Math.min(title.outAnimationDuration, command.duration) };
}
