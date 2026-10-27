import type { Skill } from '@/lib/v2/content/lesson';
import type { ItemLevels, ItemState } from './types';

export function emptyLevels(): ItemLevels {
  return { heard: 0, understood: 0, said: 0, used: 0 };
}

/**
 * Accent-only and fully correct answers count toward levels.
 * Mapping (00/03): listening → heard, reading → understood,
 * speaking/writing → said.
 */
export function bumpLevelsForSkill(
  state: ItemState,
  skill: Skill,
  correct: boolean,
): ItemState {
  if (!correct) return state;
  const levels = { ...state.levels };
  if (skill === 'listening') levels.heard += 1;
  else if (skill === 'reading') levels.understood += 1;
  else if (skill === 'speaking' || skill === 'writing') levels.said += 1;
  return { ...state, levels };
}

/** Home “بتفهم N · بتقول M”: understood>=2 / said>=2 item counts. */
export function countHomeNumbers(states: ItemState[]): {
  understands: number;
  says: number;
} {
  let understands = 0;
  let says = 0;
  for (const s of states) {
    if (s.levels.understood >= 2 || s.levels.heard >= 2) understands += 1;
    if (s.levels.said >= 2) says += 1;
  }
  return { understands, says };
}
