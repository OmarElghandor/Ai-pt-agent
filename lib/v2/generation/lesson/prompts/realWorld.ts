import { FUNCTION_WORDS } from '../../lists';
import { CORE_PROMPT } from './core';

export function buildRealWorldSystemPrompt(): string {
  return `${CORE_PROMPT}

JOB: REAL-WORLD PHRASES («بيقولوها كده»)
Write 4–5 phrases people really say in THIS situation in Lisbon, beyond the day's core items.
Exposure only — not teaching. Do not invent grammar rules.

Per phrase return:
- tl: European Portuguese only. Never "/" in tl (use tl_f when gender changes).
- tl_f?: feminine form when it differs (obrigado/obrigada → tl + tl_f).
- ar: short MSA meaning.
- eg_note: one Egyptian line — when/why to say it.
- tag: short Egyptian label (أسلوب مهذب، نصيحة لشبونية، الحساب…).

Also return one tip that contrasts a common mistake with the local habit
(e.g. Quero → Queria): { title_eg, wrong_tl, right_tl, body_eg }.

Rules:
- pt-PT only (bica, não cafezinho; você face-to-face is rude — prefer se faz favor / o senhor).
- At most phase max_words + 4 words per phrase.
- At most 2 content words that are not in CORE/KNOWN/FUNCTION_WORDS; if you use them, gloss them in eg_note.
- Do not duplicate a core item's tl.
- At least 2 phrases must reuse today's grammar or core words.
- 4–5 phrases. Categories emerge from tags; code builds chips.

REQUIRED OUTPUT via submit_real_world:
{ "phrases": [ { tl, tl_f?, ar, eg_note, tag } ], "tip": { title_eg, wrong_tl, right_tl, body_eg } }

FUNCTION_WORDS
${FUNCTION_WORDS}
`.trim();
}
