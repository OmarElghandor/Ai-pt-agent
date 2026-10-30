import { isAllowedCharacterTl } from '@/lib/v2/generation/pack/characterTl';
import { distractorsAbsentFromArtifact } from '@/lib/v2/generation/pack/reading';
import type { Item } from './items';
import {
  PracticePackDataSchema,
  type PackBeat,
  type PracticePackData,
  type SkillMix,
} from './pack';
import type { Issue } from './validate';

function issue(
  path: string,
  rule: string,
  message: string,
  severity: Issue['severity'] = 'error',
): Issue {
  return { path, rule, message, severity };
}

function phraseRole(item: Item | undefined): 'heard' | 'said' | null {
  if (!item || item.type !== 'phrase') return null;
  const role = (item as { role?: string }).role;
  if (role === 'heard' || role === 'said') return role;
  return null;
}

export type ValidatePackResult = {
  ok: boolean;
  issues: Issue[];
};

/**
 * Validate a practice pack against bank items (day + known).
 */
export function validatePracticePack(
  raw: unknown,
  opts: { items: Item[]; knownIds?: Set<string> },
): ValidatePackResult {
  const issues: Issue[] = [];
  const parsed = PracticePackDataSchema.safeParse(raw);
  if (!parsed.success) {
    for (const e of parsed.error.issues) {
      issues.push(
        issue(e.path.join('.') || '(root)', 'schema', e.message, 'error'),
      );
    }
    return { ok: false, issues };
  }
  const pack = parsed.data;
  const byId = new Map(opts.items.map((i) => [i.id, i]));
  const known = opts.knownIds ?? new Set(byId.keys());

  if (pack.beats.length < 8 || pack.beats.length > 14) {
    issues.push(
      issue(
        'beats',
        'count',
        `need 8–14 beats, got ${pack.beats.length}`,
        'error',
      ),
    );
  }

  const counts = { speaking: 0, listening: 0, reading: 0, writing: 0 };
  for (const beat of pack.beats) {
    counts[beat.skill] += 1;
    validateBeat(beat, byId, known, issues);
  }

  for (const skill of Object.keys(counts) as (keyof typeof counts)[]) {
    if (counts[skill] < 1) {
      issues.push(
        issue(
          'beats',
          'skill_mix',
          `need at least one ${skill} beat`,
          'error',
        ),
      );
    }
  }

  const expected = skillMixCounts(pack.beats.length, pack.skill_mix);
  for (const skill of Object.keys(expected) as (keyof typeof expected)[]) {
    const got = counts[skill] ?? 0;
    const want = expected[skill] ?? 0;
    if (Math.abs(got - want) > 2) {
      issues.push(
        issue(
          'beats',
          'skill_mix',
          `expected ~${want} ${skill}, got ${got}`,
          'warning',
        ),
      );
    }
  }

  const ids = new Set<string>();
  const ns = `pack.d${String(pack.day).padStart(2, '0')}.`;
  for (const beat of pack.beats) {
    if (ids.has(beat.id)) {
      issues.push(issue(`beats.${beat.id}`, 'id', 'duplicate beat id', 'error'));
    }
    ids.add(beat.id);
    if (!beat.id.startsWith(ns)) {
      issues.push(
        issue(
          `beats.${beat.id}`,
          'id',
          `beat id must be namespaced ${ns}…`,
          'warning',
        ),
      );
    }
  }

  const hard = issues.some((i) => i.severity === 'error');
  return { ok: !hard, issues };
}

