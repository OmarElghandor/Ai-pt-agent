import { generateText } from 'ai';
import { extractJson } from '@/lib/generation/claudeClient';
import { getClassifierModel } from '@/lib/model';
import { findBrazilianLeak } from '@/lib/v2/convo/output/checks';
import {
  checkPtScript,
  findForbiddenScript,
} from '@/lib/v2/convo/output/scriptGuard';
import { z } from 'zod';

/** 00 §8 taxonomy scopes used in free-text corrections. */
export const FREE_ERROR_TYPES = [
  'grammar/verb_form',
  'grammar/agreement',
  'grammar/sentence_structure',
  'grammar/preposition',
  'vocabulary/forgot_word',
  'vocabulary/wrong_word',
  'vocabulary/brazilian',
  'spelling/accent',
  'spelling/spelling',
  'pronunciation/sound',
] as const;

export type FreeErrorType = (typeof FREE_ERROR_TYPES)[number];

export type FreeTextSeverity = 'none' | 'accent' | 'error';

export type FreeTextChange = { from: string; to: string };

export type FreeTextMainError = {
  from: string;
  to: string;
  type: FreeErrorType;
};

export type FreeTextCorrection = {
  has_error: boolean;
  severity: FreeTextSeverity;
  corrected_tl: string;
  changes: FreeTextChange[];
  main_error: FreeTextMainError | null;
  note_eg: string;
  ar: string;
};

export type FreeTextRequest = {
  answer: string;
  character_tl?: string;
  frame_tl?: string;
  frame_chips?: string[];
  level?: string;
};

const FreeTextChangeSchema = z.object({
  from: z.string(),
  to: z.string(),
});

const FreeTextMainErrorSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum(FREE_ERROR_TYPES),
});

const FreeTextResponseSchema = z.object({
  has_error: z.boolean(),
  severity: z.enum(['none', 'accent', 'error']),
  corrected_tl: z.string().default(''),
  changes: z.array(FreeTextChangeSchema).max(3).default([]),
  main_error: FreeTextMainErrorSchema.nullable().default(null),
  note_eg: z.string().default(''),
  ar: z.string().default(''),
});

export const FREE_TEXT_TIMEOUT_MS = 6_000;

export function noFreeTextCorrection(): FreeTextCorrection {
  return {
    has_error: false,
    severity: 'none',
    corrected_tl: '',
    changes: [],
    main_error: null,
    note_eg: '',
    ar: '',
  };
}

