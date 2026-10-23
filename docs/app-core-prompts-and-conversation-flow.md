# App core: Friend, Practice, Assessment

This document is the source of truth for the conversation engine and practice pipeline.

## Ownership

| Concern | Owner |
|---------|--------|
| Prompt 1–3 generation, `practice_*` collections | **This Next.js project** |
| Langify `users` / `userprogress` (cells, introduced words, finished missions) | **Read-only** via `lib/langifyRead` |
| Friend Prompt 5 / Practice Prompt 4 (R1/R2/R3) | This project (`lib/friendPrompt.ts`) |

Same `MONGODB_URI`. Never write into Langify collections.

## Modes

| Mode | Entry | Model use |
|------|-------|-----------|
| **Friend** | `/chat?agent=friend` | Prompt 5 every turn |
| **Practice** | `/lessons` → `/lessons/[lessonKey]` | Code grades known beats; authored `reply` (or R1 for personal slots); R2 grades open / unmatched slots; R3 for Arabic side remarks |
| **Assessment** | List badge / `/chat?agent=assessment` | R2 judge only (no character); pack nudge on wrong attempt 1 |

## Practice lesson flow

1. **Intro** — one or two Egyptian sentences before the first scene.
2. **Scene word cards** — when s01/s02 have authored `scenes[].words`, the runtime shows narration then a blocking overlay («كلمات هنحتاجها») until the learner taps «يلا نبدأ». Tip + character line are delayed until dismiss. A local «كلمات المشهد» chip reopens the same card (no turn, not help/mistake). s03 and legacy packs without words keep today’s direct flow.
3. **Beats** — pack writes a `script` first (full conversation, with `ar`/`arz` for replay), then cuts it into beats with an authored `reply` after each of his turns. Three scenes: s01/s02 one visit, s03 a second short moment. Within a beat the order is: narration → character line → optional `info_card` → coach (`teach` on first use of a tool, otherwise `coach_tip`) → his answer → `reply`. Hard validator only blocks crash cases (no beats / empty accepted / bad scene id); other checks are warnings (incl. soft scene-word counts, script match, duplicate lines, yes/no mismatch, answer leak, teach same-example). Open: frame, word bank, guard + hint_note.
4. **Answer** — known beats are graded in code (exact → anticipated_wrong → accent → word-level spelling near-miss → one-extra-article). Spelling near-miss: same word count; each word within edit distance 2 (5+ letters) or 1 (shorter); adjacent swap = 1. Personal slots run the slot matcher first; only a miss calls R2. Open beats are graded by R2, then `passesCodeGuard`. **Stuck** (`???` / مش فاهم …) is detected before grading and never counts as a wrong attempt. Arabic why about this lesson’s tool (ليه / الفرق / … + a Portuguese tool word) shows the authored `grammar_card` with no model. Other Arabic-only text is a side remark (R3) and does not change progress.
5. **Two help ladders (independent counters)** —
   - **Wrong answers** (`attemptsOnCurrent`): attempt 1 = anticipated note → `hint_note` → `"${coach_tip}. جرّب تاني."`; attempt 2 = `why_note` then advance as learned-with-help. Frame stays; character line is not re-shown.
   - **Stuck** (`stuckCountOnCurrent`): 1st → `line_explain` + in-thread hint card (frame + tappable `word_bank`); 2nd → `hint_note`; 3rd → `why_note` + advance as learned-with-help. Never increments wrong attempts.
   - **ليه؟ / tool-why**: guided/supported coach tips and `teach` cards expose an inline ليه؟ chip when the pack has `grammar_card`. Tap (or a matching Arabic why) shows the card + «يلا نستخدمها» + the beat’s alt line; beat index unchanged.
   - After a code pass: show authored `reply` (or nothing) instead of calling R1; R1 only for personal-slot beats with empty `reply`. Near-miss: no praise; coach fix (incl. extra-article notes), then reply / R1 with the corrected answer. Every learner message gets a visible reply.
