import { CORE_PROMPT } from './core';

export function buildStorySystemPrompt(): string {
  return `${CORE_PROMPT}

JOB: STORY
Write the day's spoken story BEFORE the outline. The rest of the day is built from this story.

REQUIRED OUTPUT via submit_story:
{
  "cast": [{ "id", "name", "role": "learner"|"character"|"narrator" }],
  "setting": "short place in English",
  "lines": [{
    "speaker": "cast id or learner|narrator",
    "tl": "Portuguese phrase or full sentence",
    "en": "short plain-English gloss of tl",
    "ids": ["item ids used in this line — never pattern.*.ex.N"],
    "extra": [{ "tl", "ar" }]  // words outside ALLOWED; ≤15% of content tokens
    "replies_to": 0  // optional; learner replies must point at an earlier line index
  }],
  "scenes": [{ "id", "title_eg", "line_start", "line_end" }],  // weekly only
  "reading": {  // WEEKLY ONLY — omit on normal days
    "tl": "60–120 word Portuguese paragraph (person / place / day), week items only",
    "questions": [
      { "type": "read_meaning"|"true_false", "prompt_eg": "Egyptian", "options": [{ "label", "correct" }] }
    ]  // exactly 3
  }
}

RULES
1. Cast: learner + one recurring character from CHARACTERS whose home fits the setting. Prefer CHAT_CHARACTER when their place fits; otherwise pick another registry character for the place. Optional narrator only if needed.
2. Aim ~6–10 lines (code may split sentences); weekly 12–20 in 2–3 scenes. Learner speaks 2–4 lines on normal days.
3. Cover every id in MUST_COVER (phrases + the chosen variant_group member + grammar pattern). Do NOT force other variant_group members or dictionary words into the story.
4. Prefer core words in natural lists when easy (e.g. "Tem pão, queijo e ovos."). Dictionary owns leftover nouns — words are optional.
5. One sentence per line (one trailing .!?… only). Never a bare noun. No "/" in tl. Stay within max_words (phase max + 3).
6. Learner replies that answer a heard line must set replies_to to that earlier index.
7. Extras outside CORE + RECYCLE + ALLOWED_PRIOR are OK up to 15% of content tokens — list each in extra[] with an Arabic gloss. Extras are never tested.
8. Write en (short plain English) for every main line. Do NOT write Arabic for the main line (code fills ar). Do NOT write tips, asks, options, or image_spec.
9. Use only ITEM_DIGEST / MUST_COVER / RECYCLE / ALLOWED_PRIOR ids in ids[]. Prefer heard phrases for the character and said phrases for the learner. Never put pattern.*.ex.N in ids[] — use the parent pattern.* id.
10. WEEKLY reading: write reading.tl (60–120 words) using ONLY that week's items (WEEK_ITEMS). Exactly 3 questions (read_meaning or true_false). Omit reading on normal days.
`.trim();
}
