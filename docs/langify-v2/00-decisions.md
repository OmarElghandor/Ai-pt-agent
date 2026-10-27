# 00 · Decisions (single source of truth)

If any other doc disagrees with this file, this file wins. Each line is a decision, not a suggestion. Decisions marked **(new)** came after the detailed Arabic docs were written and are not in them yet.

## 0. Platform (new, 2026-10-19)

- **Everything in v2 is built from scratch in one repo: `ai-agent-talk`** (folder `ai-pt-agent`). That covers content, renderer, cards, practice, the daily loop and generation.
  - Stack: Next.js 16 App Router, React 19, Tailwind 4, zod 4, Mongoose 9, the Anthropic SDK, plus the existing TTS and STT routes. Read the repo's `AGENTS.md` first, because this Next.js version differs from what models know.
- v2 is a **mobile-first web app (PWA)**, RTL, designed at 390px width and centered on wider screens. The Stitch designs are the visual target.
- The `langify` repo (Express backend plus the Expo app) is **legacy and frozen**. v2 reads only identity from it: Langify `users`, read-only, through `lib/langifyRead`, as today. v2 never writes Langify collections.
- All v2 data lives in this repo's own collections, prefixed `v2_`.
- The grader and the reactor are internal modules called by v2's own answer route. There is no cross-service HTTP and no shared secret.
- The old `/lessons` and `/chat` pages keep working until v2 replaces them; then they're removed.

## 1. Product shape

- Audience: Egyptian Arabic speakers living in Portugal, A0–A1. Target language: European Portuguese (pt-PT). Later: English and German on the same engine.
- **(changed 2026-10-25)** 90 days, ordered **grammar-first**. Each day is one grammar unit, following the unit order of Practice Portuguese A1: regular present -ar → -er → -ir, then ser/estar, then the irregulars, then the past. The unit is taught **inside a street situation** that needs it, and the situation supplies the phrases, the words and the character conversation.
  - Anything urgent for a resident (Queria…, O que é isto?, Fui ao…, Dói-me…) comes early as a **ready-made chunk**, and its rule comes later in its place in the order. Numbers are the one exception, with their own day (day 4).
  - Day 7 of every week is a story. Full plan: `04-curriculum.md`.
- **(new)** Lesson titles are the Portuguese unit titles (e.g. "Verbos -AR 1", "Possessivos"), shown with an Arabic translation and the situation under them.
  - When a day covers more than one of their units, the extra unit titles are listed on it.
  - Story days and day 29 have our own titles.
  - We reuse only the topic order and names, never their content.
  - Plan fields: `title_tl`, `title_ar`, `situation_eg`, `example_tl`, `rule_eg`, `extra_units_tl`, `early_chunks_tl`.
- **(new)** Days 1–30 are labeled **A1**, and weeks 5–8 start **A2**. This is aligned with the CIPLE A2 exam that residents need.
- SER vs ESTAR is now days 10–11. `examples/day06-example.json` is the ESTAR day, which is **day 11** in the new order. The file keeps its name, but its `day` is 11.
- A normal day has these steps, about 10 minutes in all: see the place (words) → situation phrases → one small rule → self-test → conversation with a character → review. Each step is one or more **pages**.
- The "Library" (المكتبة) is the book in its original order: rules, tenses, verb cards, picture dictionary, stories. A page unlocks there when the learner reaches it on the path.

## 2. Language and text

- The target-language field is always `tl` (feminine variant `tl_f`). Never name a field `pt`. The lesson has `target_lang` (`pt-PT`, later `en-GB`, `de-DE`).
- Two Arabic registers:
  - Meanings (`ar`, `ar_f`) are in simple Modern Standard Arabic (فصحى بسيطة).
  - Explanations, tips, coach lines, captions (`eg`) are in Egyptian Arabic.
