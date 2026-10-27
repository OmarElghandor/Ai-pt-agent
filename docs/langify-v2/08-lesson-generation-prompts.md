# Lesson generation — pipeline, steps, and prompts

Live reference for what the code sends. If this file and `03-generation-and-learning.md` disagree, this file matches `lib/v2/generation/`. `03` is the original spec (older page model, `PAGE STEPS`, `pt` / `say_ar` field names). Practice grader and reactor prompts stay in `03`; they are not part of lesson generation.

Entry points:

- Admin: `POST /api/v2/admin/generate/lesson/[day]` **enqueues** the DAG and kicks `runWorkerBatch` (non-batch Messages API). UI: `/v2-admin`, `/v2-admin/lessons/[day]`, `/v2-admin/quality`.
- Worker: `npm run v2:worker` claims ready jobs via `processLessonJob`.
- Range: `npm run v2:generate-range -- --from N --to M` runs **days in order** (day N brief uses day N−1 `day_digest`). `--batch` / `V2_GEN_BATCHES` is reserved (Message Batches not implemented yet).
- Sample: `npm run v2:gen-sample -- --profile qwen-light|qwen-all|claude` persists runs to `v2_gen_sample_runs`. Default profile is Kimi.
- Rerun: `POST /api/v2/admin/jobs/[jobId]/rerun`, `POST /api/v2/admin/lessons/[day]/rerun-stale`.
- Item hand-edit: `PATCH /api/v2/admin/lessons/[day]/items/[itemId]` → rehash → mark **done** dependents stale when hash changes.

Images and TTS are not part of the DAG. `GENERATE_IMAGES` / `image_specs` jobs stay off for day 1. Audio stays on-demand via `/api/tts`, with an optional warm script.

Legacy in-flight `generate_lesson` / monolithic `runStagedGeneration` rows are unsupported; generate again to create a DAG.

---

## Pipeline — linked jobs (DAG)

```
LessonBrief (code) ← yesterday day_digest
        │
        ▼
 items ──handoff item_digest──► outline ──plan_summary──► page × N ──full page──► critic × N
                                      │                      │                      │
                                      ├─► questions          └──page_digest─────────┤
                                      ├─► micro                                      ▼
                                      └─► daily_use                           continuity
                                                                                 │
                                                                                 ▼
                                                                              assemble → day_digest
```

After outline, **pages, questions, micro, and daily_use** run in parallel. Each page has a **critic**. Continuity and assemble wait on **every critic** (and thus on any critic-triggered page rerun).

### Critic loop

1. `page_i` → `critic_i` (input: brief + **full page** + allowed items).
2. High-severity + first time → requeue `page_i` once with notes; critic waits on page (`critic_regen`).
3. After rerun, `critic_i` runs again; high/medium/low are stored as **warnings** (no second page rerun; no `recorded_only` flag).

### Handoffs (`meta.handoffs.<job>` + job.handoff)

Derived in code from outputs (no extra model tokens): `brief`, `items` → `item_digest`, `outline` → `plan_summary`, `page:i` → `page_digest`, `questions` → `question_digest`, `micro` → `micro_handoff`, `assemble` → `day_digest`. Continuity receives **page_digests only**. Job docs also store `input`, `output`, `attempts`, `tokens` (incl. cache_*), timings.

| Kind | Who | Budget s/i/o | Writes |
| --- | --- | --- | --- |
| items | model | 600/1000/3000 | `data.items` + item_digest |
| outline | model | 400/800/800 | `data.outline` + plan_summary |
| page | model | 900/1500/3500 | `data.pages[i]` + page_digest |
| critic | model | 300/2500/300 | issues (record) |
| questions | model | 500/1200/3000 | `data.questions` |
| micro | model | 400/600/1200 | `data.micro` |
| daily_use | model | 400/600/1200 | `data.speak_prompts` |
| continuity | model | 300/800/100 | may requeue pages once |
| assemble | code | — | pack + `day_digest` + `text_ready` |

### Models (`lib/v2/generation/lesson/models.ts`)

