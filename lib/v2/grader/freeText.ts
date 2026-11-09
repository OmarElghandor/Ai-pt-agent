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

SEVERITY
- none: the line is already fine (or only ignored differences).
- accent: only a missing/wrong accent mark (à/á/é…). Light hint.
- error: wrong conjugation, gender/agreement, missing/wrong preposition or article, wrong word, Brazilian form, word order that changes meaning.

OUTPUT
- has_error: true when severity is accent or error.
- corrected_tl: full natural pt-PT sentence with the smallest change. Keep the learner's own content (names, places, numbers).
- changes: up to 3 {from, to} for the visible diff (the important edits).
- main_error: the single most important {from, to, type}. type must be one of: grammar/verb_form, grammar/agreement, grammar/sentence_structure, grammar/preposition, vocabulary/forgot_word, vocabulary/wrong_word, vocabulary/brazilian, spelling/accent, spelling/spelling, pronunciation/sound. null when none.
- note_eg: one short Egyptian Arabic line explaining the MAIN error only, with Portuguese words inline (no markdown asterisks). Example: بنقول prefiro مش prefero — من الفعل preferir. For accent: انتبه للعلامة: à
- ar: simple MSA translation of corrected_tl (Arabic script only). Empty when none.

Never invent a wrong correction. If unsure, severity=none.

Return JSON keys: has_error, severity, corrected_tl, changes, main_error, note_eg, ar.`;

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
export async function gradeFreeText(
  req: FreeTextRequest,
): Promise<FreeTextCorrection> {
  const answer = req.answer.trim();
  if (!answer) return noFreeTextCorrection();

  try {
    let raw = await callFreeTextModel(req);
    let check = parseFreeTextCorrection(raw, answer);
    if (!check.ok) {
      raw = await callFreeTextModel(req, check.reason);
      check = parseFreeTextCorrection(raw, answer);
    }
    if (!check.ok) return noFreeTextCorrection();
    return check.value;
  } catch {
    return noFreeTextCorrection();
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
