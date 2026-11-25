/**
 * مراجعة النهارده session fill (16 §5.2–5.8).
 */

import type { CoveragePair, CoveragePlan } from './coverage';
import {
  buildReviewStepVariants,
  normLabel,
  type BankItem,
  type BuiltStep,
  type CraftedQuestion,
} from './stepBuilders';
import { estimatedSecondsForType } from './stepTimes';
import { REVIEW_ROUND_MINUTES, reviewRounds } from './budget';
import { seededShuffle } from './chatQuestion';
import type { WindowLesson } from './window';

export type ReviewSlotReason =
  | 'last_chance'
  | 'weak'
  | 'grammar'
  | 'cumulative_grammar'
  | 'plan'
  | 'retest'
  | 'maint';

export type ReviewSessionStep = BuiltStep & {
  /** Item family used for caps and spacing (build-time only). */
  family?: string;
  slot_reason: ReviewSlotReason;
  round: number;
  pairs: Array<{ item_id: string; skill: string }>;
};

export type BuildReviewSessionInput = {
  window: WindowLesson[];
  budgetMinutes: number;
  plans: CoveragePlan[];
  itemsByDay: Map<number, BankItem[]>;
  craftedByDay: Map<number, CraftedQuestion[]>;
  taughtItems: BankItem[];
  currentDay: number;
  todayCardIds?: Set<string>;
  recentQuestionIds?: Set<string>;
  /** Flagged practice-question ids — never picked (16 §5.6). */
  flaggedQuestionIds?: Set<string>;
  /** Open problem pattern ids → need ≥2 steps each. */
  openProblemPatternIds?: string[];
  /** Patterns taught before the window (for cumulative grammar). */
  olderPatterns?: BankItem[];
  weakItemIds?: Set<string>;
  knownMistakeTiles?: string[];
  /**
   * Seed for the mix order (user + local date, plus a nonce on regenerate).
   * Same seed → same session; a new seed → a new mix of the same steps.
   */
  seed?: string;
};

const GRAMMAR_TYPES = new Set([
  'fill_blank_choice',
  'fill_blank_write',
  'build_sentence',
  'translate_write',
  'reply_write',
  'reply_speak',
]);

/** An item (or a pattern and all its example sentences) at most twice a session; patterns 3×. */
const MAX_STEPS_PER_FAMILY = 2;
/** Steps on the same family are at least this many steps apart. */
const FAMILY_GAP = 6;
/** Sentences that start the same way (Chamo-me …, Boa …) are this far apart. */
const STEM_GAP = 2;

/**
 * Items that test the same thing: a pattern and its example sentences
 * (`pattern.x.ex.n` → `pattern.x`) are one family.
 */
export function familyKey(itemId: string, tl?: string): string {
  const m = /^(.*)\.ex\.\d+$/.exec(itemId);
  if (m) return m[1]!;
  // Short sentences built on the same frame (Chamo-me Rita / Omar / Inês,
  // Boa tarde / Boa noite) test the same thing: one family.
  const words = (tl ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length <= 3) {
    return `frame:${normLabel(words[0]!)}`;
  }
  return itemId;
}

/** Family of a built step (uses its sentence for the frame rule). */
function familyOfStep(step: { item_id: string; family?: string }): string {
  return step.family ?? familyKey(step.item_id);
}

/** First word of the step's sentence (only for 2+ word sentences). */
function stemKey(step: ReviewSessionStep): string {
  const acc = Array.isArray(step.payload.accepted) ? String(step.payload.accepted[0] ?? '') : '';
  const words = acc.trim().split(/\s+/).filter(Boolean);
  return words.length >= 2 ? `stem:${normLabel(words[0]!)}` : `fam:${familyKey(step.item_id)}`;
}

function skillsForPosition(pos: 1 | 2 | 3): CoveragePair['skill'][] {
  if (pos === 1) return ['listening', 'recognition'];
  if (pos === 2) return ['building', 'writing'];
  return ['speaking', 'use', 'listening', 'writing', 'building', 'recognition'];
}

