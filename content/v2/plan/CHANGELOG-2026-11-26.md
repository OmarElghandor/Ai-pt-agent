# Base files + generation gates (2026-11-26)

Audit of every lesson-generation stage against the base files. `npm run v2:validate-core-items` now also runs cross-file checks (`lib/v2/generation/lesson/planChecks.ts`): 55 issues on the old files, 0 now.

## pt-PT.days.json

- `grammar_focus` added on the 34 days that have their own pattern core item (8–12, 15, 17, 19, 20, 22–25, 27, 30–33, 35, 36, 39–45, 47–49, 51–54). Since 2026-11-23 the grammar page (pattern / compare) is only built when the day has **both** a pattern and a `grammar_focus`; only 6 days had a focus, so those pages were silently dropped. One pattern → `id` = the pattern id. Several patterns → `dayNN.grammar` (resolves to all of today's patterns). `description` = `rule_eg`.
- Days 3–6 `generation.recycle`: `phrase.greet_morning` → `phrase.good_morning`; `phrase.thanks` removed (no such id).

## pt-PT.core-items.json

- Day 3 `pattern.queria_um_uma` fills: removed `word.toast` (taught on day 4 → `unknown_item_ref` on day 3).
- Day 23 `word.good_bad` "bom / boa · mau / má" → "bom · mau"; `word.new_old` → "novo · velho". Day 45 `word.pretty_ugly` → "bonito · feio". Day 53 `word.some_none` → "algum · nenhum". The slash split turned "a / b · c / d" into broken variants; masculine pairs match the other adjective cards on those days, and agreement is taught on day 43.
- Day 36 `phrase.whats_the_date` "Que dia é hoje? — É dia cinco de março." → "A quantos estamos hoje?" (two sentences in one phrase; "Que dia é hoje?" is already day 35).

## conjugations/pt-PT.json

- Added 9 core verbs that had no table entry, so every form was `bad_form_id` (error) and the story allowed-word list had none of their forms: trabalhar, estudar, aprender, acordar, visitar, precisar, comprar (regular), por (pôr) and vestir_se (full overrides). All `verified: false` until reviewed.
- `formId.ts` / `resolvePack.ts`: verb form ids now accept `_` in the lemma (same as every other verb-id regex), so `verb.vestir_se:pres:eu` resolves.

## Pipeline gates

- `prepare_day` (bulk "جهّز الأيام الجاية" + learner on-demand) now runs the staged job graph (`prepare/lessonDag.ts`), not the legacy `lesson/run.ts` orchestrator. A draft whose graph failed or didn't finish goes to needs_review and is never auto-published (not even with dev force).
- Publish gate uses the same hard rules as assemble (`lesson/hardRules.ts`). Before, publish re-ran strict validation and refused lessons for rules assemble had already made warnings (pages_count, unknown_item_ref, …).
- Question planner (`questionSlots.ts`), fixes `coverage: speaking 2 < 3` on story days:
  - On story / test days (no core ids) the planner fell back to the recycled patterns and gave each the ≥2 grammar pair meant for today's new patterns. Day 7 got 4 grammar slots out of 12, leaving 8 seats for listening + writing + speaking minimums of 9. Recycled patterns now get 1 question each, and grammar only takes the seats left after the other skills' minimums.
  - Days with new patterns get enough seats for 2 per pattern + the other minimums (capped at 15).
  - A test day with only recycled patterns (day 56) uses the pattern example sentences for listening / writing / speaking.
  - Simulated on all 56 base days: 9 days failed the quota check before (1, 7, 14, 21, 29, 38, 46, 55, 56), 0 after.
