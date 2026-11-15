import type { RoleplayLine } from './types';

export type RoleplayGender = 'm' | 'f';

/** Pick gendered TL/AR forms when the learner is female. */
export function pickLine(
  line: RoleplayLine | null | undefined,
  gender: RoleplayGender,
): { tl: string; ar: string } | null {
  if (!line) return null;
  const tl =
    gender === 'f' && line.tl_f && line.tl_f.trim() ? line.tl_f : line.tl;
  const ar =
    gender === 'f' && line.ar_f && line.ar_f.trim() ? line.ar_f : line.ar;
  return { tl, ar };
}

/**
 * Substitute `{name}` with the learner name. When unknown, drop the
 * placeholder and a neighbouring comma (e.g. «Olá, {name}!» → «Olá!»).
 */
export function applyLearnerName(text: string, name: string | null | undefined): string {
  if (!text.includes('{name}')) return text;
  const n = name?.trim();
  if (n) return text.replaceAll('{name}', n);
  return text
    .replace(/\s*,\s*\{name\}/g, '')
    .replace(/\{name\}\s*,\s*/g, '')
    .replace(/\{name\}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function pickChips(
  chips: string[],
  chips_f: string[] | undefined,
  gender: RoleplayGender,
): string[] {
  if (gender === 'f' && chips_f && chips_f.length > 0) return [...chips_f];
  return [...chips];
}

/** Character line for a step: always `step.says` (null when the step has none). */
export function characterSays(
  step: { says: RoleplayLine | null },
  gender: RoleplayGender,
  name?: string | null,
): { tl: string; ar: string } | null {
  const picked = pickLine(step.says, gender);
  if (!picked) return null;
  return {
    tl: applyLearnerName(picked.tl, name),
    ar: applyLearnerName(picked.ar, name),
  };
}