Per-job `{provider, model}` from env (`V2_MODEL_ITEMS`, `V2_MODEL_PAGE`, …) as `kimi:…`, `anthropic:…`, or `openai-compatible:…`. Default provider is Kimi on DeepInfra: every model job uses `moonshotai/Kimi-K3` (`V2_KIMI_MODEL` overrides the id). `V2_GEN_PROVIDER=anthropic` or `claude`, or `npm run v2:gen-sample -- --profile claude`, restores items+page = `claude-sonnet-5-5` and outline/questions/micro/daily_use/critic/continuity = `claude-haiku-5-5`. `V2_GEN_PROVIDER=qwen` or `deepinfra` uses the Qwen OpenAI-compatible model. Kimi and Qwen share the DeepInfra host via `@ai-sdk/openai-compatible` (`DEEPINFRA_API_KEY`). Qwen requests set `chat_template_kwargs.enable_thinking: false`; Kimi requests do not. Anthropic prompt caching only when prefix ≥ model minimum (512 for 5.5 models; see Anthropic docs) — typically page jobs with preset examples. Claude 5.5 rejects forced `tool_choice` type `tool`/`any`; the client uses `tool_choice: auto` and prompts the model to call the submit tool once (zod validation + one retry still apply). Kimi uses forced tool choice on the OpenAI-compatible client.

### Code-owned structure (pipeline fixes)

- **Mode** is derived by `modeForPreset(preset)` — the model never chooses mode (phrases/dictionary/scene/free → static; compare/pattern/story → guided; conjugation → explore).
- **`say`** is filled by `transliteratePtToSay` after the items job; the model must not write `say`.
- **Steps** are a discriminated union: reveal requires `tip`; ask requires `ask`.
- **Targets** are block addresses only; `bN/item:i` indexes formula `examples[]` and panel/dialogue `lines[]`.
- **practice.questions** are filled at assemble from questions with matching `page_index` (page jobs leave them empty).
- **arabic_register** mismatches are errors (Egyptian in `ar`, MSA in `eg`).

### Lesson Brief (code)

`buildLessonBrief` → `{ day, phase, week, title_tl, title_ar, situation_eg, rule_eg, grammar_focus, max_words, chat_character, early_chunks_tl, core_items, core_items_tl, recycle_ids, no_new_items, planned_presets, yesterday, micro_step }`. **Core items** come from `content/v2/plan/pt-PT.core-items.json` (source of truth — never inferred from day-plan strings). Story days and day 30 have `no_new_items`. Items job must create exactly those ids (≤2 `extra:true`); `eg` is a hint. Recycle ids resolve against KNOWN. `yesterday` = previous day's `day_digest`. Items get **selected** known only (tl match on core/chunks + recycle ids), never the whole registry.

### Modular prompts

Under `lib/v2/generation/lesson/prompts/`:

| File | Role |
| --- | --- |
| `core.ts` | ≤150 words: pt-PT only, two Arabic registers, field names, phase length |
| `items.ts` | item bank, early chunks, reuse KNOWN ids |
| `outline.ts` | page plan only |
| `pageCatalog.ts` | core + preset block catalog + guided/explore |
| `questions.ts` | crafted quizzes, skill quotas, page_index |
| `micro.ts` | morning/tool/evening; tool has 2 self-contained drills |
| `dailyUse.ts` | speak_prompts (+ can_do) |
| `continuity.ts` | regenerate indexes |
| `imageSpecs.ts` | stub (not enqueued yet) |

Lists (`FUNCTION_WORDS`, `PRONUNCIATION_TABLE`, …) attach **only** where that job needs them.

**Preset examples:** `examples/presets/<preset>.json` (phrases, compare, conjugation, pattern, dictionary, scene, story). Page jobs put the matching file in the **cached system** block (`example_tokens` logged separately; excluded from over_budget on system). `free` gets no example.

### Budgets

Per-kind soft budgets in `BUDGETS` (see table above). Log `system`, `input`, `output`, `example_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`. Flag `over_budget` when non-example system/input/output exceed the kind’s row. Assemble prints the day budget + timing table. Admin Tokens tab shows bars + cache stats.

### Fine-grained `input_hash` + stale

Each `v2_jobs` row stores `kind`, `depends_on`, `input_hash`, status `queued|running|done|failed|stale`. Hash only what that job depends on (e.g. outline hashes `{id,type,tl}` only — editing `ar`/`say` does not stale outline; page hashes full allowed items). **Stale applies only to jobs currently `done`.**

### Course-wide `v2_items` registry

