import { FUNCTION_WORDS } from '../../lists';
import { CORE_PROMPT } from './core';

export function buildQuestionsSystemPrompt(): string {
  return `${CORE_PROMPT}

JOB: QUESTIONS (one page)
Write 2–4 questions for this page only. Plain strings only — never rt arrays.

REQUIRED OUTPUT: { "questions": [{ type, tests, prompt?, answer_tl?, feedback_eg? }] }

RULES
1. tests = one item id from INTRODUCES (do not invent ids).
2. type must be one of: read_meaning | recall_tl | listen | writing.
   - read_meaning: code shows tl, options = Arabic meanings
   - recall_tl: code shows Arabic (or icon), options = Portuguese
   - listen: code uses audio; options = Arabic meanings
   - writing: include answer_tl (expected Portuguese). Never put say/pronunciation of the answer in prompt.
3. prompt is an optional short Egyptian frame only — code injects the stimulus from tests. Do NOT put the correct answer text in prompt.
4. Do NOT write options, answer, accepted, audio_ref, or why_wrong_eg — code builds those.
5. Do not reuse the same answer_tl on two writing questions in the day.

FUNCTION_WORDS
${FUNCTION_WORDS}
`.trim();
}
