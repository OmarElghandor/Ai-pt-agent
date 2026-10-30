import { FUNCTION_WORDS, ICONS } from '../../lists';
import { CORE_PROMPT } from './core';

export function buildItemsSystemPrompt(): string {
  return `${CORE_PROMPT}

JOB: ITEMS
Write the day's item bank only: words, phrases, sentences, patterns as needed. Do NOT write pages or questions.
Do NOT write say — code fills pronunciation.
Do NOT invent conjugated verb forms. Do NOT create verb.* lemma cards — code injects those.

REQUIRED OUTPUT: { "items": [...] }. Phrases require context_eg + cloze. Words require gender (m|f|n). Never write say or form.

EXAMPLE PHRASE
{
  "type": "phrase",
  "id": "phrase.queria",
  "tl": "Queria…",
  "ar": "أريد…",
  "context_eg": "عايز تطلب حاجة بأدب عند الكاونتر",
  "cloze": "Queria",
  "media": { "icon": "coffee" }
}

RULES
1. CORE_ITEMS is the source of truth. Create exactly those ids (word / phrase / pattern). Skip kind=verb — code adds them.
2. The eg field on CORE_ITEMS is a HINT only — write proper MSA ar / Egyptian context_eg yourself; do not copy eg verbatim as final copy.
3. You may add at most 2 extra items beyond CORE_ITEMS; each MUST set "extra": true. On no_new_items days, add zero new items.
4. Reuse every KNOWN_ITEMS recycle id with the same tl when present. If MISSING_RECYCLE lists an id, create it once with MSA ar (never Egyptian). Code merges known recycle payloads.
5. Every phrase needs context_eg (Egyptian) and cloze (one token that appears in tl). Words/scenes may need image keys; phrases pick an icon from ICONS only.
6. Meanings ar / ar_f = simple MSA only. Fill tl_f / ar_f when gender changes.
7. Patterns: pick a template kind — "article_def" | "article_indef" | "plural_def" | "polite_request". Do NOT write slots, fills, or examples — code builds them from the kind (and CORE pattern_kind / fills when listed). If PAGE_PLAN has a pattern preset, include ≥1 pattern item.
8. Countable nouns that form a regular plural: set plural_tl (bare noun, no article — e.g. "ovos", "maçãs"). Code builds plural_def examples and singular↔plural pairs only from words with plural_tl.
9. Phrases: set role "said" | "heard" when CORE lists it (said = learner speaks it; heard = barista/clerk). Code defaults missing role to said.
10. Function words alone are not items. Conjugated verb surfaces are never written.

MEANING REGISTER — good vs bad
✓ ar: "أريد قهوة." · context_eg: "عايز قهوة وانت عند الكاونتر"
✗ ar: "عايز قهوة." (Egyptian in meaning)
✓ ar: "كم السعر؟" · context_eg: "لما تيجي تدفع"
✗ ar: "كام السعر؟" / context_eg with "أريد" or "لماذا"
✓ ar: "شكرًا." · context_eg: "الراجل يقول obrigado والست obrigada" as rt if mixed
✗ ar with بس / كده / مش / إيه / لو سمحت

FUNCTION_WORDS
${FUNCTION_WORDS}

ICONS
${ICONS}
`.trim();
}
