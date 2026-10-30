import { generateText } from 'ai';
import { extractJson } from '@/lib/generation/claudeClient';
import { getClassifierModel } from '@/lib/model';
import type { Skill } from '@/lib/v2/content/lesson';
import { z } from 'zod';

export type GradeVerdict =
  | 'correct'
  | 'near_miss'
  | 'wrong'
  | 'off_topic'
  | 'arabic_only'
  | 'unclear';

export type GradeError = {
  category: 'grammar' | 'vocabulary' | 'spelling' | 'pronunciation';
  scope: string;
  item_id?: string;
  tool_id?: string;
  wrong: string;
  right: string;
};

export type GradeRequest = {
  skill: Skill;
  mode?: 'practice' | 'daily' | 'open_question' | 'assessment';
  prompt_tl?: string;
  accepted?: string[];
  criterion?: string;
  answer: string;
  answer_source?: 'typed' | 'speech';
  item_ids?: string[];
  known_items?: string[];
  tool_id?: string;
  weak_areas?: string[];
  level?: string;
};

export type GradeResponse = {
  verdict: GradeVerdict;
  items_used_correctly: string[];
  errors: GradeError[];
  main_error: number | null;
  corrected_tl: string;
  feedback_ar: string;
  skill: Skill;
};

const GradeErrorSchema = z.object({
  category: z.enum(['grammar', 'vocabulary', 'spelling', 'pronunciation']),
  scope: z.string(),
  item_id: z.string().optional(),
  tool_id: z.string().optional(),
  wrong: z.string(),
  right: z.string(),
});

const GradeResponseSchema = z.object({
  verdict: z.enum([
    'correct',
    'near_miss',
    'wrong',
    'off_topic',
    'arabic_only',
    'unclear',
  ]),
  items_used_correctly: z.array(z.string()).max(20).default([]),
  errors: z.array(GradeErrorSchema).max(3).default([]),
  main_error: z.number().int().nullable().default(null),
  corrected_tl: z.string().default(''),
  feedback_ar: z.string().default(''),
  skill: z.enum(['listening', 'reading', 'speaking', 'writing']),
});

/** Test hook — closed/accent paths must never increment this. */
let callCount = 0;

export function getGraderCallCount(): number {
  return callCount;
}

export function resetGraderCallCount(): void {
  callCount = 0;
}

export function unclearGrade(skill: Skill): GradeResponse {
  return {
    verdict: 'unclear',
    items_used_correctly: [],
    errors: [],
    main_error: null,
    corrected_tl: '',
    feedback_ar: '',
    skill,
  };
}

const GRADER_SYSTEM = `You grade one answer from an Egyptian adult learning European Portuguese (Lisbon). You do not talk to him. Return only a JSON object matching the schema.

WHAT COUNTS AS CORRECT
- The answer does what PROMPT asks: it answers the line naturally, or meets CRITERION. Another wording is correct.
- Ignore capital letters, punctuation, a missing accent, "sim"/"não" at the start, and "por favor".
- His own content is always right: his name, city, job, what he bought. Never replace it.
- If ANSWER_SOURCE is speech, the text came from speech recognition: forgive one odd word that sounds like the right one.

VERDICT
- correct: it works.
- near_miss: it works but has one small slip (one wrong ending, o/a, one letter, a Brazilian word).
- wrong: it does not do what PROMPT asks, or has a mistake that changes the meaning.
- off_topic: Portuguese that ignores the prompt.
- arabic_only: no Portuguese at all.
- unclear: you cannot tell what he meant.

ERRORS (max 3, only real ones)
Use only these pairs: grammar/verb_form, grammar/agreement, grammar/sentence_structure, grammar/preposition, vocabulary/forgot_word, vocabulary/wrong_word, vocabulary/brazilian, spelling/spelling, pronunciation/sound. A missing accent is never an error. Link each error to an id from TARGET_ITEMS or KNOWN_ITEMS when one fits.

MAIN_ERROR: the index (0-based) of the error he should fix now, in this order: an error that changes the meaning, then an error in TOOL_ID, then one in his WEAK_AREAS, then any other. null when correct or no errors.

CORRECTED_TL: his own sentence with the smallest fix, using only KNOWN_ITEMS and TARGET_ITEMS words. Empty string when correct.
FEEDBACK_AR: one short Egyptian line about MAIN_ERROR only, with the Portuguese inline. Warm, never "غلط" alone. Empty when correct.

Return JSON only with keys: verdict, items_used_correctly, errors, main_error, corrected_tl, feedback_ar, skill.`;

