# 07 · Build plan (repo: ai-agent-talk)

Nine phases, all in the `ai-agent-talk` repo (folder `ai-pt-agent`). Run each phase in its own Cursor Agent chat. Each phase lists the docs to read, the tasks, a "done when" checklist and a prompt to paste. Phases 0 → 1 → 2 come first; they're the backbone. After that, 3, 4 and 6 can run in parallel.

Every chat starts with: "Read `AGENTS.md`, then `docs/langify-v2/00-decisions.md` (the tie-breaker) and `01-architecture.md`. Build v2 under `app/(v2)`, `app/api/v2`, `lib/v2`, `components/v2`. Don't change the old `/lessons` and `/chat` pages unless the task says so."

> **Status (2026-10-23):** Phases 0 and 1 are done. The conjugation seed is reviewed for ser, estar, ir, ter, dormir, falar, querer, poder, fazer, dizer, ver, sair, ficar and chegar (`verified: true`). The rule engine handles spelling changes (cheguei, fiquei, conheço, protejo) and computes `irregular` per form. Phases 2, 3 and 4 run in parallel, each on its own branch or worktree (`v2-phase2`, `v2-phase3`, `v2-phase4`), merged one at a time.

> If Cursor already made a plan for "stateless grade/react endpoints with a shared secret", drop it. In the single-repo setup, the grader and the reactor are internal modules (Phase 6).

---

## Phase 0 · Foundations

**Read:** 00 (§0), 01, 05.

**Tasks**
- A route group `app/(v2)` with its own layout:
  - `dir="rtl"`, `lang="ar"`, a paper background and a centered app column (max 480px);
  - fonts through `next/font` (Barlow Condensed, Lalezar, Newsreader, IBM Plex Sans Arabic, Work Sans);
  - the tab bar المسار · الكروت · المكتبة · أنا.
  - Pages: `/path`, `/cards`, `/library`, `/me`.
- Design tokens as CSS variables plus Tailwind 4 `@theme`, exactly as in `05`.
- Core components in `components/v2`:
  - RichText (per-segment `dir` and isolate, group colors);
  - AudioButton (normal and slow, using the existing `/api/tts`);
  - Chip, SkillChip, TitleBadge, Panel, RuleRow, ExampleRow, StickyNote, CaptionBar, ProgressDots, buttons.
- `/v2-dev`: one page showing every component and state.
- A PWA manifest and icons (installable).
- A `V2_ENABLED` flag.

**Done when**
- `/v2-dev` matches the look of `design/reference/01-grammar-page-guided-SER-ESTAR.png` for the shared parts.
- The mixed line «الجبنة = o queijo» renders in the right order.
- No hex values appear outside the tokens file.
- No horizontal scroll at 360px.

**Prompt**
> Read AGENTS.md, docs/langify-v2/00-decisions.md (§0), 01-architecture.md and 05-design-system.md. Create the v2 route group app/(v2) with an RTL layout, fonts via next/font, the design tokens as CSS variables exposed through Tailwind 4 @theme, and the tab bar (المسار · الكروت · المكتبة · أنا) with empty pages. Build the core components listed in 05 under components/v2, starting with RichText (array of {text, lang: eg|ar|tl, bold?, group?}, each segment its own span with dir and unicode-bidi isolate). Add a /v2-dev page showing every component and state, and a PWA manifest. Match design/reference/01-grammar-page-guided-SER-ESTAR.png.

---

## Phase 1 · Content schema, conjugations, lessons API

**Read:** 00 (§2–3), 02, `examples/day06-example.json`.

**Tasks**
- Types and zod schemas in `lib/v2/content/`: lesson, page, the 14 blocks, the 5 item types, rt, steps and controls.
- A validator with every rule in the "التحقق" section of `02`:
  - every ref resolves;
  - every form id exists in `v2_conjugations`;
  - targets point to real blocks or parts;
  - guided pages have 12–20 steps, no ask in the first 3, an ask at least every 4;
  - table cell counts match the columns;
  - each ask has exactly one correct option;
  - group values come from the list;
  - mixed text uses rt;
  - mobile limits per block are respected.