function validateBeat(
  beat: PackBeat,
  byId: Map<string, Item>,
  known: Set<string>,
  issues: Issue[],
) {
  const base = `beats.${beat.id}`;
  for (const id of [...beat.prompt_ids, ...beat.expected_ids]) {
    if (!known.has(id) && !byId.has(id)) {
      issues.push(issue(base, 'item_id', `unknown item id ${id}`, 'error'));
    }
  }
  for (const id of beat.prompt_ids) {
    const role = phraseRole(byId.get(id));
    if (role === 'said') {
      issues.push(
        issue(
          `${base}.prompt_ids`,
          'heard_said',
          `prompt_ids must be heard (or non-phrase); ${id} is said`,
          'error',
        ),
      );
    }
  }
  for (const id of beat.expected_ids) {
    const role = phraseRole(byId.get(id));
    if (role === 'heard') {
      issues.push(
        issue(
          `${base}.expected_ids`,
          'heard_said',
          `expected_ids must be said (or non-phrase); ${id} is heard`,
          'error',
        ),
      );
    }
  }

  if (beat.skill === 'listening') {
    if (!beat.audio_tl?.trim()) {
      issues.push(
        issue(`${base}.audio_tl`, 'listening', 'needs audio_tl', 'error'),
      );
    }
    if (!beat.question_eg?.trim()) {
      issues.push(
        issue(`${base}.question_eg`, 'listening', 'needs question_eg', 'error'),
      );
    }
    const opts = beat.options ?? [];
    if (opts.length < 2) {
      issues.push(
        issue(`${base}.options`, 'listening', 'needs ≥2 options', 'error'),
      );
    } else if (opts.filter((o) => o.correct).length !== 1) {
      issues.push(
        issue(
          `${base}.options`,
          'listening',
          'exactly one correct option',
          'error',
        ),
      );
    }
  }

  if (beat.skill === 'reading') {
    if (!beat.artifact) {
      issues.push(
        issue(`${base}.artifact`, 'reading', 'needs artifact', 'error'),
      );
    }
    if (!beat.question_eg?.trim()) {
      issues.push(
        issue(`${base}.question_eg`, 'reading', 'needs question_eg', 'error'),
      );
    }
    const opts = beat.options ?? [];
    if (opts.length < 2) {
      issues.push(
        issue(`${base}.options`, 'reading', 'needs ≥2 options', 'error'),
      );
    } else if (opts.filter((o) => o.correct).length !== 1) {
      issues.push(
        issue(
          `${base}.options`,
          'reading',
          'exactly one correct option',
          'error',
        ),
      );
    } else if (
      beat.artifact &&
      /أول|آخر/.test(beat.question_eg ?? '') &&
      !distractorsAbsentFromArtifact(beat.artifact, opts)
    ) {
      issues.push(
        issue(
          `${base}.options`,
          'reading_distractors',
          'first/last: no incorrect option may appear in the artifact',
          'error',
        ),
      );
    }
  }

  if (beat.skill === 'speaking' || beat.skill === 'writing') {
    if (!beat.expected_tl?.trim() && beat.expected_ids.length === 0) {
      issues.push(
        issue(
          `${base}.expected_tl`,
          beat.skill,
          'needs expected_tl or expected_ids',
          'error',
        ),
      );
    }
  }

  if (beat.next_character_tl?.trim()) {
    const bank = [...byId.values()];
    if (!isAllowedCharacterTl(beat.next_character_tl, bank)) {
      issues.push(
        issue(
          `${base}.next_character_tl`,
          'character_tl',
          'must be bank or function words; Ok. is not allowed',
          'error',
        ),
      );
    }
  }
}

export function skillMixCounts(
  total: number,
  mix: SkillMix = {
    speaking: 0.3,
    listening: 0.3,
    reading: 0.2,
    writing: 0.2,
  },
): Record<'speaking' | 'listening' | 'reading' | 'writing', number> {
  const keys = ['speaking', 'listening', 'reading', 'writing'] as const;
  const exact = keys.map((k) => ({ k, n: mix[k] * total }));
  const floors = exact.map((e) => ({ k: e.k, n: Math.floor(e.n) }));
  let assigned = floors.reduce((s, f) => s + f.n, 0);
  for (const f of floors) {
    if (f.n < 1) {
      f.n = 1;
      assigned += 1;
    }
  }
  let rem = total - assigned;
  const order = exact
    .map((e) => ({ k: e.k, frac: e.n - Math.floor(e.n) }))
    .sort((a, b) => b.frac - a.frac);
  let oi = 0;
  while (rem > 0 && oi < 40) {
    const slot = floors.find((f) => f.k === order[oi % order.length]!.k)!;
    slot.n += 1;
    rem -= 1;
    oi += 1;
  }
  while (rem < 0) {
    const slot = floors.find((f) => f.n > 1);
    if (!slot) break;
    slot.n -= 1;
    rem += 1;
  }
  return Object.fromEntries(floors.map((f) => [f.k, f.n])) as Record<
    'speaking' | 'listening' | 'reading' | 'writing',
    number
  >;
}

export type { PracticePackData };