`KNOWN = registry ∪ items from draft/reviewed/published lessons with day < current` (registry wins on id). Items job must reuse KNOWN ids/tl; collide-on-tl errors. On **publish**, new items are written to `v2_items` (`first_day`); existing registry tl conflicts fail the publish.

### Worker concurrency

`claimReadyJobs` / `runWorkerBatch` run up to **6** ready jobs in parallel (`V2_JOB_CONCURRENCY`).

Every Claude job uses Anthropic **forced tool use**. `repairJson` remains only as a text fallback.

---

## What every Claude job receives

System blocks (`callJobTool`):

1. **Cached.** Modular system prompt + Lesson Brief text (+ preset example for page jobs).
2. **Not cached.** `JSON_OUTPUT_RULES`.

User body: job-specific payload. Forced tool whose `input` is the job JSON.

---

## Legacy monolithic system prompt (reference)

The old single prompt lived in `lib/v2/generation/lesson/systemPrompt.ts` and was used by `runStagedGeneration`. Prefer the modular files above. Historical body for comparison:

## Prompt 1 — System prompt (every stage)

Source: `lib/v2/generation/lesson/systemPrompt.ts`. The four lists are appended from `lib/v2/generation/lists.ts`.

```text
You are the lesson author for Langify, an app that teaches European Portuguese (as spoken in Lisbon) to Egyptian adults who live in Portugal or are moving there. You write ONE day of a 90-day course and return it only through the provided schema. No commentary.

THE LEARNER
An Egyptian adult in Lisbon who must handle real situations this week: the café, the supermarket, the tram, the pharmacy, the landlord, Finanças. Everything you write must be useful on the street today.

THE FORMAT
Each day is a set of pages from a printed study notebook built from blocks and presets. Write like the best study notebook: short, concrete, visual, no filler.
The assembled lesson has keys lesson, items, pages, questions, micro, speak_prompts. Each stage returns only the part its STAGE instructions ask for.

PORTUGUESE RULES
1. European Portuguese only: comboio, autocarro, elétrico, pequeno-almoço, telemóvel, casa de banho, bilhete, fixe, "estar a + infinitive" for ongoing actions. Never Brazilian forms: ônibus, trem, celular, banheiro, café da manhã, gerund (-ndo) for ongoing actions, "você" as the default "you".
2. Object and reflexive pronouns go after the verb in affirmative sentences: Chamo-me, Dói-me.
3. Polite requests use Queria / Podia and o senhor / a senhora.
4. Use ONLY words from NEW_ITEMS, KNOWN_ITEMS and FUNCTION_WORDS. If a sentence needs any other word, rewrite the sentence.
5. Maximum words per sentence: phase 1 = 7, phase 2 = 10, phase 3 = 14.
6. Every phrase must be something people really say in this situation in Lisbon.

ARABIC RULES (two registers)
1. MEANINGS are in simple Modern Standard Arabic: the ar / ar_f of words, phrases and story sentences, and quiz options that are meanings. Short, common words any Arab reader understands (أريد قهوة، كم السعر؟، شكرًا). No Egyptian words in meanings.
2. EXPLANATIONS are in Egyptian colloquial Arabic, the way people text each other: tip, note, feedback_eg, why_wrong_eg, quick rules, hints, mission, setting, context_eg. عايز not أريد, إزاي not كيف, ليه not لماذا, ده/دي not هذا/هذه, مش not ليس, هـ not سوف.
3. Fixed spellings in explanations: عايز (never عاوز), النهارده, دلوقتي, كده.
4. Translate the meaning, not word by word. If the literal meaning teaches something, put it in "note".
5. Whenever the Portuguese or the Arabic changes with the speaker's gender, fill tl_f and ar_f.

PRONUNCIATION (say)
Write how a Lisbon speaker says it, in Arabic letters, following PRONUNCIATION_TABLE exactly. Put European Portuguese IPA in "ipa".

TEACHING RULES
1. One new rule per day: GRAMMAR_FOCUS. Do not present anything else as a rule.
2. Every item in RECYCLE appears at least once in the day.
3. Every item in NEW_ITEMS appears at least 3 times across the day (its page, a quiz, and the chat or an example).
4. Tips are real Lisbon usage or culture, never generic study advice.
5. Quizzes: exactly one correct answer; wrong options are plausible and come from the same day or category; no joke options.
6. Chat: the character speaks naturally, using only allowed words; every learner turn can be done with today's phrases.
7. Early chunks (early_chunks_tl) are taught as ready-made phrases: introduce them as phrase items, use them in examples and quizzes, never explain their grammar today.

IMAGES
1. Words, scenes, the day cover and story panels need an image key. If EXISTING_IMAGE_KEYS has the same concept, reuse that key and leave image_spec empty.
2. Otherwise create a new key (lowercase English, category.concept, e.g. food.cheese, verb.go, emotion.tired, scene.pharmacy.counter) and fill image_spec.
3. image_spec describes only what is visible, in plain English. One clear subject. No text, letters, numbers or readable signs. Refer to characters only by their id from CHARACTERS. For a verb, show a character in the middle of the action so it is understood without words.
4. Phrases never get images; pick their icon from ICONS only.

FLASHCARDS
For every phrase, also write context_eg (one Egyptian line: when you say it) and cloze (the one key word to hide; it must be a word of that phrase).

MICRO
Write the day's three micro units under "micro":
- morning: one phrase from today and mission_eg, a small real task the learner can do today in Lisbon (Egyptian).
- tool: the step given in MICRO_STEP. builds_on_eg links it to the previous step in one Egyptian line. examples = 3 sentences that use the tool and only allowed words. notice = a "what did you notice?" question with 3 options, exactly one correct. rule_eg = the rule in one Egyptian line, shown after the answer. drills = 2 quiz items.
- evening: teaser_eg, one Egyptian line about tomorrow's situation.

PAGES
Build every page from the block catalog only: heading, cards, table, compare, vs_pairs, formula, examples, tip, rules_list, dialogue, scene, panel, timeline, practice. Never invent a block type or put a block inside a block.
1. Pick a preset for each page: phrases, compare, conjugation, pattern, dictionary, scene, story. Use free only when none fits, and say why in preset_reason.
2. Blocks never hold target-language text directly. They point to items by id. Write each new word, phrase, sentence and pattern once in ITEMS.
3. Conjugated verbs are never written by you. Refer to them as form ids: verb.<lemma>:<tense>:<person>, with tense one of inf, pres, pret, imperf, fut, cond, imp and person one of eu, tu, ele, nos, eles. Use only lemmas in VERB_TABLE.
4. Any text that mixes Arabic and the target language is rich text: a list of segments, each with text, lang (eg, ar or tl) and an optional group.
5. Colors are meanings, not colors: group is one of a, b, c, m, f, verb, prep, pron, neg, neutral. Sides of a comparison are a, b, c in order.
6. guided pages need steps (12-20, an ask about every fourth step, none in the first 3). explore pages need controls. static pages need neither.

DAILY USE
- speak_prompts: 3-4 questions about the learner's own real day, in Egyptian (e.g. اشتريت إيه النهارده؟). Each has a model answer in Portuguese using only allowed words, and the ids it uses. Prefer today's items plus RECYCLE.
- can_do: 2-3 things the learner can now do in this situation (Egyptian, e.g. تدفع بالكارت), each linked to the phrase ids that prove it. Put these on lesson.can_do as { eg, proves }.

CHARACTERS
yassin — Egyptian learner, late 20s, olive-green jacket, white t-shirt, dark jeans, white sneakers, brown backpack
ines — Portuguese colleague/friend, late 20s, mustard cardigan, navy-and-white striped top, dark grey trousers
rita — supermarket cashier, about 45, short dark bob, reading glasses on a cord, navy polo uniform
manuel — café owner, about 60, short grey hair, grey moustache, white shirt, dark brown apron
sofia — pharmacist, about 35, black hair in a low bun, white coat over light blue blouse
carlos — landlord, about 50, stocky, salt-and-pepper hair, beige sweater, dark trousers

ICONS
home, work, cafe, food, cart, map, train, bus, phone, heart, smile, sad, tired, clock, money, card, bag, water, bread, milk, cheese, apple, fish, chicken, rice, sugar, meat, coffee, tea, doctor, pharmacy, family, clothes, color, star, check, help, speak, listen, book, sun, moon, rain, bed, door, key, lock, person, group, question, warning, tip, sound, slow, replay

FUNCTION_WORDS
a, o, as, os, um, uma, uns, umas, de, do, da, dos, das, em, no, na, nos, nas, a (to), ao, à, aos, às, por, para, com, sem, e, ou, mas, que, se, não, sim, eu, tu, ele, ela, você, nós, eles, elas, me, te, se, nos, o senhor, a senhora, isto, isso, aquele, aquela, este, esta, esse, essa, muito, mais, menos, também, já, ainda, agora, hoje, amanhã, ontem, aqui, ali, onde, quando, como, porquê, porque, por favor, obrigado, obrigada

PRONUNCIATION_TABLE
Write say in Arabic letters using this mapping exactly:
g → ج
j → چ
s/ch when it sounds like English "sh" → ش
r at the start of a word → غ
v → ڤ
p → پ
lh → لي
nh → ني
nasal vowels (ão, ãe, õe, im, om, um) → add a light ن
Use European Portuguese IPA in the ipa field when present.
```

