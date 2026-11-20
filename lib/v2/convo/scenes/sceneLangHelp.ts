import { generateText } from 'ai';
import { getChatModel } from '@/lib/model';
import type { ConvoGoal, ConvoGoalBank } from '@/lib/v2/convo/goals/types';
import { loadCommonWords } from '@/lib/v2/convo/guard/levelGuard';
import { splitCoachEgToSegments } from '@/lib/v2/convo/sideChannel/coachSegments';
import { normalizeAr } from '@/lib/v2/convo/sideChannel/normalizeAr';

export const SCENE_LANG_HELP_TIMEOUT_MS = 4_000;

export type SceneLangHelpResult = {
  pt: string;
  note_eg: string;
};

export type SceneLangHelpCoach = {
  /** Full coach eg (flat) for fallbacks without structured note. */
  eg: string;
  segments: Array<{ type: 'eg' | 'tl'; text: string }>;
  /** Tappable PT sentence when Qwen passed; empty for glossary/suggest-only. */
  suggest: string[];
  source: 'qwen' | 'glossary' | 'suggest';
};

const SYSTEM =
  'You help a beginner learner of European Portuguese in a café role-play. Return JSON only.';

const HAS_ARABIC = /[\u0600-\u06FF]/;

function normalizeToken(w: string): string {
  return w
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function addTokens(lexicon: Set<string>, text: string | undefined | null): void {
  if (!text?.trim()) return;
  for (const raw of text.split(/\s+/)) {
    const n = normalizeToken(raw);
    if (n) lexicon.add(n);
  }
}

/** Lexicon: bank ask/react/unclear/examples/suggest/glossary.tl + common words. */
export function buildSceneLangHelpLexicon(bank: ConvoGoalBank): Set<string> {
  const lexicon = new Set<string>(loadCommonWords());
  const addLine = (line: { tl?: string; tl_f?: string } | null | undefined) => {
    addTokens(lexicon, line?.tl);
    addTokens(lexicon, line?.tl_f);
  };
  for (const l of bank.opening_lines ?? []) addLine(l);
  for (const l of bank.closing_lines ?? []) addLine(l);
  if (bank.opening) addLine(bank.opening);
  if (bank.global) {
    for (const l of bank.global.greeting.react) addLine(l);
    for (const l of bank.global.thanks.react) addLine(l);
    for (const l of bank.global.side_unknown.react) addLine(l);
  }
  for (const g of bank.goals) {
    for (const l of g.ask ?? []) addLine(l);
    addTokens(lexicon, g.ask_tl);
    for (const l of g.unclear ?? []) addLine(l);
    for (const s of g.suggest ?? []) addTokens(lexicon, s);
    for (const s of g.suggest_f ?? []) addTokens(lexicon, s);
    for (const o of g.options ?? []) {
      for (const l of o.react) addLine(l);
      for (const ex of o.examples ?? []) addTokens(lexicon, ex);
    }
  }
  for (const entry of bank.glossary ?? []) {
    addTokens(lexicon, entry.tl);
  }
  return lexicon;
}

export function parseSceneLangHelpJson(
  text: string,
): SceneLangHelpResult | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    const slice =
      start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
    const obj = JSON.parse(slice) as Record<string, unknown>;
    const pt = typeof obj.pt === 'string' ? obj.pt.trim() : '';
    const note_eg = typeof obj.note_eg === 'string' ? obj.note_eg.trim() : '';
    if (!pt) return null;
    return { pt, note_eg };
  } catch {
    return null;
  }
}