function isGrammarStep(step: BuiltStep): boolean {
  return GRAMMAR_TYPES.has(step.type) || step.skill === 'building' || step.skill === 'recognition' || step.skill === 'use';
}

/**
 * Fill a review session to the time budget with priority order §5.3.
 */
export function buildReviewSession(
  input: BuildReviewSessionInput,
): {
  steps: ReviewSessionStep[];
  rounds_total: number;
  budget_minutes: number;
} {
  const budgetSec = input.budgetMinutes * 60;
  const roundMins = reviewRounds(input.budgetMinutes, REVIEW_ROUND_MINUTES);
  const roundsTotal = Math.max(1, roundMins.length);

  const candidates: Array<{
    pair: CoveragePair;
    lesson_day: number;
    position: 1 | 2 | 3;
    reason: ReviewSlotReason;
  }> = [];

  const planByDay = new Map(input.plans.map((p) => [p.lesson_day, p]));

  // 1. Last chance (position 3 uncovered)
  for (const w of input.window) {
    if (w.position !== 3) continue;
    const plan = planByDay.get(w.day);
    for (const pair of plan?.pairs ?? []) {
      if (pair.status === 'open') {
        candidates.push({
          pair,
          lesson_day: w.day,
          position: 3,
          reason: 'last_chance',
        });
      }
    }
  }

  // 2. Weak
  for (const w of input.window) {
    const plan = planByDay.get(w.day);
    for (const pair of plan?.pairs ?? []) {
      if (
        pair.status === 'open' &&
        input.weakItemIds?.has(pair.item_id)
      ) {
        candidates.push({
          pair,
          lesson_day: w.day,
          position: w.position,
          reason: 'weak',
        });
      }
    }
  }
  for (const pid of input.openProblemPatternIds ?? []) {
    candidates.push({
      pair: { item_id: pid, skill: 'recognition', status: 'open' },
      lesson_day: input.window[0]?.day ?? input.currentDay,
      position: 1,
      reason: 'weak',
    });
    candidates.push({
      pair: { item_id: pid, skill: 'building', status: 'open' },
      lesson_day: input.window[0]?.day ?? input.currentDay,
      position: 2,
      reason: 'weak',
    });
  }

  // 3–4. Plan pairs by position skills + grammar preference
  for (const w of input.window) {
    const plan = planByDay.get(w.day);
    const allowed = new Set(skillsForPosition(w.position));
    for (const pair of plan?.pairs ?? []) {
      if (pair.status !== 'open') continue;
      if (!allowed.has(pair.skill) && w.position !== 3) continue;
      const reason: ReviewSlotReason =
        pair.skill === 'building' ||
        pair.skill === 'recognition' ||
        pair.skill === 'use'
          ? 'grammar'
          : 'plan';
      candidates.push({
        pair,
        lesson_day: w.day,
        position: w.position,
        reason,
      });
    }
  }

  // Cumulative grammar 1–3
  const older = input.olderPatterns ?? [];
  for (const p of older.slice(0, 3)) {
    candidates.push({
      pair: { item_id: p.id, skill: 'recognition', status: 'open' },
      lesson_day: p.day,
      position: 1,
      reason: 'cumulative_grammar',
    });
  }

  const seen = new Set<string>();
  const built: ReviewSessionStep[] = [];
  let used = 0;
  let grammarSec = 0;
  // Variety: how often each form is used, and what each item family got.
  const typeCount = new Map<string, number>();
  const familySteps = new Map<string, Array<{ type: string; skill: string }>>();
  const itemStepCount = new Map<string, number>();

  const tryAdd = (
    c: (typeof candidates)[0],
    forceReason?: ReviewSlotReason,
  ): boolean => {
    // One step per item × skill, whatever the reason it was picked for.
    const key = `${c.pair.item_id}|${c.pair.skill}`;
    if (seen.has(key)) return false;

    const items = input.itemsByDay.get(c.lesson_day) ?? input.taughtItems;
    const item =
      items.find((i) => i.id === c.pair.item_id) ??
      input.taughtItems.find((i) => i.id === c.pair.item_id);
    if (!item) return false;
    const family = familyKey(c.pair.item_id, item.tl);
    const famPrev = familySteps.get(family) ?? [];
    // Patterns and frames (several items) get one more step.
    const cap = family.startsWith('pattern.') || family.startsWith('frame:')
      ? MAX_STEPS_PER_FAMILY + 1
      : MAX_STEPS_PER_FAMILY;
    if (famPrev.length >= cap) return false;
    // And any single item at most twice (patterns 3×), even inside a frame.
    const itemPrev = itemStepCount.get(c.pair.item_id) ?? 0;
    const itemCap = item.type === 'pattern' ? MAX_STEPS_PER_FAMILY + 1 : MAX_STEPS_PER_FAMILY;
    if (itemPrev >= itemCap) return false;
    const variants = buildReviewStepVariants({
      item: { ...item, day: c.lesson_day },
      skill: c.pair.skill,
      taughtItems: input.taughtItems,
      currentDay: input.currentDay,
      crafted: input.craftedByDay.get(c.lesson_day),
      todayCardIds: input.todayCardIds,
      recentQuestionIds: input.recentQuestionIds,
      flaggedQuestionIds: input.flaggedQuestionIds,
      knownMistakeTiles: input.knownMistakeTiles,
    }).filter((v) => {
      if (v.payload.use === 'lesson') return false;
      const qid = v.question_id ?? String(v.payload.question_id ?? v.payload.id ?? '');
      if (qid && input.flaggedQuestionIds?.has(qid)) return false;
      if (qid && input.recentQuestionIds?.has(qid)) return false;
      // The item's next step must be a different form and a different skill
      // (a grammar pattern may repeat the grammar skill, never the form).
      return !famPrev.some(
        (p) =>
          p.type === v.type ||
          (p.skill === String(v.payload.skill ?? '') && p.skill !== 'grammar'),
      );
    });
    // Least-used form first (keeps the session varied), builder order on ties.
    const step = variants
      .map((v, i) => ({ v, i, n: typeCount.get(v.type) ?? 0 }))
      .sort((a, b) => a.n - b.n || a.i - b.i)[0]?.v;
    if (!step) return false;
    if (used + step.estimated_seconds > budgetSec && built.length > 0) {
      return false;
    }
    seen.add(key);
    typeCount.set(step.type, (typeCount.get(step.type) ?? 0) + 1);
    itemStepCount.set(c.pair.item_id, itemPrev + 1);
    familySteps.set(family, [
      ...famPrev,
      { type: step.type, skill: String(step.payload.skill ?? '') },
    ]);
    used += step.estimated_seconds;
    if (isGrammarStep(step)) grammarSec += step.estimated_seconds;
    built.push({
      ...step,
      family,
      slot_reason: forceReason ?? c.reason,
      round: 1,
      pairs: [{ item_id: c.pair.item_id, skill: c.pair.skill }],
    });
    return true;
  };

  // Priority order of reasons
  const order: ReviewSlotReason[] = [
    'last_chance',
    'weak',
    'grammar',
    'cumulative_grammar',
    'plan',
    'retest',
    'maint',
  ];
  for (const reason of order) {
    for (const c of candidates.filter((x) => x.reason === reason)) {
      if (used >= budgetSec) break;
      tryAdd(c);
    }
  }

  // Ensure ≥40% grammar time by adding grammar candidates if short
  const minGrammar = Math.floor(budgetSec * 0.4);
  if (grammarSec < minGrammar) {
    for (const c of candidates.filter(
      (x) => x.reason === 'grammar' || x.reason === 'cumulative_grammar',
    )) {
      if (grammarSec >= minGrammar || used >= budgetSec) break;
      tryAdd(c, 'grammar');
    }
  }

  // Mixed-pattern once ≥2 patterns taught
  const patterns = input.taughtItems.filter((i) => i.type === 'pattern');
  if (patterns.length >= 2) {
    const olderP = patterns[patterns.length - 1]!;
    const newer = patterns[0]!;
    const crafted = [
      ...(input.craftedByDay.get(newer.day) ?? []),
      ...(input.craftedByDay.get(olderP.day) ?? []),
    ].find(
      (q) =>
        q.use !== 'lesson' &&
        q.tests?.includes(newer.id) &&
        q.tests?.includes(olderP.id),
    );
    if (crafted && used + estimatedSecondsForType(crafted.type) <= budgetSec) {
      built.push({
        kind: 'question',
        type: crafted.type,
        item_id: newer.id,
        lesson_day: newer.day,
        skill: 'use',
        estimated_seconds: estimatedSecondsForType(crafted.type),
        payload: { ...crafted, origin: 'crafted' },
        slot_reason: 'grammar',
        round: 1,
        pairs: [
          { item_id: newer.id, skill: 'use' },
          { item_id: olderP.id, skill: 'use' },
        ],
      });
    }
  }

  // Priority decided WHICH steps are in today's session; the order is mixed
  // across lessons so a round never walks one lesson item by item.
  const seed = input.seed ?? 'review';
  const mixed = mixAcrossLessons(built, seed);
  // Keep the "≥2 weak in round 1" rule after mixing.
  const weakFirst = pullForward(mixed, (s) => s.slot_reason === 'weak', 2, 4);
  const withRounds = assignRounds(weakFirst, roundMins, seed);
  return {
    steps: withRounds,
    rounds_total: roundsTotal,
    budget_minutes: input.budgetMinutes,
  };
}

