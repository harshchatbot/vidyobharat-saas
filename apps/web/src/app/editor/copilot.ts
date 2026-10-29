import { getApiUrl } from '@/lib/env';
import { getFreshFirebaseIdToken } from '@/lib/firebase-client';

import type { AppliedEditPlan, CopilotEditPlan } from './timeline/editPlan';
import type { TimelineProject } from './timeline/types';
import { CopilotClientError, mapCopilotError } from './copilotUi';

export { CopilotClientError, operationDescription } from './copilotUi';

export type CopilotHistoryMessage = { role: 'user' | 'assistant'; content: string };
export type CopilotUsage = { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
export type CopilotPlanResponse = { plan: CopilotEditPlan; usage: CopilotUsage };
export type CopilotProposal = {
  epoch: number;
  baseProject: TimelineProject;
  baseRevision: string;
  applied: AppliedEditPlan;
  response: CopilotPlanResponse;
};

export const COPILOT_SUGGESTIONS = [
  'Make the opening faster and keep the existing gaps.',
  'Add a warm title near the beginning.',
  'Reorder the visuals for a stronger story flow.',
  'Apply a cinematic look without changing my text.',
] as const;

export async function requestCopilotPlan(input: {
  project: TimelineProject;
  projectRevision: string;
  prompt: string;
  history: CopilotHistoryMessage[];
  signal: AbortSignal;
}): Promise<CopilotPlanResponse> {
  let token = await getFreshFirebaseIdToken().catch(() => null);
  // Transitional compatibility for sessions created before Firebase SDK
  // persistence was introduced. This fallback is never written by Copilot.
  if (!token && typeof window !== 'undefined') {
    try { token = window.localStorage.getItem('vidyo_access_token'); } catch { token = null; }
  }
  if (!token) throw new CopilotClientError('signed_out', 'Sign in to use AI Copilot.');

  const request = async (forceRefresh: boolean) => {
    if (forceRefresh) {
      token = await getFreshFirebaseIdToken(true);
      if (!token) throw new CopilotClientError('signed_out', 'Your session has expired. Sign in again.');
    }
    return fetch(`${getApiUrl()}/api/editor/copilot/plan`, {
      method: 'POST',
      signal: input.signal,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        schemaVersion: '1.0',
        projectRevision: input.projectRevision,
        prompt: input.prompt,
        project: input.project,
        history: input.history.slice(-6).map((message) => ({ ...message, content: message.content.slice(0, 500) })),
      }),
    });
  };

  let response = await request(false);
  if (response.status === 401) response = await request(true);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw mapCopilotError(response.status, body);
  return body as CopilotPlanResponse;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