/** Latin-only, ≤10 words, every content token ∈ lexicon. */
export function sceneLangHelpPassesCheck(
  pt: string,
  lexicon: Set<string>,
): boolean {
  const trimmed = pt.trim();
  if (!trimmed) return false;
  if (HAS_ARABIC.test(trimmed)) return false;
  // Reject non-Latin scripts (Cyrillic etc.) — allow Latin + digits + punctuation.
  if (/[^\p{Script=Latin}\p{N}\s'’«»"\-?!,.;:…]/u.test(trimmed)) {
    // Still allow common PT punctuation / spaces; fail on other letters.
    const letters = trimmed.replace(/[^\p{L}]/gu, '');
    if (letters && !/^[\p{Script=Latin}]+$/u.test(letters)) return false;
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 10) return false;
  for (const w of words) {
    const n = normalizeToken(w);
    if (!n) continue;
    if (!lexicon.has(n)) return false;
  }
  return true;
}

/**
 * Glossary fallback: longest ar keyword first; length ≤2 → whole-word match.
 */
export function matchGlossaryEntry(
  learnerQuestion: string,
  glossary: Array<{ ar: string[]; tl: string }> | undefined,
): { ar: string[]; tl: string } | null {
  if (!glossary?.length) return null;
  const q = normalizeAr(learnerQuestion);
  if (!q.trim()) return null;

  type Cand = { entry: { ar: string[]; tl: string }; kw: string; len: number };
  const cands: Cand[] = [];
  for (const entry of glossary) {
    for (const raw of entry.ar) {
      const kw = normalizeAr(raw).trim();
      if (!kw) continue;
      cands.push({ entry, kw, len: kw.length });
    }
  }
  cands.sort((a, b) => b.len - a.len || b.kw.localeCompare(a.kw));

  for (const c of cands) {
    if (c.len <= 2) {
      // Whole-word match in normalized Arabic (space-delimited).
      const words = q.split(/\s+/).filter(Boolean);
      if (words.includes(c.kw)) return c.entry;
      continue;
    }
    if (q.includes(c.kw)) return c.entry;
  }
  return null;
}

function buildLangHelpPrompt(opts: {
  lastCharacterPt: string;
  lastCharacterAr?: string;
  learnerQuestion: string;
  goal: ConvoGoal | null;
  glossary: Array<{ ar: string[]; tl: string }>;
  gender: 'm' | 'f';
}): string {
  const g = opts.goal;
  const options = (g?.options ?? []).map((o) => ({
    value: o.value,
    examples: o.examples ?? [],
  }));
  const suggest =
    opts.gender === 'f' && g?.suggest_f?.length
      ? g.suggest_f
      : (g?.suggest ?? []);
  return [
    `Character's last line (pt): ${opts.lastCharacterPt}`,
    opts.lastCharacterAr
      ? `Character's last line (ar): ${opts.lastCharacterAr}`
      : '',
    `Current goal options/examples: ${JSON.stringify(options)}`,
    `Current suggest: ${JSON.stringify(suggest)}`,
    `Glossary (preferred words): ${JSON.stringify(opts.glossary)}`,
    `Learner question: ${opts.learnerQuestion}`,
    'The learner is in this role-play and asks how to say something. Give ONE short pt-PT sentence they can say now, as a reply to the character\'s last line. Prefer the words in the glossary and examples. Then one short Egyptian Arabic note about the key word.',
    'Output JSON: {"pt":"<sentence>","note_eg":"<short note>"}',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function callSceneLangHelp(opts: {
  lastCharacterPt: string;
  lastCharacterAr?: string;
  learnerQuestion: string;
  goal: ConvoGoal | null;
  bank: ConvoGoalBank;
  gender?: 'm' | 'f';
  /** Sync/async stub, or 'timeout' to force fallback path (tests). */
  stub?:
    | SceneLangHelpResult
    | Promise<SceneLangHelpResult | null>
    | 'timeout';
}): Promise<SceneLangHelpResult | null> {
  if (opts.stub === 'timeout') return null;
  if (opts.stub !== undefined) return await opts.stub;

  const prompt = buildLangHelpPrompt({
    lastCharacterPt: opts.lastCharacterPt,
    lastCharacterAr: opts.lastCharacterAr,
    learnerQuestion: opts.learnerQuestion,
    goal: opts.goal,
    glossary: opts.bank.glossary ?? [],
    gender: opts.gender ?? 'm',
  });
  try {
    const out = await generateText({
      model: getChatModel(),
      system: SYSTEM,
      prompt,
      temperature: 0,
      maxOutputTokens: 120,
      abortSignal: AbortSignal.timeout(SCENE_LANG_HELP_TIMEOUT_MS),
    });
    return parseSceneLangHelpJson(out.text ?? '');
  } catch {
    return null;
  }
}

function coachFromPt(
  pt: string,
  noteEg?: string,
): SceneLangHelpCoach {
  const segments: Array<{ type: 'eg' | 'tl'; text: string }> = [
    { type: 'eg', text: 'تقدر تقول: ' },
    { type: 'tl', text: pt },
  ];
  let eg = `تقدر تقول: ${pt}`;
  if (noteEg?.trim()) {
    segments.push({ type: 'eg', text: ` — ${noteEg.trim()}` });
    eg = `${eg} — ${noteEg.trim()}`;
  }
  return {
    eg,
    segments,
    suggest: [pt],
    source: 'qwen',
  };
}

function coachFromPlainTl(
  tl: string,
  source: 'glossary' | 'suggest',
): SceneLangHelpCoach {
  const eg = `تقدر تقول: ${tl}`;
  return {
    eg,
    segments: splitCoachEgToSegments(eg),
    suggest: source === 'suggest' ? [tl] : [],
    source,
  };
}

/**
 * Resolve coach answer: Qwen (checked) → glossary → suggest[0].
 * Never returns empty coach.
 */
export async function resolveSceneLangHelp(opts: {
  lastCharacterPt: string;
  lastCharacterAr?: string;
  learnerQuestion: string;
  goal: ConvoGoal | null;
  bank: ConvoGoalBank;
  gender?: 'm' | 'f';
  stub?:
    | SceneLangHelpResult
    | Promise<SceneLangHelpResult | null>
    | 'timeout';
}): Promise<SceneLangHelpCoach> {
  const gender = opts.gender ?? 'm';
  const lexicon = buildSceneLangHelpLexicon(opts.bank);
  const raw = await callSceneLangHelp(opts);

  if (raw?.pt && sceneLangHelpPassesCheck(raw.pt, lexicon)) {
    return coachFromPt(raw.pt, raw.note_eg);
  }

  const gloss = matchGlossaryEntry(
    opts.learnerQuestion,
    opts.bank.glossary,
  );
  if (gloss) {
    return coachFromPlainTl(gloss.tl, 'glossary');
  }

  const goal = opts.goal;
  const suggests =
    gender === 'f' && goal?.suggest_f?.length
      ? goal.suggest_f
      : (goal?.suggest ?? []);
  const fallback = suggests[0]?.trim() || '…';
  return coachFromPlainTl(fallback, 'suggest');
}
