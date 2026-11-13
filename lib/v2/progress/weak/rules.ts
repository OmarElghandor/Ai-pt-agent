import type { WeakSpotStatus } from '@/lib/v2/progress/lessonProgressTypes';

export type WeakLabelEvent = {
  at: string; // ISO
  confidence: 'low' | 'medium' | 'high';
  questionKey: string;
  weight: number; // low = 0.5 else 1
};

export type WeakCorrectEvent = {
  at: string;
  localDate: string;
  answerId: string;
};

export function labelWeight(confidence: 'low' | 'medium' | 'high'): number {
  return confidence === 'low' ? 0.5 : 1;
}

/**
 * Open when same problem gets weight ≥ 3 within last 14 days
 * from at least 2 different questions.
 */
export function shouldOpenWeakSpot(labels: WeakLabelEvent[], now = new Date()): boolean {
  const cutoff = now.getTime() - 14 * 24 * 60 * 60 * 1000;
  const recent = labels.filter((l) => new Date(l.at).getTime() >= cutoff);
  const questions = new Set(recent.map((l) => l.questionKey));
  if (questions.size < 2) return false;
  const weight = recent.reduce((s, l) => s + l.weight, 0);
  return weight >= 3;
}

/** Improving after 2 correct first tries in a row. */
export function shouldImprove(
  status: WeakSpotStatus,
  recentCorrectStreak: number,
): boolean {
  return status === 'open' && recentCorrectStreak >= 2;
}

/** Resolved after 3 correct first tries on ≥ 2 different days. */
export function shouldResolve(corrects: WeakCorrectEvent[]): boolean {
  if (corrects.length < 3) return false;
  const days = new Set(corrects.map((c) => c.localDate));
  return days.size >= 2;
}

export type PureWeakState = {
  status: WeakSpotStatus;
  evidenceErrorIds: string[];
  evidenceCorrectIds: string[];
  examples: Array<{ wrong: string; right: string }>;
  itemsSeen: string[];
  opened_at: string | null;
  last_error_at: string | null;
  resolved_at: string | null;
  labelHistory: WeakLabelEvent[];
  correctHistory: WeakCorrectEvent[];
};

export function emptyWeakState(): PureWeakState {
  return {
    status: 'open',
    evidenceErrorIds: [],
    evidenceCorrectIds: [],
    examples: [],
    itemsSeen: [],
    opened_at: null,
    last_error_at: null,
    resolved_at: null,
    labelHistory: [],
    correctHistory: [],
  };
}

export function applyLabelToWeakState(
  state: PureWeakState,
  opts: {
    errorId: string;
    confidence: 'low' | 'medium' | 'high';
    questionKey: string;
    wrong: string;
    right: string;
    itemIds: string[];
    at?: string;
  },
): PureWeakState {
  const at = opts.at ?? new Date().toISOString();
  const next = { ...state };
  next.labelHistory = [
    ...state.labelHistory,
    {
      at,
      confidence: opts.confidence,
      questionKey: opts.questionKey,
      weight: labelWeight(opts.confidence),
    },
  ].slice(-40);
  next.evidenceErrorIds = [...state.evidenceErrorIds, opts.errorId].slice(-5);
  next.examples = [
    { wrong: opts.wrong, right: opts.right },
    ...state.examples,
  ].slice(0, 3);
  next.itemsSeen = [
    ...new Set([...state.itemsSeen, ...opts.itemIds]),
  ].slice(0, 40);
  next.last_error_at = at;

  const open = shouldOpenWeakSpot(next.labelHistory, new Date(at));
  if (state.status === 'resolved' && open) {
    next.status = 'open';
    next.opened_at = at;
    next.resolved_at = null;
  } else if (
    (state.status === 'open' || !state.opened_at) &&
    open &&
    !state.opened_at
  ) {
    next.status = 'open';
    next.opened_at = at;
  } else if (!state.opened_at && open) {
    next.opened_at = at;
    next.status = 'open';
  }
  // Labels before open threshold: keep accumulating without showing as open
  // until shouldOpen — represented by opened_at null.
  if (!open && !state.opened_at) {
    next.status = 'open';
    next.opened_at = null;
  }
  return next;
}

export function applyCorrectToWeakState(
  state: PureWeakState,
  opts: { answerId: string; localDate: string; at?: string },
): PureWeakState {
  if (!state.opened_at) return state;
  const at = opts.at ?? new Date().toISOString();
  const next = { ...state };
  next.correctHistory = [
    ...state.correctHistory,
    { at, localDate: opts.localDate, answerId: opts.answerId },
  ].slice(-40);
  next.evidenceCorrectIds = [
    ...state.evidenceCorrectIds,
    opts.answerId,
  ].slice(-5);

  const streak = (() => {
    let n = 0;
    for (let i = next.correctHistory.length - 1; i >= 0; i--) {
      // streak broken if a label happened after this correct? keep simple: last N corrects
      n += 1;
      if (n >= 2) break;
    }
    // Prefer consecutive from end
    return Math.min(2, next.correctHistory.length);
  })();

  // Real streak: consecutive corrects at end without intervening — we only have corrects here.
  const recentStreak = consecutiveCorrects(next);
  if (shouldResolve(next.correctHistory.slice(-10))) {
    next.status = 'resolved';
    next.resolved_at = at;
  } else if (shouldImprove(next.status, recentStreak) || recentStreak >= 2) {
    if (next.status === 'open') next.status = 'improving';
  }
  void streak;
  return next;
}

function consecutiveCorrects(state: PureWeakState): number {
  // Without interleaved errors, count trailing corrects after last_error_at
  const lastErr = state.last_error_at
    ? new Date(state.last_error_at).getTime()
    : 0;
  let n = 0;
  for (let i = state.correctHistory.length - 1; i >= 0; i--) {
    const t = new Date(state.correctHistory[i]!.at).getTime();
    if (t < lastErr) break;
    n += 1;
  }
  return n;
}

/** Cap: at most 5 open spots shown; rest wait (opened_at set but hidden by reader). */
export const MAX_OPEN_SHOWN = 5;