On pages, questions, and continuity, this block is followed by a compact `DAY` header and then:

```text
ITEM_BANK (authoritative; pages may only use ids from introduces∪assumes of their plan entry)
<outline items as compact JSON>
```

---

## Prompt 2 — JSON rules (system, not cached)

Source: `JSON_OUTPUT_RULES` in `lib/generation/claudeClient.ts`.

```text
JSON OUTPUT RULES (mandatory)
- Reply with ONE JSON object only. No markdown fences, no commentary before or after.
- Valid JSON: double-quoted keys and strings, commas between elements, no trailing commas.
- Escape every " inside string values as \". No raw newlines inside strings (use \n).
- Do not truncate. Finish every array and object. The response must parse with JSON.parse.
```

The same rules are repeated at the end of every user message (`USER_JSON_FOOTER` in `lib/v2/generation/lesson/stages/jsonFooter.ts`):

```text
JSON OUTPUT (mandatory — reply with nothing else)
- ONE JSON object only. No markdown fences. No commentary before or after.
- Double-quoted keys and strings. No trailing commas. Escape " inside strings as \".
- Finish every array and object. Do not truncate.
```

---

## Prompt 3 — JSON repair (only when parse fails)

Source: `repairJson` in `lib/generation/claudeClient.ts`. Separate call. System:

```text
JSON OUTPUT RULES (mandatory)
- Reply with ONE JSON object only. No markdown fences, no commentary before or after.
- Valid JSON: double-quoted keys and strings, commas between elements, no trailing commas.
- Escape every " inside string values as \". No raw newlines inside strings (use \n).
- Do not truncate. Finish every array and object. The response must parse with JSON.parse.

You fix broken JSON. Return only the corrected JSON object.
```

User:

```text
This text was meant to be one JSON object but failed to parse (<parse error>).
Return the same content as valid JSON only. Close any truncated arrays/objects. Do not add commentary.

BROKEN:
<model text, truncated at 120 000 characters>
```

---

## Prompt 4 — Day request (outline user message, first half)

Source: `buildDayRequest`. Values in `{braces}` are filled from the plan and the database. Nothing in this block is handwritten per day.

```text
Write day {day} of 90.

DAY
kind: {lesson|story}
phase: {phase} · week: {week}
title: {title_tl} · {title_ar}
situation: {situation_tl} · {situation_eg}
example_tl: {example_tl}
rule_eg: {rule_eg}
extra_units_tl: {extra units, or (none)}
early_chunks_tl: {early chunks, or (none)}
can_do: {can_do joined with · , or rule_eg}
grammar_focus: {id — description (layout: …)}
chat_character: {id, default ines}
dictionary_category: {category, default general}
MICRO_STEP: {series} · step {n} of {of} · previous: {previous|none} · today: {today}
tomorrow: {tl} · {eg}

NEW_ITEMS
words: {comma-separated, or (none)}
phrases: {joined with · , or (none)}

KNOWN_ITEMS
{id}: {tl} · {id}: {tl}
(or "(none yet)")

RECYCLE
{ids, or (none)}

VERB_TABLE
{verified lemmas, comma-separated}

PAGE_PLAN
1. {preset} — {focus}
2. …

EXISTING_IMAGE_KEYS
{keys, or (none)}

FIELD NAMES
Use schema field names: tl / tl_f (never pt), ar / ar_f, say (never say_ar), context_eg, eg for Egyptian explanations. lesson.target_lang = "pt-PT". lesson.day = {day}. lesson.id = "pt-PT.d{dd}".
```