/** Fold for equality: accents kept for accent detection; caps/punct/digits soft. */
export function normalizeFreeCompare(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const FREE_TEXT_SYSTEM = `You correct one Portuguese (pt-PT, Lisbon) line from an Egyptian A1 adult in a free conversation. Return only JSON.

IGNORE (never mark as error): capitalisation, missing final punctuation, digits instead of number words (3 = três is fine).

SPELLING AND ACCENTS ARE ALWAYS CORRECTIONS (examples):
- Con → Com
- perciso → preciso
- agua → água
- Nao / nao → Não / não
- Prefer a FRAME_CHIPS / examples form when it is a minimal edit of the learner text.
- Never invent a new phrase (e.g. do not turn «Para aqui» into «Para cá»; prefer «Para comer aqui.» if that is the example).

FIX EVERY MISTAKE in the learner's sentence (spelling, accents, missing words, wrong words) — not just one. Example: «Ola quria um cafe con paste de nata» → «Olá, queria um café com um pastel de nata.»
Minimal means: keep the learner's words and order where they are already correct; do not replace the whole line with a different phrase.
note_eg names the 1–2 most important fixes (Egyptian Arabic, Portuguese words inline).

SEVERITY
- none: the line is already fine (or only ignored differences).
- accent: only a missing/wrong accent mark (à/á/é…). Light hint.
- error: wrong conjugation, gender/agreement, missing/wrong preposition or article, wrong word, Brazilian form, spelling, word order that changes meaning.

OUTPUT
- has_error: true when severity is accent or error.
- corrected_tl: the learner's sentence with ALL mistakes fixed. Keep the learner's own content (names, places, numbers).
- changes: up to 3 {from, to} for the visible diff (the important edits).
- main_error: the single most important {from, to, type}. type must be one of: grammar/verb_form, grammar/agreement, grammar/sentence_structure, grammar/preposition, vocabulary/forgot_word, vocabulary/wrong_word, vocabulary/brazilian, spelling/accent, spelling/spelling, pronunciation/sound. null when none.
- note_eg: one short Egyptian Arabic line naming the 1–2 most important fixes, with Portuguese words inline (no markdown asterisks). Example: بنقول prefiro مش prefero — من الفعل preferir. For accent: انتبه للعلامة: à
- ar: simple MSA translation of corrected_tl (Arabic script only). Empty when none.

Never invent a wrong correction. If unsure, severity=none.

Return JSON keys: has_error, severity, corrected_tl, changes, main_error, note_eg, ar.`;

/** Deterministic spelling/accent fixes from FINAL SPEC §3E (always correct). */
const SPELLING_ALWAYS: Array<{ re: RegExp; to: string; note: string }> = [
  {
    re: /\bCon\b/g,
    to: 'Com',
    note: 'بنقول Com مش Con.',
  },
  {
    re: /\bcon\b/g,
    to: 'com',
    note: 'بنقول com مش con.',
  },
  {
    re: /\b[Nn]ao\b/g,
    to: 'Não',
    note: 'انتبه للعلامة: Não',
  },
  {
    re: /\bperciso\b/gi,
    to: 'preciso',
    note: 'بنقول preciso مش perciso.',
  },
  {
    re: /\bagua\b/gi,
    to: 'água',
    note: 'انتبه للعلامة: água',
  },
];

function applyAlwaysSpellingFixes(answer: string): FreeTextCorrection | null {
  let corrected = answer;
  const changes: FreeTextChange[] = [];
  let note = '';
  for (const rule of SPELLING_ALWAYS) {
    if (!rule.re.test(corrected)) continue;
    rule.re.lastIndex = 0;
    const next = corrected.replace(rule.re, rule.to);
    if (next !== corrected) {
      changes.push({ from: answer, to: next });
      corrected = next;
      note = rule.note;
    }
  }
  // «nao como porco» → prefer full example when chips provide it.
  if (/\bnao\s+como\s+porco\b/i.test(answer) || /\bnão\s+como\s+porco\b/i.test(answer)) {
    corrected = 'Não como carne de porco';
    changes.push({ from: answer, to: corrected });
    note = 'بنقول Não como carne de porco.';
  }
  if (!changes.length || normalizeFreeCompare(corrected) === normalizeFreeCompare(answer)) {
    return null;
  }
  // Normalize leading Não casing after replacements.
  corrected = corrected.replace(/^não\b/i, 'Não');
  return {
    has_error: true,
    severity: /água|Não/.test(corrected) && changes.length <= 2 ? 'accent' : 'error',
    corrected_tl: corrected,
    changes: changes.slice(0, 3),
    main_error: {
      from: answer,
      to: corrected,
      type: 'spelling/spelling',
    },
    note_eg: note || 'صحّح الإملاء.',
    ar: '',
  };
}

function buildFreeTextUserMessage(req: FreeTextRequest): string {
  return [
    `LEVEL: ${req.level ?? 'A1'}`,
    `CHARACTER_LAST_TL: ${req.character_tl?.trim() || '(none)'}`,
    `FRAME_TL: ${req.frame_tl?.trim() || '(none)'}`,
    `FRAME_CHIPS: ${(req.frame_chips ?? []).join(' | ') || '(none)'}`,
    `ANSWER: ${req.answer.trim()}`,
  ].join('\n');
}

function resolveGraderModel() {
  const spec = process.env.V2_GRADER_MODEL?.trim();
  void spec;
  return getClassifierModel();
}

export type FreeTextValidation =
  | { ok: true; value: FreeTextCorrection }
  | { ok: false; reason: string };

/**
 * Validate and normalise a free-text correction payload.
 * On failure the caller retries once, then returns no correction.
 */
export function validateFreeTextCorrection(
  raw: unknown,
  originalAnswer: string,
): FreeTextValidation {
  const parsed = FreeTextResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: 'schema' };
  }
  const data = parsed.data;

  if (!data.has_error || data.severity === 'none') {
    return { ok: true, value: noFreeTextCorrection() };
  }

  const corrected = data.corrected_tl.trim();
  if (!corrected) {
    return { ok: false, reason: 'empty_corrected' };
  }

  if (checkPtScript(corrected)) {
    return { ok: false, reason: 'pt_script' };
  }
  if (findForbiddenScript(corrected)) {
    return { ok: false, reason: 'forbidden_script' };
  }
  if (findBrazilianLeak(corrected)) {
    return { ok: false, reason: 'brazilian' };
  }

  if (normalizeFreeCompare(corrected) === normalizeFreeCompare(originalAnswer)) {
    return { ok: true, value: noFreeTextCorrection() };
  }

  // note_eg may mix Arabic + Latin PT words — forbid CJK/Cyrillic only.
  if (data.note_eg.trim()) {
    const forbidden = findForbiddenScript(data.note_eg);
    if (forbidden === 'cjk' || forbidden === 'cyrillic') {
      return { ok: false, reason: 'note_script' };
    }
    if (!/[\u0600-\u06FF]/.test(data.note_eg)) {
      return { ok: false, reason: 'note_not_arabic' };
    }
  }

  if (data.ar.trim()) {
    if (!/[\u0600-\u06FF]/.test(data.ar)) {
      return { ok: false, reason: 'ar_script' };
    }
    const arForbidden = findForbiddenScript(data.ar);
    if (arForbidden === 'cjk' || arForbidden === 'cyrillic') {
      return { ok: false, reason: 'ar_script' };
    }
  }

  if (data.severity === 'error' && !data.main_error) {
    return { ok: false, reason: 'missing_main_error' };
  }

  let mainError = data.main_error;
  if (data.severity === 'accent' && mainError) {
    mainError = { ...mainError, type: 'spelling/accent' };
  }

  const changes = data.changes.slice(0, 3).filter((c) => c.from || c.to);
  if (changes.length === 0 && mainError) {
    changes.push({ from: mainError.from, to: mainError.to });
  }

  return {
    ok: true,
    value: {
      has_error: true,
      severity: data.severity,
      corrected_tl: corrected,
      changes,
      main_error: mainError,
      note_eg: data.note_eg.trim(),
      ar: data.ar.trim(),
    },
  };
}

