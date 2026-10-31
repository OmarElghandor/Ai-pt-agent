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
    "ids": ["item ids used in this line — never pattern.*.ex.N"],
    "extra": [{ "tl", "ar" }]  // ONLY words not in ALLOWED (today+prior+recycle); ≤15% of content tokens
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
1. Normal days: exactly 2 people — learner + the chat character from the brief. Optional narrator only if needed.
2. Line count: 6–10 normally, or up to 12 when the day has more than 8 core words. Weekly: 12–20 lines in 2–3 scenes. Learner speaks 2–4 lines on normal days.
3. Every core word, phrase and pattern from CORE_ITEMS must appear. A plural or another form of a pattern counts. Lists are natural and encouraged (e.g. "Tem pão, queijo e ovos.").
4. Today's grammar focus must appear in at least 2 lines — tag the pattern ids listed under GRAMMAR_FOCUS (e.g. pattern.article_gender, pattern.plural_s). Using o/a + noun or os/as + plural in the line also counts.
5. Every line is a phrase or full sentence — never a bare noun. Keep each line within max_words (phase max + 3).
6. A learner reply that answers a heard line must set replies_to to that earlier index.
7. Allowed vocabulary = today's CORE + RECYCLE + ALL prior days (ALLOWED_PRIOR). Extra words outside that set ≤15% of content tokens (function words do not count). List each true extra in extra[] with an Arabic gloss. Extras are never tested.
8. Do NOT write Arabic for the main line (code fills ar). Do NOT write tips, asks, options, or image_spec.
9. Use only ITEM_DIGEST / CORE / RECYCLE / ALLOWED_PRIOR ids in ids[]. Prefer heard phrases for the character and said phrases for the learner. Never put pattern.*.ex.N in ids[] — use the parent pattern.* id.
10. WEEKLY reading: write reading.tl (60–120 words) using ONLY that week's items (WEEK_ITEMS). Exactly 3 questions (read_meaning or true_false). Omit reading on normal days.
`.trim();
}