- Models `v2_conjugations` and `v2_lessons`.
- A conjugation seed in `content/v2/conjugations/` for the day 1–30 verbs (ser, estar, ter, ir, querer, poder, fazer, falar, comer, abrir, morar, chegar, beber, viver, partir, decidir, dormir, gostar, ficar, dizer, ver, sair), tenses pres and pret, with the irregular flag. Note the source in the seed file.
- A script that loads `examples/day06-example.json` as a published Day 6.
- GET `/api/v2/lessons/[day]`, which resolves form ids to text.

**Done when**
- Day 6 passes.
- Five broken copies each fail with a clear message: a bad ref, a bad form id, an ask in step 2, a wrong cell count, a raw mixed string.
- The route returns Day 6 with forms resolved.
- Tests are in `tests/` and wired into `npm test`.

**Prompt**
> Read docs/langify-v2/00-decisions.md (§2–3), 02-content-schema.md (Arabic text, English field names) and examples/day06-example.json. In lib/v2/content, write zod schemas and TypeScript types for the content model and a validator implementing every rule in the "التحقق" section. Add Mongoose models v2_conjugations and v2_lessons, a conjugation seed for the verbs listed in 07-build-plan Phase 1, a script to load Day 6, and GET /api/v2/lessons/[day] that resolves form ids. Add tests: Day 6 passes; five broken variants fail with clear messages.

---

## Phase 2 · Page player

**Read:** 02, 05, 06 (S3), `prototypes/ser-estar.html`, `prototypes/verb-endings.html`, reference images 01–05.

**Tasks**
- One React component per block type (14) in `components/v2/blocks/`.
- A Page player with three modes:
  - **guided:** autoplay steps; highlight the target; unrevealed parts at 20% opacity; the caption bar plays the tip through TTS; asks pause, post the answer and continue; chapters, pause, speed and "الصفحة كلها".
  - **explore:** `reveal_axis` (the person dial), `swap` (recompute forms from conjugations), `unlock` with `locked_until`.
  - **static.**
- Cover and Quiz.
- The routes `/day/[day]` (the day map, S2) and `/day/[day]/page/[pageId]` (the player).
- The prototypes are plain HTML and JS: port their behaviour and timing directly.

**Done when**
- Day 6 page 1 plays like `ser-estar.html`: autoplay, stops only at asks, and the caption bar never covers content.
- Page 2 behaves like `verb-endings.html`.
- Every block type has a fixture on `/v2-dev`.

