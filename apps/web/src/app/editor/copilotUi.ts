import type { CopilotEditOperation } from './timeline/editPlan.ts';

export type CopilotErrorCode =
  | 'signed_out' | 'disabled' | 'stale' | 'invalid' | 'quota'
  | 'provider' | 'timeout' | 'unavailable' | 'cancelled';

export class CopilotClientError extends Error {
  readonly code: CopilotErrorCode;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    code: CopilotErrorCode,
    message: string,
    retryable = false,
    status?: number,
  ) {
    super(message);
    this.name = 'CopilotClientError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

export function mapCopilotError(status: number, body: unknown): CopilotClientError {
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const rawMessage = typeof record.message === 'string' ? record.message : '';
  if (status === 401) return new CopilotClientError('signed_out', 'Your session has expired. Sign in again.', false, status);
  if (status === 403) return new CopilotClientError('disabled', 'AI Copilot is not available in this environment.', false, status);
  if (status === 409) return new CopilotClientError('stale', 'The project changed. Generate a new proposal.', true, status);
  if (status === 413 || status === 422) return new CopilotClientError('invalid', rawMessage || 'Copilot could not create a safe plan for that request.', false, status);
  if (status === 429) return new CopilotClientError('quota', 'Your Copilot limit has been reached. Please try again later.', true, status);
  if (status === 504) return new CopilotClientError('timeout', 'Copilot took too long to respond.', true, status);
  if (status === 502) return new CopilotClientError('provider', 'Copilot returned an invalid plan. Try rephrasing your request.', true, status);
  return new CopilotClientError('unavailable', 'Copilot is temporarily unavailable.', status >= 500, status);
}

export function operationDescription(operation: CopilotEditOperation): string {
  switch (operation.op) {
    case 'reorder_visuals': return `Reorder ${operation.orderedItemIds.length} visual clips`;
    case 'add_text': return `Add text: ${operation.item.label}`;
    case 'add_effect': return `Add effect: ${operation.item.label}`;
    case 'update_item': return `Update item ${operation.itemId}`;
    case 'move_item': return `Move item to ${operation.startTime.toFixed(2)}s`;
    case 'resize_item': return `Resize item at ${operation.time.toFixed(2)}s`;
    case 'split_item': return `Split item at ${operation.time.toFixed(2)}s`;
    case 'remove_item': return `Remove item ${operation.itemId}`;
    case 'set_aspect_ratio': return `Change canvas to ${operation.aspectRatio}`;
  }
}