/**
 * Interleave steps from different lessons: each lesson's steps are shuffled
 * (seeded), then taken round-robin with the lesson order reshuffled every
 * cycle. Two steps on the same item never sit next to each other when it
 * can be avoided.
 */
export function mixAcrossLessons<T extends { lesson_day: number; item_id: string }>(
  steps: T[],
  seed: string,
): T[] {
  if (steps.length <= 2) return steps;
  const groups = new Map<number, T[]>();
  for (const s of steps) {
    const g = groups.get(s.lesson_day) ?? [];
    g.push(s);
    groups.set(s.lesson_day, g);
  }
  const queues = new Map<number, T[]>();
  for (const [day, g] of groups) {
    queues.set(day, spreadItems(seededShuffle(g, `${seed}:lesson:${day}`)));
  }
  const out: T[] = [];
  let cycle = 0;
  while ([...queues.values()].some((q) => q.length)) {
    const days = seededShuffle(
      [...queues.keys()].filter((d) => queues.get(d)!.length),
      `${seed}:cycle:${cycle++}`,
    );
    // Don't start a cycle with the lesson that ended the previous one.
    const lastDay = out[out.length - 1]?.lesson_day;
    if (days.length > 1 && days[0] === lastDay) days.push(days.shift()!);
    for (const d of days) {
      const q = queues.get(d)!;
      const last = out[out.length - 1];
      let i = q.findIndex((s) => s.item_id !== last?.item_id);
      if (i < 0) i = 0;
      out.push(q.splice(i, 1)[0]!);
    }
  }
  return out;
}

