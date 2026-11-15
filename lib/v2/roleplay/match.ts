import { matchesAcceptedForm } from '@/lib/v2/convo/correction/shouldFire';
import {
  normalizeRoleplayText,
  normalizedContains,
  roleplayWords,
} from './normalize';
import type { RoleplayOption, RoleplayStep } from './types';

export type RoleplayMatchHit = {
  step_id: string;
  option: RoleplayOption | null;
  stay: boolean;
  slot: string | null;
  slot_value: string | null;
  via: 'option' | 'keyword' | 'example' | 'free_answer';
};

function isStopwordOnly(msg: string): boolean {
  const words = roleplayWords(msg);
  if (words.length === 0) return true;
  const stops = new Set([
    'sim',
    'nao',
    'não',
    'ok',
    'ja',
    'já',
    'ah',
    'oh',
    'ei',
  ]);
  return words.every((w) => stops.has(w) || w.length <= 1);
}

/**
 * Fuzzy example match. Spec: fuzzy-match an example of at least 2 words.
 * Reuses accepted-form exactness; blocks lone stopwords from matching long examples.
 */
export function fuzzyMatchRoleplayExample(
  learnerText: string,
  example: string,
): boolean {
  if (matchesAcceptedForm(learnerText, [example])) return true;
  const msg = normalizeRoleplayText(learnerText);
  const ex = normalizeRoleplayText(example);
  if (!msg || !ex) return false;

  const exWords = ex.split(/\s+/).filter(Boolean);
  // Spec: examples of at least 2 words for fuzzy path.
  if (exWords.length < 2 && msg !== ex) return false;

  if (msg.includes(ex)) return true;

  const msgWords = msg.split(/\s+/).filter(Boolean);
  if (
    ex.includes(msg) &&
    !isStopwordOnly(msg) &&
    msgWords.length >= 2
  ) {
    return true;
  }

  // Token overlap for substantial paraphrases (≥2 content hits when example ≥3 tokens).
  if (isStopwordOnly(msg)) return false;
  const msgSet = new Set(msgWords);
  const content = exWords.filter((t) => t.length > 2);
  if (content.length === 0) {
    return exWords.length > 0 && exWords.every((t) => msg.includes(t));
  }
  const hits = content.filter((t) => msgSet.has(t)).length;
  const need =
    content.length <= 2 ? content.length : Math.ceil(content.length * 0.6);
  return hits >= need;
}

export function hasRoleplayKeyword(
  learnerText: string,
  keywords: string[],
): boolean {
  if (!keywords.length) return false;
  for (const kw of keywords) {
    if (normalizedContains(learnerText, kw)) return true;
  }
  return false;
}

function matchOption(
  learnerText: string,
  options: RoleplayOption[],
): RoleplayOption | null {
  for (const opt of options) {
    if (hasRoleplayKeyword(learnerText, opt.keywords ?? [])) {
      return opt;
    }
  }
  return null;
}

/** Match a single step. Options are checked in order; first wins. */
export function matchRoleplayStep(
  learnerText: string,
  step: RoleplayStep,
): RoleplayMatchHit | null {
  const t = learnerText.trim();
  if (!t) return null;

  const exp = step.expects;
  const options = exp.options ?? [];

  if (options.length > 0) {
    const opt = matchOption(t, options);
    if (opt) {
      return {
        step_id: step.id,
        option: opt,
        stay: Boolean(opt.stay),
        slot: exp.slot ?? null,
        slot_value: opt.value,
        via: 'option',
      };
    }
    // With options, still allow example / step-keyword / free_answer completion
    // without setting a slot when no option fires — rare, but keeps examples usable.
  }

  const examples = [
    ...(exp.examples_tl ?? []),
    ...(exp.examples_tl_f ?? []),
  ];
  if (examples.some((ex) => fuzzyMatchRoleplayExample(t, ex))) {
    return {
      step_id: step.id,
      option: null,
      stay: false,
      slot: null,
      slot_value: null,
      via: 'example',
    };
  }

  if (hasRoleplayKeyword(t, exp.keywords ?? [])) {
    return {
      step_id: step.id,
      option: null,
      stay: false,
      slot: null,
      slot_value: null,
      via: 'keyword',
    };
  }

  if (exp.free_answer) {
    const words = roleplayWords(t);
    if (words.length > 0) {
      return {
        step_id: step.id,
        option: null,
        stay: false,
        slot: null,
        slot_value: null,
        via: 'free_answer',
      };
    }
  }

  return null;
}

