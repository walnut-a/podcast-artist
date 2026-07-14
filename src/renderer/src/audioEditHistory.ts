import type { AudioEditPlan } from '../../shared/types';

const maxAudioEditHistoryEntries = 50;

export interface AudioEditHistory {
  projectId: string;
  past: AudioEditPlan[];
  present: AudioEditPlan;
  future: AudioEditPlan[];
}

export function createAudioEditHistory(plan: AudioEditPlan): AudioEditHistory {
  return {
    projectId: plan.projectId,
    past: [],
    present: plan,
    future: []
  };
}

export function recordAudioEditPlanChange(
  history: AudioEditHistory,
  nextPlan: AudioEditPlan
): AudioEditHistory {
  assertMatchingProject(history, nextPlan);
  return {
    ...history,
    past: [...history.past, history.present].slice(-maxAudioEditHistoryEntries),
    present: nextPlan,
    future: []
  };
}

export function prepareAudioEditUndo(history: AudioEditHistory): AudioEditHistory | null {
  const previous = history.past.at(-1);
  if (!previous) return null;
  return {
    ...history,
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future]
  };
}

export function prepareAudioEditRedo(history: AudioEditHistory): AudioEditHistory | null {
  const [next, ...remainingFuture] = history.future;
  if (!next) return null;
  return {
    ...history,
    past: [...history.past, history.present].slice(-maxAudioEditHistoryEntries),
    present: next,
    future: remainingFuture
  };
}

export function syncRestoredAudioEditPlan(
  history: AudioEditHistory,
  persistedPlan: AudioEditPlan
): AudioEditHistory {
  assertMatchingProject(history, persistedPlan);
  return {
    ...history,
    present: persistedPlan
  };
}

function assertMatchingProject(history: AudioEditHistory, plan: AudioEditPlan): void {
  if (history.projectId !== plan.projectId) {
    throw new Error('Cannot mix audio edit history from different projects.');
  }
}
