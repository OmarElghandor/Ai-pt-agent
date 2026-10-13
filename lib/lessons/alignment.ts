import type { StoryBeat } from './types';

const PRACTICE_TERMINAL = new Set(['correct', 'near-miss', 'learned-with-help']);

export function beatResolved(
  beatId: string,
  outcomes: Record<string, string>,
): boolean {
  return PRACTICE_TERMINAL.has(outcomes[beatId] ?? '');
}

export function allBeatsResolved(
  beats: { id: string }[],
  outcomes: Record<string, string>,
): boolean {
  return beats.length > 0 && beats.every((beat) => beatResolved(beat.id, outcomes));
}

export function practiceChecklistSummary(
  beats: { id: string }[],
  outcomes: Record<string, string>,
): { done: number; total: number } {
  return {
    total: beats.length,
    done: beats.filter((beat) => beatResolved(beat.id, outcomes)).length,
  };
}

/** Next beat that has not been answered. Story order is linear. */
export function nextUnresolvedBeat(
  beats: StoryBeat[],
  outcomes: Record<string, string>,
  fromIndex = 0,
): number {
  for (let i = Math.max(0, fromIndex); i < beats.length; i++) {
    if (beatResolved(beats[i].id, outcomes)) continue;
    return i;
  }
  return -1;
}
