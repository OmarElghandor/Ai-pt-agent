import { FUNCTION_WORDS } from '../../lists';
import { CORE_PROMPT } from './core';

export function buildDailyUseSystemPrompt(): string {
  return `${CORE_PROMPT}

JOB: DAILY USE
Write speak_prompts (3–4): Egyptian questions about the learner's real day, each with answer_tl (Portuguese, allowed words only) and ids (item ids used). Prefer today's items plus RECYCLE.

REQUIRED OUTPUT: { "speak_prompts": [...], "can_do"?: [...] }.

Optionally return can_do: 2–3 { eg, proves } for lesson.can_do.

FUNCTION_WORDS
${FUNCTION_WORDS}
`.trim();
}
