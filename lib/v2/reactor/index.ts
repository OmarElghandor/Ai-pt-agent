import { generateText } from 'ai';
import { extractJson } from '@/lib/generation/claudeClient';
import { getChatModel } from '@/lib/model';
import type { Skill } from '@/lib/v2/content/lesson';
import { z } from 'zod';

export type ReactorMainError = {
  category?: string;
  scope: string;
  wrong: string;
  right: string;
  feedback_ar?: string;
};

export type ReactorRequest = {
  mode?: 'practice' | 'daily' | 'open_question' | 'assessment';
  skill: Skill;
  verdict: 'near_miss' | 'wrong' | 'off_topic';
  attempt: 1 | 2;
  prompt_tl?: string;
  answer: string;
  corrected_tl: string;
  main_error: ReactorMainError | null;
  weak_spot?: boolean;
  character_name: string;
  character_role?: string;
  coach_fallback_eg: string;
  /** Allowed TL words for character_tl check (caller may also re-validate). */
  allowed_words?: string[];
};

export type ReactorResponse = {
  character_tl?: string;
  coach_eg?: string;
  advance: boolean;
};

const ReactorResponseSchema = z.object({
  character_tl: z.string().optional(),
  coach_eg: z.string().optional(),
  advance: z.boolean(),
});

const TIMEOUT_MS = 8_000;

function buildReactorPrompt(req: ReactorRequest): string {
  const main = req.main_error;
  const mainBlock = main
    ? [
        'MAIN_ERROR:',
        `- scope: ${main.scope}`,
        `- wrong → right: ${main.wrong} → ${main.right}`,
        `- feedback_ar: ${main.feedback_ar || ''}`,
      ].join('\n')
    : 'MAIN_ERROR: (none)';

  return [
    `You react in a practice scene. Character: ${req.character_name} (${req.character_role || 'in Portugal'}).`,
    'SOURCE is always code — you do not judge. Never emit a VERDICT line.',
    `SKILL: ${req.skill}`,
    `ATTEMPT: ${req.attempt} of 2`,
    `Line: "${req.prompt_tl ?? ''}"`,
    `Learner said: "${req.answer}"`,
    `VERDICT: ${req.verdict}`,
    `CORRECTED_TL: ${req.corrected_tl || '(empty)'}`,
    `WEAK_SPOT: ${req.weak_spot ? 'yes' : 'no'}`,
    mainBlock,
    '',
    'CORRECTION',
    '- Correct only MAIN_ERROR. Never list several mistakes.',
    '- On near_miss or wrong with attempt 1: advance=false. Give coach_eg in Egyptian about the one error; omit character_tl (character waits).',
    '- On attempt 2: advance=true. coach_eg shows the correct sentence warmly; optional short character_tl that continues the scene.',
    '- On off_topic attempt 1: advance=false; coach_eg gently brings him back; no character_tl.',
    '- If WEAK_SPOT is yes, the coach kindly notes this one keeps coming back.',
    '',
    'Return JSON only: { "character_tl"?: string, "coach_eg"?: string, "advance": boolean }',
    `Fallback coach if unsure: ${req.coach_fallback_eg}`,
  ].join('\n');
}

/**
 * Pure reactor. Called only for speaking/writing near_miss | wrong | off_topic.
 * No DB writes. Invalid output → fallback coach, no character line.
 */
export async function reactAnswer(
  req: ReactorRequest,
): Promise<ReactorResponse> {
  const fallback: ReactorResponse = {
    coach_eg: req.coach_fallback_eg,
    advance: req.attempt >= 2,
  };

  try {
    const result = await Promise.race([
      generateText({
        model: getChatModel(),
        prompt: buildReactorPrompt(req),
        temperature: 0.5,
        maxOutputTokens: 220,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('reactor_timeout')), TIMEOUT_MS),
      ),
    ]);
    const json = extractJson(result.text);
    const parsed = ReactorResponseSchema.safeParse(json);
    if (!parsed.success) return fallback;
    const data = parsed.data;
    if (req.attempt >= 2) data.advance = true;
    if (req.attempt === 1 && req.verdict !== 'off_topic') {
      // Character waits on attempt 1 near_miss/wrong
      if (req.verdict === 'near_miss' || req.verdict === 'wrong') {
        delete data.character_tl;
        data.advance = false;
      }
    }
    if (!data.coach_eg?.trim()) data.coach_eg = req.coach_fallback_eg;
    return data;
  } catch {
    return fallback;
  }
}

/** Drop character_tl when it fails heard/said or allowed-words checks. */
export function sanitizeReactorCharacter(
  res: ReactorResponse,
  opts: {
    ok: boolean;
  },
): ReactorResponse {
  if (!opts.ok && res.character_tl) {
    const { character_tl: _, ...rest } = res;
    return rest;
  }
  return res;
}
