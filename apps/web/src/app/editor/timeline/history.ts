import type { TimelineProject } from './types.ts';

export const DEFAULT_HISTORY_LIMIT = 50;

export type ProjectHistory = {
  past: TimelineProject[];
  present: TimelineProject;
  future: TimelineProject[];
  limit: number;
  transaction?: { key: string; before: TimelineProject };
};

export function createProjectHistory(
  project: TimelineProject,
  limit = DEFAULT_HISTORY_LIMIT,
): ProjectHistory {
  return { past: [], present: project, future: [], limit: Math.max(1, limit) };
}

export function applyProjectChange(
  history: ProjectHistory,
  project: TimelineProject,
  transactionKey?: string,
): ProjectHistory {
  if (project === history.present) return history;

  if (transactionKey && history.transaction) {
    if (transactionKey !== history.transaction.key) return history;
    return { ...history, present: project };
  }

  const interruptedKey = history.transaction?.key;
  const committed = history.transaction ? commitProjectTransaction(history) : history;
  const applied: ProjectHistory = {
    ...committed,
    past: boundedAppend(committed.past, committed.present, committed.limit),
    present: project,
    future: [],
  };
  // An unrelated async update must be independently undoable, but it should
  // not end a gesture that is still physically in progress.
  return interruptedKey
    ? { ...applied, transaction: { key: interruptedKey, before: project } }
    : applied;
}

export function beginProjectTransaction(history: ProjectHistory, key: string): ProjectHistory {
  if (history.transaction?.key === key) return history;
  const committed = commitProjectTransaction(history);
  return { ...committed, transaction: { key, before: committed.present } };
}

export function commitProjectTransaction(history: ProjectHistory, key?: string): ProjectHistory {
  if (!history.transaction || (key && history.transaction.key !== key)) return history;
  const { transaction, ...rest } = history;
  if (transaction.before === history.present) return rest;
  return {
    ...rest,
    past: boundedAppend(history.past, transaction.before, history.limit),
    future: [],
  };
}

export function undoProjectChange(history: ProjectHistory): ProjectHistory {
  const committed = commitProjectTransaction(history);
  const previous = committed.past.at(-1);
  if (!previous) return committed;
  return {
    ...committed,
    past: committed.past.slice(0, -1),
    present: previous,
    future: [committed.present, ...committed.future].slice(0, committed.limit),
  };
}

export function redoProjectChange(history: ProjectHistory): ProjectHistory {
  const committed = commitProjectTransaction(history);
  const [next, ...future] = committed.future;
  if (!next) return committed;
  return {
    ...committed,
    past: boundedAppend(committed.past, committed.present, committed.limit),
    present: next,
    future,
  };
}

export function canUndoProject(history: ProjectHistory): boolean {
  return history.past.length > 0 || Boolean(history.transaction && history.transaction.before !== history.present);
}

export function canRedoProject(history: ProjectHistory): boolean {
  return history.future.length > 0;
}

function boundedAppend(items: TimelineProject[], project: TimelineProject, limit: number): TimelineProject[] {
  return [...items, project].slice(-limit);
}
