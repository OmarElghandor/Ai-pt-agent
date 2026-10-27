import { CORE_PROMPT } from './core';

export function buildOutlineSystemPrompt(): string {
  return `${CORE_PROMPT}

JOB: OUTLINE
Return only the page plan. Use only ITEM_DIGEST ids in introduces — do not invent new ids.

REQUIRED OUTPUT: { "pages": [{ "index", "preset", "title_eg", "introduces", "purpose_eg" }] }

RULES
1. index is 0-based contiguous. purpose_eg ≤15 words (Egyptian).
2. Do NOT include mode or page_id — code sets them.
3. introduces ⊆ ITEM_DIGEST; prefer disjoint introduces across pages. Never put RECYCLE ids in introduces (they may appear in assumes / dialogue / questions only).
4. Presets only: phrases, compare, conjugation, pattern, dictionary, scene, story. Each preset at most once per day.
5. Match PAGE_PLAN when given. Non-story days MUST end with a story preset (dialogue self-test). Put early_chunks phrase ids on the phrases page introduces.
`.trim();
}