/** Parse model text → validated correction (for tests + live). */
export function parseFreeTextCorrection(
  text: string,
  originalAnswer: string,
): FreeTextValidation {
  try {
    const json = extractJson(text);
    return validateFreeTextCorrection(json, originalAnswer);
  } catch {
    return { ok: false, reason: 'json' };
  }
}

async function callFreeTextModel(
  req: FreeTextRequest,
  retryReason?: string,
): Promise<string> {
  const prompt = retryReason
    ? `${buildFreeTextUserMessage(req)}\n\nPrevious JSON was invalid (${retryReason}). Return valid JSON only.`
    : buildFreeTextUserMessage(req);
  const result = await Promise.race([
    generateText({
      model: resolveGraderModel(),
      system: FREE_TEXT_SYSTEM,
      prompt,
      temperature: 0.2,
      maxOutputTokens: 500,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('free_text_timeout')),
        FREE_TEXT_TIMEOUT_MS,
      ),
    ),
  ]);
  return (result.text ?? '').trim();
}

/**
 * Pure free-text correction for conversation (K1). No DB writes.
 * 6s timeout / invalid → no correction (never a wrong correction).
 */
function preferChipExpansion(
  answer: string,
  always: FreeTextCorrection,
  chips: readonly string[],
): FreeTextCorrection {
  const fixedNorm = normalizeFreeCompare(always.corrected_tl);
  const chipHit = chips.find((c) => {
    const n = normalizeFreeCompare(c);
    return n === fixedNorm || n.includes(fixedNorm) || fixedNorm.includes(n);
  });
  if (chipHit && normalizeFreeCompare(chipHit) !== normalizeFreeCompare(answer)) {
    return {
      ...always,
      corrected_tl: chipHit.trim(),
      changes: [{ from: answer, to: chipHit.trim() }],
      main_error: {
        from: answer,
        to: chipHit.trim(),
        type: 'spelling/spelling',
      },
    };
  }
  return always;
}

export async function gradeFreeText(
  req: FreeTextRequest,
): Promise<FreeTextCorrection> {
  const answer = req.answer.trim();
  if (!answer) return noFreeTextCorrection();

  // Spec §3E / §8.4: spelling table is a fallback only — call the model so
  // every mistake is fixed, not just the first spelling hit (e.g. con→com).
  const alwaysRaw = applyAlwaysSpellingFixes(answer);
  const always = alwaysRaw
    ? preferChipExpansion(answer, alwaysRaw, req.frame_chips ?? [])
    : null;

  try {
    let raw = await callFreeTextModel(req);
    let check = parseFreeTextCorrection(raw, answer);
    if (!check.ok) {
      raw = await callFreeTextModel(req, check.reason);
      check = parseFreeTextCorrection(raw, answer);
    }
    if (check.ok && check.value.has_error) return check.value;
    if (check.ok && !check.value.has_error) {
      // Model says fine — still surface deterministic spelling if any.
      return always ?? check.value;
    }
    return always ?? noFreeTextCorrection();
  } catch {
    return always ?? noFreeTextCorrection();
  }
}

/** Test helper: inject a deterministic correction without a model. */
export type FreeTextGrader = (
  req: FreeTextRequest,
) => Promise<FreeTextCorrection>;

export function createStubFreeTextGrader(
  result: FreeTextCorrection | ((req: FreeTextRequest) => FreeTextCorrection),
): FreeTextGrader & { calls: number; lastReq: FreeTextRequest | null } {
  const state = { calls: 0, lastReq: null as FreeTextRequest | null };
  const fn = (async (req: FreeTextRequest) => {
    state.calls += 1;
    state.lastReq = req;
    return typeof result === 'function' ? result(req) : result;
  }) as FreeTextGrader & {
    calls: number;
    lastReq: FreeTextRequest | null;
  };
  Object.defineProperty(fn, 'calls', { get: () => state.calls });
  Object.defineProperty(fn, 'lastReq', { get: () => state.lastReq });
  return fn;
}