- Pronunciation (`say`) is written in Arabic letters with these fixed mappings: g=ج, j=چ, s/ch (sh sound)=ش, initial r=غ, v=ڤ, p=پ, lh=لي, nh=ني, nasal sounds with a light ن. IPA (`ipa`) is optional and hidden by default.
- Any text that mixes Arabic and the target language is **rich text** (`rt`): a list of segments, each `{text, lang: eg|ar|tl, bold?, group?}`. The app sets direction per segment. Never build mixed strings by concatenation.
- Conjugated verb forms are **never written by an LLM**. They come from a verified conjugation table and are referenced by id `verb.<lemma>:<tense>:<person>`. Tenses: `inf, pres, pret, imperf, fut, cond, imp`. Persons: `eu, tu, ele, nos, eles` (always 5 rows; no vós). `ele` displays as "ele / ela / você"; o senhor uses the `ele` form.

## 3. Content model

- Four layers: **lesson → page → block → item**. Full spec: `02-content-schema.md`, example: `examples/day06-example.json`.
- Items are written once in the lesson's item bank: `word`, `phrase`, `sentence`, `form`, `pattern`. Blocks only reference items by id. Item ids are semantic and stable forever (`food.cheese`, `phrase.ask_price`, `verb.falar`).
- Exactly **14 block types**, closed list: heading, cards, table, compare, vs_pairs, formula, examples, tip, rules_list, dialogue, scene, panel, timeline, practice. No new block types without updating this file. Blocks never nest.
- Colors are **meanings**, never hex values in JSON: `group` ∈ `a, b, c, m, f, verb, prep, pron, neg, neutral`. In a comparison, the sides are a, b, c in order.
- Page `mode`:
  - `guided`: autoplay steps. Each step is `reveal` or `ask` and has a tip and a chapter. 12–20 steps, an ask about every 4th step, none in the first 3.
  - `explore`: controls (`reveal_axis`, `swap`, `unlock`) with `locked_until`.
  - `static`: everything visible.
- Target addressing inside a page: `b2`, `b2/col:0`, `b2/row:3`, `b2/cell:r:c`, `b2/entry:col:i`, `b4/item:2`.
- `cover` (the "غطّي" self-test) hides one of `meaning | tl | endings`.
- Presets (block order per page type): phrases, compare, conjugation, pattern, dictionary, scene, story, free.

## 4. Page experience

- **(new)** The visual reference for every content page is the **SER vs ESTAR** Stitch screen (`design/reference/01-grammar-page-guided-SER-ESTAR.png`). Content and chrome there are wrong (Spanish text), but the layout and components are the target. See `05-design-system.md`.
- Guided pages autoplay: a navy caption bar pinned at the bottom shows one Egyptian sentence per step, with the tutor's voice, chapter segments, pause and speed. The current block gets a pale-yellow highlight. Parts not revealed yet are shown faint at 20% opacity, not hidden, so the learner always sees the whole poster. Playback stops only at `ask` steps. "الصفحة كلها" reveals everything at once.
- Explore pages: the learner drives with controls (a person dial, verb swap chips). Each control has a short tip. Practice blocks unlock when all options of a control have been seen.
- Few taps. Never one tap per line.

## 5. Flashcards

