import type { ConvoGoal } from './types';

export type TeachBeat = {
  character_tl: string;
  character_ar: string;
  coach_eg: string;
  ask_tl: string;
  ask_ar: string;
};

/**
 * Authored teaching beat for a goal (v4).
 * Character teach line → coach meaning → ask_tl. Model never invents teach.
 */
export function teachBeatForGoal(goal: ConvoGoal): TeachBeat | null {
  const teach = goal.teach;
  if (!teach?.tl?.trim() || !teach.meaning_eg?.trim()) return null;
  if (!goal.ask_tl?.trim()) return null;
  return {
    character_tl: teach.tl.trim(),
    character_ar: teach.ar?.trim() || '',
    coach_eg: teach.meaning_eg.trim(),
    ask_tl: goal.ask_tl.trim(),
    ask_ar: goal.ask_ar?.trim() || '',
  };
}

export function goalNeedsTeach(goal: ConvoGoal, teachingMode: boolean): boolean {
  return teachingMode && teachBeatForGoal(goal) != null;
}