**Prompt**
> Read docs/langify-v2/02-content-schema.md, 05-design-system.md, 06-screens.md (S2, S3). Open prototypes/ser-estar.html and prototypes/verb-endings.html: port their behaviour and timing. Build the 14 block components in components/v2/blocks, a Page player with guided, explore and static modes, Cover and Quiz, and the routes /day/[day] and /day/[day]/page/[pageId] rendering Day 6 from /api/v2/lessons/6. Ask answers POST to /api/v2/answers (stub it if Phase 4 isn't done). Also apply the Phase 0 review decisions: compare panels side by side down to 360px, highlight only the active row, headers never dimmed, and the CaptionBar with labeled chapter segments. Resolved forms come with {stem, ending, irregular}: color endings by verb class and mark irregular forms purple with ⚡.

---

## Phase 3 · Lesson generation

**Read:** 03 (sections: برومبت Claude الثابت, رسالة الطلب لكل يوم, التحقق الآلي, نظام الصور, قوالب برومبت الصور, الإعدادات والتكلفة), the PAGES block at the end of 02, and 04.

**Tasks**
- `content/v2/plan/pt-PT.days.json` built from the days 1–30 table in `04`.
- `lib/v2/generation/lesson`:
  1. Build the request (plan + `VERB_TABLE` + `PAGE_PLAN`).
  2. Call Claude with the system prompt from `03`, with PAGE STEPS replaced by PAGES. Gold lessons in `examples/` go into the prompt as examples.
  3. Validate with the Phase 1 validator; retry once with the errors; then flag.
  4. Save as draft.
- Images:
  - Templates from `03`, with reference sheets or the style anchor.
  - The OpenAI image edits endpoint with the model from env.
  - Vision QA with Haiku: regenerate once on failure, then flag.
- Audio: warm through the existing TTS cache, as `warm:lesson-audio` does today.
- POST `/api/v2/admin/generate/lesson/[day]`, plus a simple `/v2-admin` page with the list, preview (in the Phase 2 player), and the draft → reviewed → published actions.
- Log tokens and cost per day.

**Done when**
- Days 1–3 generate, pass validation, have images and audio, render in the player and can be published.

**Prompt**
> Read the sections of docs/langify-v2/03-generation-and-learning.md named in 07-build-plan Phase 3, the PAGES block at the end of 02-content-schema.md, and 04-curriculum.md. Create content/v2/plan/pt-PT.days.json from the days 1–30 table, and lib/v2/generation/lesson with the pipeline described in Phase 3 (system prompt text verbatim from 03, with PAGE STEPS replaced by PAGES; the model never writes conjugated forms). Add the admin route and a /v2-admin review page. Pilot days 1–3. VERB_TABLE in the request lists only verbs with verified: true. Run the validator in strict mode before saving. Use examples/day06-example.json (and gold days 1–3 when they exist) as the in-prompt examples.

---

## Phase 4 · Progress, SRS, answers, cards engine

**Read:** 00 (§5–8), 03 (sections: الفلاش كاردز, الاستخدام اليومي, بنك الأسئلة, التقدم والأخطاء).

**Tasks**
- Models `v2_item_state`, `v2_errors`, `v2_sessions` and `v2_questions`.
- `lib/v2/answers`:
  1. Normalise the answer. Accent-only differences become spelling → accent.
  2. Exact match and known alternatives.
  3. Detect Arabic-only answers.
  4. Closed answers (choices, listening, reading) are decided here.
  5. Otherwise call the grader (Phase 6; stub until then).
  6. Classify the error, update the 4 levels and SRS, and count a correct use as an implicit card review.
- POST `/api/v2/answers`: the only writer of progress.
- The question bank: mechanical questions by code per item × skill, and the session builder (40/30/20/10).
- The cards engine:
  - GET `/api/v2/cards/today`: cap 15 with the 9/4/2 mix and no backlog.
  - POST `/api/v2/cards/[itemId]/review`: again, hard, easy, know; the graduation rule.
- Weak areas, by the rule in `00` §8.

**Done when**
- Unit tests cover:
  - the card mix with 0, 3 and 30 missed days (always ≤15, no backlog);
  - graduation needs both conditions;
  - the weak-area rule;
  - an accent-only mistake never calls a model;
  - a listening answer never calls a model.

**Prompt**
> Read docs/langify-v2/00-decisions.md §5–8 and the sections of 03 named in 07-build-plan Phase 4. Build the v2 progress models, lib/v2/answers (layered validation), POST /api/v2/answers as the only writer of progress, the question bank and session builder, and the cards endpoints. Write the unit tests listed under "Done when". Item ids and skills must match lib/v2/content types exactly (skills: listening | reading | speaking | writing). Import the types; don't redefine them.

---

## Phase 5 · Cards UI

**Read:** 00 (§5), 06 (S5–S7), reference images 08–10, the corrections in `05`.

**Tasks**
- `/cards`: the deck listing (situations and verbs tabs).
- `/cards/deck/[id]`: deck detail, with no Arabic meanings in the list.
- `/cards/review`: retrieval-first review (front, hint, back for verb, word and phrase), rating, end screen.

**Done when**
- A 15-card session runs end to end.
- The hint locks the rating to صعبة or worse.
- The front never autoplays.
- An irregular `eu` form shows purple with ⚡.

**Prompt**
> Read docs/langify-v2/00-decisions.md §5 and 06-screens.md S5–S7. Match design/reference/08-decks-listing.png, 09-flashcard-front.png and 10-flashcard-back.png, with the corrections in 05 ("Things the designs got wrong"). Build /cards, /cards/deck/[id] and /cards/review against the Phase 4 endpoints.

---

## Phase 6 · Practice with four skills

**Read:** 00 (§9), 01 ("Flow of one practice beat"), 03 (the agent prompt section), 06 (S8), `docs/app-core-prompts-and-conversation-flow.md` (the old flow, for reuse).

**Tasks**
- **Packs** (`lib/v2/generation/pack`, `v2_packs`):
  - Reuse the old pack pipeline ideas. Each beat gets a `skill`; the mix comes from `skill_mix` (default 30/30/20/20, at least one of each).
  - Listening beats carry `audio_tl`, `question_eg` and options `{id, label, lang, correct}`.
  - Reading beats carry an artifact (receipt, sign, label or menu lines) plus `question_eg` and options.
  - Validate; retry once.
- **Grader** (`lib/v2/grader`): Haiku, JSON, 8s timeout, `unclear` on any failure. The output schema is in `00` §9 (with `corrected_tl` and `skill`). It's only called for speaking and writing.
- **Reactor** (`lib/v2/reactor`): Prompt 4 with SOURCE=code and no VERDICT line. Inputs: MAIN_ERROR, CORRECTED_TL, WEAK_SPOT, mode, skill, attempt. Output: `{character_tl?, coach_eg?, advance}`. Max 2 attempts.
- The answers route handles beats as described in `01`.
- **UI** `/practice/[day]`: S8 with all 9 states and the end screen. STT goes through the existing `/api/stt`. "مش قادر أتكلم دلوقتي" switches the beat to writing and counts for writing only.

**Done when**
- A Dia 3 pack plays through all four skills.
- A wrong answer shows one amber correction and the character waits; after attempt 2 the beat advances and is recorded wrong.
- The end screen shows per-skill counts.
- The focus error appears in the next day's cards.

**Prompt**
> Read docs/langify-v2/00-decisions.md §9, 01-architecture.md ("Flow of one practice beat"), the agent section of 03, 06-screens.md S8, and docs/app-core-prompts-and-conversation-flow.md for the old flow you can reuse. Build v2 packs with skills, lib/v2/grader and lib/v2/reactor as pure modules (no DB writes), beat handling in /api/v2/answers, and the /practice/[day] screen with the 9 states and the end screen, as specified in Phase 6.

---

## Phase 7 · Path, day done, library, me and gaps, micro units

**Read:** 00 (§1, §6), 03 (sections: الميكرو ليرننج, الاستخدام اليومي ومعرفة النواقص), 04 (micro series), 06 (S1, S4, S9–S11).

**Tasks**
- `/path` (home).
- The day-done screen.
- `/library` with shelves and unlocks.
- `/me` with gaps.
- Micro units (3 a day from series state) as a bottom sheet.
- «احكي يومك».
- The weekly situation test.
- Reminders: in-app first. Web push is optional later (iOS only allows it for an installed PWA).

**Done when**
- A new user can go Day 1 → Day 3 through the path, gets micro units each day, and sees the "بتفهم · بتقول" numbers and gaps change.

**Prompt**
> Read docs/langify-v2/00-decisions.md §1 and §6, the micro and daily-use sections of 03, and 06-screens.md S1, S4, S9–S11. Build the micro-unit logic and endpoints, and the /path, day done, /library and /me screens.

---

## Phase 8 · QA and cut-over

- Native review of weeks 1–2: text, audio and the pronunciation letters.
- Check every image: no text inside, the right characters, an adult style.
- An RTL and small-screen pass at 360px; iOS Safari and Android Chrome; the installed PWA.
- Offline: today's and tomorrow's lesson JSON and audio are cached.
- Analytics events: page_started, ask_answered, page_completed, card_rated, beat_answered (with skill and verdict), micro_done.
- Cut-over: point `/` to `/path`. Then remove the old `/lessons` and `/chat` pages and the code only they use, in a separate PR.