- Cards exist for words, phrases and verbs. Function words get no cards.
- A card enters on the day its item is introduced (`introducedDay`).
- **Daily cap: 15 cards**, about 3 minutes, made of 9 from the last 7 days, 4 from weak items and 2 older ones. If a slot can't be filled, it goes to recent items. Missed days never pile up into a backlog, and backlog counts are never shown.
- A correct use of the item inside a lesson or practice counts as an implicit review.
- Buttons: تاني (again) / صعبة (hard) / سهلة (easy). There is also a "عارفها" option that skips an item the learner already knows.
- Graduation: interval ≥ 21 days **and** correct use in 2 different situations (`usedCorrectlyIn`). Graduation maps to `masteryLevel: mastered`, and graduated cards leave review.
- **(new) Retrieval first.** The front shows only the target word plus audio: a speaker button and a slow (turtle) button. Audio does not autoplay on the front. "محتاج تلميح" shows the word inside a sentence with no Arabic, and using it forces the rating to صعبة. Flipping plays the word once. The back shows the answer first (meaning, pronunciation, picture), then details.
- **(new) Verb card back** is a conjugation poster, 5 rows. Endings are colored by class: -ar orange, -er blue, -ir green. Irregular forms are purple with ⚡ (in pt-PT usually just `eu`, like DURMO). Regular forms are marked "عادي". Then examples and one tip.
- **(new) Deck listing:**
  - Hero card "مراجعة النهارده": 15 cards · 3 minutes, a breakdown line and an "ابدأ" button.
  - A "اللي بتغلط فيه" row.
  - Tabs: المواقف (situation decks, auto-built per day, newest first, future ones locked with "يفتح Dia N") and الأفعال (verb tiles colored by class, ⚡ for irregular).
  - A collapsed "اتخرّجت ✓ N" row.
  - Progress is shown as a count of graduated cards, never a percentage.
  - Deck detail lists items with no Arabic meanings, so the list itself works as a self-test.
  - Users don't create decks.

## 6. Daily loop and gaps

- 3 micro units a day:
  - Morning: a phrase plus a mission.
  - Midday: the next tool in a series.
  - Evening: a check-in plus due cards.
- Series are linked units. Example: "اطلب أي حاجة" goes Queria + noun → quantity → verb → Podia → Pode. Series listed in `03` and `04`.
- Four levels per item: سمعها (heard), فهمها (understood), قالها (said), استخدمها (used in a real exchange). The home screen shows "بتفهم N · بتقول M".
- «احكي يومك»: a daily speaking task that reuses recent items.
- Weekly situation test.
- A "نواقصك" (gaps) screen.

## 7. Question bank and SRS

- SRS is scheduled per **item × skill**, not per question. Skills: listening, reading, speaking, writing.
- Code generates mechanical questions from the item bank. Claude writes 10–15 crafted questions per day.
- Session mix: 40% due, 30% weak, 20% today, 10% stretch. A session is 10–12 questions.
- Validation is layered: code first (exact match, normalisation, accents, known alternatives), and an LLM only for what code can't decide.

## 8. Progress and errors

- **(changed)** Progress lives in new v2 collections in `ai-agent-talk`, not in Langify's `UserProgress`. State per item is one document per user × item (`v2_item_state`): `introducedDay`, `usedCorrectlyIn`, the 4 levels, and SRS state per skill (plus the card SRS). This replaces the old embedded `flashcardProgress` array. Errors are a separate append-only collection (`v2_errors`). The error taxonomy below keeps the same top-level names as Langify's `errorTypes`.
- Error taxonomy, two levels. The top level is the existing `errorTypes` enum:
  - grammar: verb_form, agreement, sentence_structure, preposition
  - vocabulary: forgot_word, wrong_word, brazilian
  - spelling: accent, spelling
  - pronunciation: sound
- Code classifies first, then the LLM classifies the rest. The LLM may answer `unclear`.
- Weak area: 3 errors with the same scope in the same tool within the last 10 attempts.

## 9. Practice agent

- **(changed)** One answer route (`/api/v2/answers`) owns validation and progress writes. The grader and the reactor are pure modules (`lib/v2/grader`, `lib/v2/reactor`) that never write state.
- **(new)** The grader uses Claude Haiku, non-streamed, with an 8s timeout. On a timeout, an error or invalid JSON, the verdict is `unclear` and it is never counted as a learner error. `arabic_only` is detected in code before any model call.
- **(new)** Max 2 attempts per speaking or writing beat. After the second miss, the coach gives the correct sentence, the character continues, and the beat is recorded as wrong. The reactor returns non-streamed JSON: `character_tl`, `coach_eg`, `advance`.
- **(new)** Beat fields follow the `tl` rule:
  - `prompt_tl`.
  - Reading: `question_eg`.
  - Listening: `audio_tl` (hidden line), `question_eg`, and options `{id, label, lang: tl|ar|num, correct}`.