Story days insert this before `NEW_ITEMS`:

```text
story_outline:
- {line}
max_new_words: {n}
```

Then the gold example block (outline only), then Prompt 5.

---

## Prompt 5 — Outline stage instructions

Appended to the day request. Source: `runOutlineStage`.

```text
STAGE: OUTLINE ONLY
Return ONE JSON object with:
- items: full item bank for the day (words, phrases, sentences, patterns as needed). Do NOT put conjugated verb surface forms; use form ids later.
- pages: ordered page plan. For EACH page:
  { index (0-based), page_id, preset, mode, title (short Egyptian or plain string), purpose (one line), introduces: item_ids (first appearance), assumes: item_ids (already introduced earlier), handoff (one line: what the next page builds on) }
- lesson: optional meta { situation, can_do, kind, week, phase }

SKELETON (fill this shape):
{
  "items": [{ "type": "phrase", "id": "phrase.hello", "tl": "Olá!", "ar": "مرحبا." }],
  "pages": [{
    "index": 0,
    "page_id": "p1",
    "preset": "phrases",
    "mode": "guided",
    "title": "جمل",
    "purpose": "…",
    "introduces": ["phrase.hello"],
    "assumes": [],
    "handoff": "…"
  }],
  "lesson": { "situation": { "tl": "…", "eg": "…" }, "can_do": [{ "eg": "…", "proves": ["phrase.hello"] }] }
}

Rules:
- introduces are disjoint across pages.
- assumes ⊆ items introduced on earlier pages.
- Cover NEW_ITEMS and RECYCLE. Every new item id appears in exactly one introduces list.
- Match PAGE_PLAN presets when given.
- Do NOT write page blocks, steps, or questions in this stage.
- Pattern item slots must be { "tl": "..." } or { "name_eg": "..." }.
- VERB_TABLE lemmas only: {verified lemmas}
```

Schema retry appends:

```text
PREVIOUS OUTPUT FAILED SCHEMA:
{zod error}
Return valid outline JSON only. Pattern item slots must be { "tl": "..." } or { "name_eg": "..." }.
```

---

## Prompt 6 — One page

Source: `buildPageUserPrompt`. One call per page. `{allowed}` is that page's introduces ∪ assumes.

```text
STAGE: ONE PAGE ONLY
Write ONLY page index {index} ({page_id}).

FULL OUTLINE (order contract — do not reorder):
{index}. {page_id} [{preset}/{mode}] "{title}" — {purpose}
   introduces: {ids}
   assumes: {ids}
   handoff: {handoff}
…every page, not only this one…

THIS PAGE PLAN ENTRY:
{the plan entry as JSON}

Allowed item ids for this page (introduces ∪ assumes): {allowed}
VERB_TABLE: {verified lemmas}

SKELETON (fill this shape; do not invent alternate field names):
{
  "page": {
    "id": "p1",
    "preset": "phrases",
    "mode": "guided",
    "title": [{ "text": "…", "lang": "eg" }],
    "blocks": [
      { "id": "b1", "type": "heading", "text": [{ "text": "…", "lang": "eg" }] },
      { "id": "b2", "type": "cards", "items": ["phrase.hello"] },
      {
        "id": "b3",
        "type": "compare",
        "columns": [
          {
            "head": [{ "text": "A", "lang": "eg" }],
            "group": "a",
            "entries": [{ "ref": "phrase.hello", "label": [{ "text": "Olá", "lang": "tl" }] }]
          },
          {
            "head": [{ "text": "B", "lang": "eg" }],
            "group": "b",
            "entries": [{ "ref": "phrase.thanks", "label": [{ "text": "Obrigado", "lang": "tl" }] }]
          }
        ]
      }
    ],
    "steps": [{ "target": "b1", "kind": "reveal", "tip": [{ "text": "…", "lang": "eg" }] }]
  }
}
```

When `mode` is `explore`, this is inserted before the rules:

```text
EXPLORE controls skeleton (required when mode=explore):
[
  { "id": "c1", "type": "reveal_axis", "target": "b2", "axis": "rows", "tips": [[{ "text": "…", "lang": "eg" }]] },
  { "id": "c2", "type": "swap", "target": "b2", "options": ["verb.ser", "verb.estar"] },
  { "id": "c3", "type": "unlock", "target": "b3" }
]
```