6. **End of lesson (v5)** — after the last story beat: full `script` replay («المحادثة كاملة», playable with translations) → `summary` (words + rules) → immediate **final tasks** from `assessment` (practice check only; Egyptian situation, no answer shown before he tries). Then the closing hook and a 5-turn friend bridge (Prompt 5), then optional `farewell`. The delayed 12-hour formal assessment (`/chat?agent=assessment`) stays separate and still writes `assessmentByTarget`. Generation requires `closing_hook.pt` not to same-ask any beat `line.pt` / `alt_pt`.

Pack JSON shape: `{ script (pt + ar/arz), intro_ar, character, grammar_card?, scenes (with optional words), beats (with reply?, teach?, info_card?, line_explain?, word_bank), summary?, closing_hook, assessment }` (`script` is replayed at the end; older packs without `ar`/`arz` on script turns still adapt). Optional legacy `farewell` / `extra_characters` still adapt; older packs without `reply` / `teach` / `summary` / `grammar_card` / `line_explain` / `scenes[].words` stay playable (legacy packs still call R1 after a correct answer; packs without assessment tasks skip final-task and go straight to the bridge after ending aids). Runtime: `LessonPack.beats`. Scene-word TTS is prefetched on lesson open via `/api/tts` (same cache as lines); generation never calls TTS.

### Legacy packs

A Mongo pack that is still `teach_steps` / `items` is **rejected** by `adaptMongoPack` (return `null`) and treated as needing generation.

Regenerate with `PRACTICE_LESSON_REGENERATE=true` or by calling `POST /api/lessons/:key/generate` when the adapted pack is null.

## Lesson packs

- Stored in **`practice_lessons`** (`live` / `reviewed`, `is_current`). `needs_review` packs are not playable.
- Generation: POST `/api/lessons/:key/generate` calls Anthropic over HTTP and awaits the pack (no queue/worker).
- Fallback JSON under `content/lessons/` when Mongo unset; `testOnly` when `ALLOW_TEST_LESSONS=1`.
- Adapter: `lib/lessons/adaptMongoPack.ts`.

### Unlock

Available when every `requirements.cells` / `requirements.words` appears in Langify-known (`lib/langifyRead`). Practise/assess timestamps live in **`practice_progress`**.

## Generation

`POST /api/lessons/:key/generate` runs Prompt 1 → 2 → hard validate → if hard fail, regenerate the whole pack once → hard validate again → `live` or `failed`. No FIX MODE. Soft checks are stored as `validator_warnings`. After live, Prompt 3 reviewer runs once and stores issues for humans; it never rewrites the pack or blocks live. `?force=1` / `PRACTICE_LESSON_REGENERATE=true` clears pack **and** spec so both regenerate. No job queue.

Content: `content/practice/` (word-priority, nucleo, grammar-grid), `content/lessons/lesson-plan-seed-v1.json`, `content/prompts/practice/`.

## Unified endpoint — `POST /api/chat`

Grades known beats in code. Streams R1 / R2 / R3 for practice and assessment. Drops bad tagged output (`reaction_dropped`) instead of showing untagged bubbles. Prompt 5 is the friend bridge. After friend-bridge, writes **`practice_progress`** (not Langify UserProgress). Lesson pages load the learner with `skipOpener=1` so the Friend opener is not shown.

## Lesson list (`/lessons`)

Seed-first 24 slots; overlays `practice_lessons`. Click without pack awaits one generate request. Dev panel can set Langify ObjectId session.

## Env

- `MONGODB_URI`
- `DEV_LANGIFY_USER_ID` (or legacy `DEV_USER_PROGRESS_ID`)
- `ANTHROPIC_API_KEY` / `CLAUDE_MODEL` (worker)
- `ALLOW_TEST_LESSONS`, `PRACTICE_LESSON_REGENERATE`
- OmniTTS + Azure Speech for pack audio cache

See `.env.example`.