- Grader: one non-streamed JSON call. Output:
  - `verdict`: correct, near_miss, wrong, off_topic, arabic_only or unclear
  - `items_used_correctly`
  - `errors` (max 3)
  - `main_error`
  - `corrected_tl`
  - `feedback_ar`
  - **(new)** `skill`, echoed back
- Reactor: Prompt 4 with SOURCE always `code`, so there's no hidden VERDICT line. Inputs: MAIN_ERROR, CORRECTED_PT, WEAK_SPOT. It corrects **one** error only.
- Modes: practice, daily (with Inês), open_question, assessment.
- **(new) Four skills inside one conversation.** Each beat has exactly one skill, and the screen changes with it. Listening and reading are graded by code (closed answers) and never go to the LLM. Speaking (STT) and writing go code first, then the grader.

  | Skill | In the story | The learner | Feeds |
  |---|---|---|---|
  | listening | The character speaks with text hidden until answered | Picks or types what they understood | بتفهم |
  | reading | A written thing: receipt, sign, label, menu | Answers about it | بتفهم |
  | speaking | The character asks | Answers by voice | بتقول |
  | writing | A friend's message, a note, a form | Types the answer (accent key row) | بتقول |

- **(new)** "مش قادر أتكلم دلوقتي" switches a speaking beat to writing, and it counts for writing only.
- **(new)** Packs have 8–14 beats, so the mix is a proportion: by default 30% speaking, 30% listening, 20% reading, 20% writing, rounded, with at least one beat of each skill. The mix is passed into generation (`skill_mix`), which shifts weight toward the learner's weak skill.
- **(new)** Two visible voices:
  - The character speaks in white bubbles, target language only. The meaning is behind "معناها؟"; the pronunciation in Arabic letters is shown.
  - The coach appears only in a yellow sticky note above the input, in Egyptian, with a skill chip.
  - Corrections show one error, in amber, never red. The character waits until the learner says it right.
- **(new)** Lesson end: a 2×2 grid of skill results, "بتفهم +N · بتقول +M", a "استخدمت صح" chip list, one focus note (it becomes tomorrow's card), and a button to keep chatting.

## 10. Images and media

- One style for everything: Warm Storybook plus an adult line, with no childish cues. Exact style block in `03`.
- Recurring cast: yassin, ines, rita, manuel, sofia, carlos. Each has a reference sheet.
- `image_spec` fields: type, subject, characters, pose, expression, setting, framing, light, must_show, must_avoid.
- Type templates: object, action, emotion, place, scene, story_panel. Images with characters get the reference sheets; images without characters get a style-anchor image.
- Model: `gpt-image-2.5-flare-2026-09-08` through the edits endpoint (with references). Medium quality; high only for reference sheets. Every image gets a vision QA pass with Haiku. Budget: about $30–45 for 90 days.
- No text inside generated images.
- Audio: Azure TTS pt-PT, cached. Whether Azure pronunciation assessment supports pt-PT is still unknown; check before building scoring on it.
- **(new)** Lesson **text** generation is staged and job-backed (`v2_jobs` + `npm run v2:worker`): outline → parallel pages (concurrency 6) ∥ questions → continuity pass → strict validate. Assets are **not** part of generate. `GENERATE_IMAGES` defaults to false; pages still store `image_spec` for later. TTS stays on-demand via `/api/tts` (optional warm script for published lessons). The prompts and step-by-step pipeline are in `08-lesson-generation-prompts.md`.

## 11. Open items

- Approve the pronunciation letter table (section 2) with a native speaker.
- Character sheets for rita, manuel, sofia and carlos.
- Native review of weeks 1–2 before release.
- Pilot: generate days 1–3 end to end before the rest.