Rules, always:

```text
Rules:
- page.id = {page_id}, preset = {preset}, mode = {mode}
- Every block MUST have string id: b1, b2, b3, … (never omit id)
- compare.columns[] MUST use head (rt array), group (a|b|c), entries: [{ "ref": "item.id", "label": [{ "text": "…", "lang": "tl" }] }] — never title/items
- Use ONLY allowed item ids above (plus verb.* form ids from VERB_TABLE)
- Every introduces id MUST appear on this page
- Fill image_spec when creating a new image key; reuse EXISTING keys when possible
- guided: steps 12–20; explore: controls; static: neither
- explore controls: axis must be exactly "rows" or "cols"; reveal_axis.tips required as array of rt (e.g. [[{text,lang}]]); swap.options required string[]; control ids c1, c2, …
- dialogue/panel.lines = string item ids only (not objects)
- practice.questions = string question ids only
- cards.items = string item ids only
- Prefer cards/examples/tip/heading over complex table/scene/timeline unless preset requires them
```

Retry appends:

```text
PREVIOUS ERRORS — fix all:
- [{rule}] {path}: {message}
```

Continuity regeneration uses this same prompt, without the previous-error block, unless that page also fails validation on the regen attempt.

---

## Prompt 7 — Questions + micro + speak_prompts

Source: `runQuestionsStage`. Tool: `submit_questions_day`.

```text
STAGE: CRAFTED QUESTIONS + MICRO + SPEAK_PROMPTS
Return JSON matching this skeleton (call the submit_questions_day tool):
{ "questions": [...], "micro": {...}, "speak_prompts": [...] }

Requirements:
- 10–15 questions total; at least 3 listening, 3 reading, 2 writing.
- Each question MUST include page_index (0-based) and may only test items introduced on that page or earlier.
- micro / speak_prompts per MICRO and DAILY USE; drills must be question ids from this response.

DAY CONTEXT:
MICRO_STEP / tomorrow / NEW_ITEMS / RECYCLE

OUTLINE:
{index}. {page_id} introduces=[{ids}] assumes=[{ids}]

ITEM BANK ids: {all item ids}
```

Schema retry appends:

```text
PREVIOUS FAILED SCHEMA:
{zod error}
Return { "questions": [...], "micro": {...}, "speak_prompts": [...] } only.
```

---

## Prompt 8 — Continuity

Source: `runContinuityPass`. The lesson summary is compact: day, and per page the index, id, preset, mode, title, block types, up to four tips, and up to five step tips.

```text
STAGE: CONTINUITY PASS
You review one assembled lesson for pedagogy continuity. Return JSON matching:
{ "regenerate": [0, 2], "notes": "optional short note" }

Flag a page index if:
- it repeats the same example or tip almost verbatim as an earlier page
- duplicated tips across pages
- a jump in sequence (assumes knowledge not prepared by prior pages' purposes)

Return at most 3 indexes. Empty regenerate [] means OK. Max one regeneration round will follow.

LESSON SUMMARY:
{compact JSON}
```

---

## Pipeline B — images (separate, off by default)

Runs only when `GENERATE_IMAGES=true` and the text draft is not flagged (`generateLessonFull` / `generatePackImages`). Claude never writes this prompt. It only writes `image_spec`. Code builds the image prompt in `lib/v2/generation/images/templates.ts` and sends it to the OpenAI edits endpoint with reference images.

Order of one image:

1. Skip if the key already exists on disk.
2. Attach character reference sheets when `image_spec.characters` is non-empty. Otherwise attach the style-anchor image. Missing refs flag the key and skip the model.
3. Build the prompt (below) and pick the size: `1024x1024` for object, action, emotion; `1536x1024` for place, scene, story_panel.
4. Generate, then Haiku vision QA.
5. On QA failure, generate once more and check again. A second failure flags the image.

### Image prompt template

```text
{reference line}

{STYLE_PROMPT}

{type body}

Must show: {must_show, or "the subject clearly"}. Avoid: {must_avoid, or "text, letters, numbers, watermarks"}.
```

Reference line when the image has characters:

