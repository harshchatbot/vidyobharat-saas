
import { getApiUrl } from '@/lib/env';
import { getFreshFirebaseIdToken } from '@/lib/firebase-client';

import type { AppliedEditPlan, CopilotEditPlan } from './timeline/editPlan';
import type { TimelineProject, GuestMedia } from './timeline/types';
import { CopilotClientError, mapCopilotError } from './copilotUi';
import {
  generateCommandsWithDiagnostics,
  type BrowserAiProgress,
} from '@/lib/browser-ai/webllmService';
import {
  buildBrowserCopilotPlan,
  buildBrowserCopilotPlanFromIntents,
} from './browserCopilotAdapter';
import {
  parseBrowserIntent,
  routeBrowserRequest,
} from '@/lib/browser-ai/browserIntent';
import { buildAutoEditPlan } from './autoEdit';
import { analyzeAudioBlob, type BeatCandidate } from './beatDetection';

export { CopilotClientError, operationDescription } from './copilotUi';

export type CopilotHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type CopilotUsage = {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

export type CopilotPlanResponse = {
  plan: CopilotEditPlan;
  usage: CopilotUsage;
};

export type CopilotProposal = {
  epoch: number;
  baseProject: TimelineProject;
  baseRevision: string;
  applied: AppliedEditPlan;
  response: CopilotPlanResponse;
};

export const isBrowserCopilotEnabled =
  process.env.NEXT_PUBLIC_BROWSER_AI_COPILOT === 'true';

export const COPILOT_SUGGESTIONS = [
  'Create an Instagram Reel from my uploaded photos.',
  'How can I make my reel more engaging?',
  'Add the title "My Story" near the beginning.',
  'Make a short cinematic highlight.',
] as const;

const ZERO_USAGE: CopilotUsage = {
  inputTokens: 0,
  outputTokens: 0,
  estimatedCostUsd: 0,
};

/**
 * Detect unsupported requests to trim individual video clips.
 *
 * This is a temporary guard until clip trimming is implemented
 * through the timeline editing engine.
 */
function isUnsupportedClipTrimRequest(prompt: string): boolean {
  const mentionsTrim = /\b(trim|shorten|cut)\b/i.test(prompt);

  const mentionsVideo =
    /\b(clip|clips|video|videos|footage)\b/i.test(prompt);

  return mentionsTrim && mentionsVideo;
}

export async function requestCopilotPlan(input: {
  project: TimelineProject;
  projectRevision: string;
  prompt: string;
  history: CopilotHistoryMessage[];
  signal: AbortSignal;
}): Promise<CopilotPlanResponse> {
  let token = await getFreshFirebaseIdToken().catch(() => null);

  // Transitional compatibility for older sessions.
  if (!token && typeof window !== 'undefined') {
    try {
      token = window.localStorage.getItem('vidyo_access_token');
    } catch {
      token = null;
    }
  }

  if (!token) {
    throw new CopilotClientError(
      'signed_out',
      'Sign in to use AI Copilot.'
    );
  }

  const request = async (forceRefresh: boolean) => {
    if (forceRefresh) {
      token = await getFreshFirebaseIdToken(true);

      if (!token) {
        throw new CopilotClientError(
          'signed_out',
          'Your session has expired. Sign in again.'
        );
      }
    }

    return fetch(`${getApiUrl()}/api/editor/copilot/plan`, {
      method: 'POST',
      signal: input.signal,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        schemaVersion: '1.0',
        projectRevision: input.projectRevision,
        prompt: input.prompt,
        project: input.project,
        history: input.history.slice(-6).map((message) => ({
          ...message,
          content: message.content.slice(0, 500),
        })),
      }),
    });
  };

  let response = await request(false);

  if (response.status === 401) {
    response = await request(true);
  }

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw mapCopilotError(response.status, body);
  }

  return body as CopilotPlanResponse;
}

export async function requestBrowserCopilotPlan(input: {
  project: TimelineProject;
  projectRevision: string;
  prompt: string;
  media: GuestMedia[];
  onProgress?: (progress: BrowserAiProgress) => void;
}): Promise<CopilotPlanResponse> {
  const prompt = input.prompt.trim();

  if (!prompt) {
    throw new Error('Please enter an editing instruction.');
  }

  // Step 1: Reject unsupported individual clip trimming.
  // Do not send this operation to the limited WebLLM JSON schema.
  if (isUnsupportedClipTrimRequest(prompt)) {
    throw new Error(
      'AI Copilot does not support trimming individual video clips yet. ' +
      'You can adjust clip duration manually in the timeline.'
    );
  }

  // Step 2: Route full-reel creation requests.
  const route = routeBrowserRequest(prompt);

  if (route.kind === 'CLARIFICATION') {
    throw new Error(route.message);
  }

  if (route.kind === 'CREATE_REEL') {
    if (input.project.duration > 0) {
      throw new Error(
        'This request creates a new reel. Choose Replace current ' +
        'or Add to current before generating it.'
      );
    }

    const audio = input.media.filter(
      (item) =>
        item.media_type === 'audio' &&
        item.availability !== 'unavailable'
    );

    if (/music/i.test(prompt) && audio.length > 1) {
      throw new Error(
        'Please choose one uploaded music track for this reel.'
      );
    }

    if (/music/i.test(prompt) && audio.length === 0) {
      throw new Error(
        'No uploaded music is available; upload an audio file ' +
        'before generating this reel.'
      );
    }

    const beatCandidates = await analyzeUploadedMusic(
      audio[0]?.media_id
    );

    const plan = buildAutoEditPlan(
      input.project,
      input.media,
      input.projectRevision,
      {
        style: route.style,
        mode: 'replace',
        title: route.title,
        targetDuration: route.duration,
        musicVolume: route.musicVolume,
        transition: route.transition,
        beatCandidates,
      }
    );

    return {
      plan,
      usage: { ...ZERO_USAGE },
    };
  }

  // Step 3: Prefer deterministic parsing for supported edits.
  const intents = parseBrowserIntent(prompt);

  if (intents.length > 0) {
    const plan = buildBrowserCopilotPlanFromIntents(
      input.project,
      input.projectRevision,
      intents,
      input.media,
      prompt
    );

    return {
      plan,
      usage: { ...ZERO_USAGE },
    };
  }

  // Step 4: Use WebLLM only for instructions not resolved above.
  // Its generated commands must still pass schema validation.
  const result = await generateCommandsWithDiagnostics(
    prompt,
    input.onProgress
  );

  const plan = buildBrowserCopilotPlan(
    input.project,
    input.projectRevision,
    result.commands,
    input.media,
    prompt
  );

  return {
    plan,
    usage: { ...ZERO_USAGE },
  };
}

export async function analyzeUploadedMusic(
  mediaId?: string
): Promise<BeatCandidate[] | undefined> {
  if (!mediaId) return undefined;

  try {
    const response = await fetch(
      `${getApiUrl()}/api/editor/media/${encodeURIComponent(mediaId)}/content`,
      {
        credentials: 'include',
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      return undefined;
    }

    const analysis = await analyzeAudioBlob(
      await response.blob()
    );

    return analysis.beats;
  } catch {
    return undefined;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