/** Same lesson: avoid the same item twice in a row. */
function spreadItems<T extends { item_id: string }>(steps: T[]): T[] {
  const out: T[] = [];
  const rest = [...steps];
  while (rest.length) {
    const last = out[out.length - 1];
    let i = rest.findIndex((s) => s.item_id !== last?.item_id);
    if (i < 0) i = 0;
    out.push(rest.splice(i, 1)[0]!);
  }
  return out;
}

/** Move up to `n` matching steps into the first `within` positions. */
function pullForward<T>(
  steps: T[],
  match: (s: T) => boolean,
  n: number,
  within: number,
): T[] {
  const already = steps.slice(0, within).filter(match).length;
  if (already >= n) return steps;
  const out = [...steps];
  let need = n - already;
  for (let i = within; i < out.length && need > 0; i++) {
    if (match(out[i]!)) {
      const [s] = out.splice(i, 1);
      out.splice(Math.min(1 + (n - need) * 2, within - 1), 0, s!);
      need -= 1;
    }
  }
  return out;
}

function assignRounds(
  steps: ReviewSessionStep[],
  roundMins: number[],
  seed = 'review',
): ReviewSessionStep[] {
  if (!steps.length) return steps;
  const caps = roundMins.map((m) => m * 60);
  const out: ReviewSessionStep[] = [];
  let ri = 0;
  let usedInRound = 0;
  const roundBuckets: ReviewSessionStep[][] = roundMins.map(() => []);

  for (const s of steps) {
    if (
      ri < caps.length - 1 &&
      usedInRound + s.estimated_seconds > caps[ri]! &&
      roundBuckets[ri]!.length > 0
    ) {
      ri += 1;
      usedInRound = 0;
    }
    const step = { ...s, round: ri + 1 };
    roundBuckets[ri]!.push(step);
    usedInRound += s.estimated_seconds;
  }

  roundBuckets.forEach((bucket, i) => {
    out.push(...orderInsideRound(bucket, `${seed}:round:${i + 1}`));
  });
  // Spacing beats round edges: space the whole session, then cut rounds
  // again by time, so a step may slide into the next round to keep its gap.
  return recutRounds(spaceOut(out), caps);
}

