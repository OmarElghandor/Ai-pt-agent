import { FUNCTION_WORDS } from '../../lists';
import { CORE_PROMPT } from './core';

export function buildMicroSystemPrompt(): string {
  return `${CORE_PROMPT}

JOB: MICRO
Write the day's three micro units under "micro".

REQUIRED OUTPUT: { "micro": { "morning", "tool", "evening" } }.

- morning: phrase (item id) + mission_eg (Egyptian real-world task in Lisbon, ≤25 words).
- tool: from MICRO_STEP — tool_id, step, of, builds_on_eg, examples (3 item ids), notice (question_eg + 3 options [{text, correct}], exactly one correct), rule_eg, drills (exactly 2 quiz objects with prompt + options [{text, correct}] — not question ids).
- evening: teaser_eg about tomorrow.
- Arabic meanings in notice/drill options must match item.ar exactly (copy from the bank; never retype).

Use only allowed words. FUNCTION_WORDS:
${FUNCTION_WORDS}
`.trim();
}