function buildUserMessage(req: GradeRequest): string {
  return [
    `MODE: ${req.mode ?? 'practice'}`,
    `LEVEL: ${req.level ?? 'A0'}`,
    `SKILL: ${req.skill}`,
    `PROMPT_TL: ${req.prompt_tl ?? ''}`,
    req.accepted?.length
      ? `ACCEPTED: ${req.accepted.join(' | ')}`
      : `CRITERION: ${req.criterion || '(answer the prompt naturally)'}`,
    `TARGET_ITEMS: ${(req.item_ids || []).join(', ') || '(none)'}`,
    `TOOL_ID: ${req.tool_id || '(none)'}`,
    `WEAK_AREAS: ${(req.weak_areas || []).join(', ') || '(none)'}`,
    `KNOWN_ITEMS: ${(req.known_items || []).join(', ') || '(none)'}`,
    `ANSWER_SOURCE: ${req.answer_source ?? 'typed'}`,
    `ANSWER: ${req.answer}`,
  ].join('\n');
}

function resolveGraderModel() {
  const spec = process.env.V2_GRADER_MODEL?.trim();
  // Prefer Anthropic Haiku when ANTHROPIC_API_KEY is set and model looks Claude-ish.
  // Otherwise fall back to the existing classifier path (DeepInfra).
  void spec;
  return getClassifierModel();
}

const TIMEOUT_MS = 8_000;

/**
 * Pure LLM grader for open speaking/writing. No DB writes.
 * 8s timeout / invalid JSON → unclear (never a learner error).
 */
export async function gradeAnswer(req: GradeRequest): Promise<GradeResponse> {
  callCount += 1;

  if (req.skill === 'listening' || req.skill === 'reading') {
    return {
      ...unclearGrade(req.skill),
      feedback_ar: 'السمع والقراءة بيتصحّحوا في الكود، مش هنا.',
    };
  }

  if (!req.answer.trim()) {
    return unclearGrade(req.skill);
  }

  try {
    const result = await Promise.race([
      generateText({
        model: resolveGraderModel(),
        system: GRADER_SYSTEM,
        prompt: buildUserMessage(req),
        temperature: 0.2,
        maxOutputTokens: 600,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('grader_timeout')), TIMEOUT_MS),
      ),
    ]);
    return parseGradeModelOutput(result.text, req);
  } catch {
    return unclearGrade(req.skill);
  }
}

export function parseGradeModelOutput(
  text: string,
  req: GradeRequest,
): GradeResponse {
  try {
    const json = extractJson(text);
    const out = GradeResponseSchema.safeParse({
      ...(typeof json === 'object' && json ? json : {}),
      skill: req.skill,
    });
    if (!out.success) return unclearGrade(req.skill);
    const data = out.data;
    if (data.errors.length > 3) data.errors = data.errors.slice(0, 3);
    if (
      data.main_error != null &&
      (data.main_error < 0 || data.main_error >= data.errors.length)
    ) {
      data.main_error = data.errors.length ? 0 : null;
    }
    if (data.verdict === 'correct') {
      data.corrected_tl = '';
      data.errors = [];
      data.main_error = null;
    }
    return data;
  } catch {
    return unclearGrade(req.skill);
  }
}