function matchedKeywordsForHit(
  learnerText: string,
  hit: RoleplayMatchHit,
  step: RoleplayStep,
): string[] {
  const pool =
    hit.option?.keywords ??
    step.expects.keywords ??
    [];
  return pool.filter((kw) => normalizedContains(learnerText, kw));
}

/**
 * Look-ahead match: full example containment, unused option/keyword evidence,
 * or free_answer. Skips loose fuzzy overlap and reused keywords from earlier
 * hits in the same message (e.g. «porco» matching both menu and soup).
 */
export function matchRoleplayStepLookahead(
  learnerText: string,
  step: RoleplayStep,
  consumedKeywords: Set<string>,
): RoleplayMatchHit | null {
  const t = learnerText.trim();
  if (!t) return null;
  const exp = step.expects;
  const options = exp.options ?? [];
  const msg = normalizeRoleplayText(t);

  const unused = (keywords: string[]): string[] =>
    keywords.filter((kw) => {
      const n = normalizeRoleplayText(kw);
      return n && !consumedKeywords.has(n) && normalizedContains(t, kw);
    });

  if (options.length > 0) {
    for (const opt of options) {
      const hits = unused(opt.keywords ?? []);
      if (hits.length === 0) continue;
      return {
        step_id: step.id,
        option: opt,
        stay: Boolean(opt.stay),
        slot: exp.slot ?? null,
        slot_value: opt.value,
        via: 'option',
      };
    }
    return null;
  }

  const examples = [
    ...(exp.examples_tl ?? []),
    ...(exp.examples_tl_f ?? []),
  ];
  for (const ex of examples) {
    const n = normalizeRoleplayText(ex);
    if (!n || roleplayWords(ex).length < 2) continue;
    if (msg.includes(n) || matchesAcceptedForm(t, [ex])) {
      return {
        step_id: step.id,
        option: null,
        stay: false,
        slot: null,
        slot_value: null,
        via: 'example',
      };
    }
  }

  const kwHits = unused(exp.keywords ?? []);
  if (kwHits.length > 0) {
    return {
      step_id: step.id,
      option: null,
      stay: false,
      slot: null,
      slot_value: null,
      via: 'keyword',
    };
  }

  return null;
}

/**
 * Match the current step, then look-ahead: the same message may also
 * complete following playable steps (when not `stay`).
 */
export function matchRoleplayWithLookahead(
  learnerText: string,
  playableSteps: RoleplayStep[],
): RoleplayMatchHit[] {
  if (!playableSteps.length) return [];
  const hits: RoleplayMatchHit[] = [];
  const consumed = new Set<string>();
  for (let i = 0; i < playableSteps.length; i++) {
    const step = playableSteps[i];
    const hit =
      i === 0
        ? matchRoleplayStep(learnerText, step)
        : matchRoleplayStepLookahead(learnerText, step, consumed);
    if (!hit) {
      if (i === 0) return [];
      break;
    }
    for (const kw of matchedKeywordsForHit(learnerText, hit, step)) {
      const n = normalizeRoleplayText(kw);
      if (!n) continue;
      consumed.add(n);
      // Also consume each word so «não» from «não como» blocks later «não» options.
      for (const w of n.split(/\s+/).filter(Boolean)) consumed.add(w);
    }
    hits.push(hit);
    if (hit.stay) break;
  }
  return hits;
}