```text
Use the attached reference images for the exact look of these characters: {Names}. Same face, hair, skin tone, outfit and colors. Draw each named character exactly once.
```

Reference line when it does not:

```text
Use the attached image only as a style reference: same line weight, colors and shading. Do not copy its subject.
```

Style block (`STYLE_PROMPT`):

```text
Friendly educational cartoon illustration for adult learners, clean bold dark-navy outlines of even weight, flat colors with soft subtle shading, warm cheerful palette (sunny yellow, sky blue, leaf green, coral, soft orange), plain warm cream background, centered subject with generous empty space around it, modern language-learning textbook style. Adult realistic body proportions, small natural eyes, subtle expressions, not cute, not childish, no chibi, no big heads. No text, no letters, no numbers, no watermark.
```

Character descriptions substituted for ids:

| id | text inserted into the prompt |
| --- | --- |
| yassin | Yassin (Egyptian man in his late 20s, warm light-brown skin, short dark curly hair, neat short beard, olive-green jacket over a plain white t-shirt, dark blue jeans, white sneakers, brown backpack) |
| ines | Inês (Portuguese woman in her late 20s, fair skin with light freckles, shoulder-length wavy chestnut hair, mustard-yellow cardigan over a navy-and-white striped top, dark grey trousers, brown ankle boots, small gold earrings) |
| rita | Rita (Portuguese woman about 45, short dark-brown bob, reading glasses on a cord, navy polo shirt uniform with a blank name badge) |
| manuel | Manuel (Portuguese man about 60, short grey hair, grey moustache, white shirt with rolled sleeves, dark brown apron) |
| sofia | Sofia (Portuguese woman about 35, black hair in a low bun, white coat over a light blue blouse) |
| carlos | Carlos (Portuguese man about 50, stocky, short salt-and-pepper hair, beige knitted sweater, dark trousers) |

Type bodies:

| type | body |
| --- | --- |
| object | Subject: a single {subject}, three-quarter view from slightly above. Isolated, nothing else in the frame, no hands, no people, no plate or table unless part of the subject. |
| action | Subject: {characters or "a person"} {subject}, {pose}, {framing or "full body"}, {expression}. Setting: {setting or "simple background"}, kept simple and in the background. The action must be instantly clear without any words. |
| emotion | Subject: {characters or "a person"} showing {subject}, {expression}, {pose}, upper body, front view. No background objects. |
| place | Subject: the outside of {subject} in Lisbon, {setting}, {light}. All signs are blank shapes with no letters. |
| scene | Wide view of {subject}, {setting}. {characters} {pose}. {light}. Background people are simple and unnamed. All signs, labels, price tags and screens are blank. |
| story_panel | Comic panel. {characters} {subject}, {pose}, {expression}. Setting: {setting}. {framing}, {light}. Cinematic composition, no speech bubbles, no captions, no sound effects. |

### Prompt 9 — Vision QA (Haiku)

Source: `lib/v2/generation/images/visionQa.ts`. The image is attached. `{expectedPeople}` is `characters.length` (0 when there are none). `{subject}` is `image_spec.subject`.

```text
Answer these 4 questions about the illustration with YES or NO only, as JSON:
{"no_text":true/false,"person_count_ok":true/false,"subject_clear":true/false,"style_ok":true/false}

1. no_text: Is there NO readable text, letters, or numbers in the image? (true = no text)
2. person_count_ok: Is the number of foreground people exactly {expectedPeople}? (true if yes; if expected is 0, true only when no named people in the foreground)
3. subject_clear: Is the subject "{subject}" clear without explanation?
4. style_ok: Does it look like a cream-background navy-outline educational cartoon?

JSON only.
```

All four answers must be true.

---

## Code checks (not prompts)

Strict validation is `validateLessonPack` (`lib/v2/content/validate.ts`). Soft warnings after that are `runGenerationChecks`:

| Check | What it flags |
| --- | --- |
| Brazilian forms | ônibus, trem, celular, banheiro, café da manhã, sentence-initial você |
| Sentence length | phase 1 = 7 words, phase 2 = 10, phase 3 = 14, on `tl` strings |
| Register | MSA words inside Egyptian fields; Egyptian words inside `ar` / `ar_f` |

Outline, page, and question stages add their own ref checks before the final pass (see steps A–C).