/** Re-number rounds by time caps after reordering (order unchanged). */
function recutRounds(
  steps: ReviewSessionStep[],
  caps: number[],
): ReviewSessionStep[] {
  let ri = 0;
  let used = 0;
  let inRound = 0;
  return steps.map((s) => {
    if (ri < caps.length - 1 && used + s.estimated_seconds > caps[ri]! && inRound > 0) {
      ri += 1;
      used = 0;
      inRound = 0;
    }
    used += s.estimated_seconds;
    inRound += 1;
    return { ...s, round: ri + 1 };
  });
}

/**
 * Final pass over the whole session, round by round. At each position take
 * the earliest remaining step of the round that keeps the rules, relaxing
 * them only when nothing fits:
 *   1. same family not in the last FAMILY_GAP steps, same sentence start not
 *      in the last STEM_GAP, a different form and a different lesson than
 *      the step before;
 *   2. family gap + different form;
 *   3. family not in the last 3;
 *   4. anything.
 * So a question never shows up again in another form while its answer is
 * still on screen.
 */
export function spaceOut(steps: ReviewSessionStep[]): ReviewSessionStep[] {
  const out: ReviewSessionStep[] = [];
  const rest = [...steps];
  const lastAt = new Map<string, number>(); // family → last position
  const stemAt = new Map<string, number>();
  while (rest.length) {
    const pos = out.length;
    const last = out[pos - 1];
    const typeRun3 = (t: string) => {
      const l3 = out.slice(-3);
      return l3.length === 3 && l3.every((x) => x.type === t);
    };
    const typeLeft = new Map<string, number>();
    for (const r of rest) typeLeft.set(r.type, (typeLeft.get(r.type) ?? 0) + 1);
    let best = 0;
    let bestScore = -Infinity;
    rest.forEach((s, i) => {
      const f = familyOfStep(s);
      const famDist = lastAt.has(f) ? pos - lastAt.get(f)! : Infinity;
      const stemDist = stemAt.has(stemKey(s)) ? pos - stemAt.get(stemKey(s))! : Infinity;
      let score = 0;
      // The gap matters most: a family inside the gap is heavily penalised,
      // and the closer it is the worse.
      score += famDist > FAMILY_GAP ? 100 : famDist * 12;
      if (stemDist > STEM_GAP) score += 6;
      if (s.type !== last?.type) score += 20;
      if (typeRun3(s.type)) score -= 40;
      if (s.lesson_day !== last?.lesson_day) score += 4;
      // Spread the most common forms out instead of leaving them for the end.
      score += 3 * (typeLeft.get(s.type) ?? 0);
      // Families with a second step still waiting go early, so their gap fits.
      if (rest.some((o, k) => k !== i && familyOfStep(o) === f)) score += 3;
      // Keep the planned order (rounds, easy → hard) when scores tie.
      score -= i * 0.4;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    const [s] = rest.splice(best, 1);
    lastAt.set(familyOfStep(s!), pos);
    stemAt.set(stemKey(s!), pos);
    out.push(s!);
  }
  return out;
}

function orderInsideRound(
  steps: ReviewSessionStep[],
  seed = 'round',
): ReviewSessionStep[] {
  if (steps.length <= 1) return steps;
  const easy = steps.filter(
    (s) =>
      s.kind === 'find_image' ||
      s.type.includes('pick') ||
      s.type.includes('choice') ||
      s.type.startsWith('listen_'),
  );
  const mid = steps.filter(
    (s) =>
      !easy.includes(s) &&
      (s.type.includes('write') ||
        s.type === 'dictation' ||
        s.type === 'build_sentence'),
  );
  const use = steps.filter((s) => !easy.includes(s) && !mid.includes(s));
  // Easy → building/writing → use, each tier mixed across lessons.
  const ordered = [
    ...mixAcrossLessons(easy, `${seed}:easy`),
    ...mixAcrossLessons(mid, `${seed}:mid`),
    ...mixAcrossLessons(use, `${seed}:use`),
  ];
  // Ensure at least one grammar
  if (!ordered.some(isGrammarStep)) {
    const g = steps.find(isGrammarStep);
    if (g) ordered.splice(Math.min(1, ordered.length), 0, g);
  }
  // No more than 3 of same type in a row
  return spreadTypes(ordered);
}

/**
 * Final pass, greedy: prefer the next step that changes lesson and item and
 * doesn't make a 4th same type in a row; relax the rules one by one when no
 * step fits. Keeps the easy → hard order as much as possible.
 */
function spreadTypes(steps: ReviewSessionStep[]): ReviewSessionStep[] {
  const out: ReviewSessionStep[] = [];
  const rest = [...steps];
  const typeRunOk = (s: ReviewSessionStep) => {
    const last3 = out.slice(-3);
    return !(last3.length === 3 && last3.every((x) => x.type === s.type));
  };
  const rules: Array<(s: ReviewSessionStep) => boolean> = [
    (s) => {
      const last = out[out.length - 1];
      return (
        typeRunOk(s) &&
        s.lesson_day !== last?.lesson_day &&
        s.item_id !== last?.item_id
      );
    },
    (s) => typeRunOk(s) && s.item_id !== out[out.length - 1]?.item_id,
    (s) => typeRunOk(s),
  ];
  while (rest.length) {
    let i = -1;
    for (const rule of rules) {
      // Look a few steps ahead only, so tiers stay in order.
      i = rest.slice(0, 4).findIndex(rule);
      if (i >= 0) break;
    }
    if (i < 0) i = 0;
    out.push(rest.splice(i, 1)[0]!);
  }
  return out;
}

export function grammarTimeShare(steps: ReviewSessionStep[]): number {
  const total = steps.reduce((s, x) => s + x.estimated_seconds, 0);
  if (!total) return 0;
  const g = steps
    .filter(isGrammarStep)
    .reduce((s, x) => s + x.estimated_seconds, 0);
  return g / total;
}
