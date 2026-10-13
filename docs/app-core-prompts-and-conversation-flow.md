# App core: Friend, Practice, Assessment

This document is the source of truth for the conversation engine and practice pipeline.

## Ownership

| Concern | Owner |
|---------|--------|
| Prompt 1–3 generation, `practice_*` collections | **This Next.js project** |
| Langify `users` / `userprogress` (cells, introduced words, finished missions) | **Read-only** via `lib/langifyRead` |
| Friend Prompt 5 / Practice Prompt 4 | This project (`lib/friendPrompt.ts`) |

Same `MONGODB_URI`. Never write into Langify collections.

## Modes

| Mode | Entry | Model use |
|------|-------|-----------|
| **Friend** | `/chat?agent=friend` | Prompt 5 every turn |
| **Practice** | `/lessons` → `/lessons/[lessonKey]` | Code grades known beats; Prompt 4 reacts every turn, and grades open beats |
| **Assessment** | List badge / `/chat?agent=assessment` | Prompt 4 (no answer leaks) |

## Practice lesson flow

1. **Intro** — one or two Egyptian sentences before the first scene.
2. **Beats** — 8 to 14 exchanges in 3 or 4 scenes. Each beat shows narration only when the moment changes, then the character's Portuguese line. Guided and supported beats also show a coach pre-hint with that line (guided adds a frame; supported adds a word bank). Help is only a fallback if the tip was not shown. Open beats ask about his real life, with a frame and word bank and no tip.
3. **Answer** — known beats are graded in code (including `[NAME]` / `[CITY]` / `[NUMBER]` / `[PLACE]`). Open beats are graded by Prompt 4. Arabic-only text is a side remark and does not change progress.
4. **Reaction** — Prompt 4 speaks as the character when the answer is right, and as the coach when it is wrong. The app then sends the next story line itself. A first miss stays on the beat and re-prompts with the target phrase.
5. **Closing hook** — the character's last open question, then a 5-turn friend bridge (Prompt 5) inside the situation.

Pack JSON shape: `{ intro_ar, character, scenes, beats, closing_hook, assessment }`. Runtime: `LessonPack.beats`.

### Legacy packs

A Mongo pack that is still `teach_steps` / `items` is **rejected** by `adaptMongoPack` (return `null`) and treated as needing generation.

Regenerate with `PRACTICE_LESSON_REGENERATE=true` or by calling `POST /api/lessons/:key/generate` when the adapted pack is null.

## Lesson packs

- Stored in **`practice_lessons`** (`live` / `reviewed`, `is_current`).
- Generation: POST `/api/lessons/:key/generate` calls Anthropic over HTTP and awaits the pack (no queue/worker).
- Fallback JSON under `content/lessons/` when Mongo unset; `testOnly` when `ALLOW_TEST_LESSONS=1`.
- Adapter: `lib/lessons/adaptMongoPack.ts`.

### Unlock

Available when every `requirements.cells` / `requirements.words` appears in Langify-known (`lib/langifyRead`). Practise/assess timestamps live in **`practice_progress`**.

## Generation

`POST /api/lessons/:key/generate` runs Prompt 1 → 2 → structure validator → `live` → TTS via direct Anthropic HTTP (`ANTHROPIC_API_KEY`). Prompt 3 reviewer runs after in the same process. No job queue. `PRACTICE_LESSON_REGENERATE=true` gates regenerate.

Content: `content/practice/` (word-priority, nucleo, grammar-grid), `content/lessons/lesson-plan-seed-v1.json`, `content/prompts/practice/`.

## Unified endpoint — `POST /api/chat`

Grades known beats in code. Prompt 4 writes the reaction on every practice and assessment turn, and grades open beats. The route appends the next story line after that reaction. Prompt 5 is the friend bridge. After friend-bridge, writes **`practice_progress`** (not Langify UserProgress).

## Lesson list (`/lessons`)

Seed-first 24 slots; overlays `practice_lessons`. Click without pack awaits one generate request. Dev panel can set Langify ObjectId session.

## Env

- `MONGODB_URI`
- `DEV_LANGIFY_USER_ID` (or legacy `DEV_USER_PROGRESS_ID`)
- `ANTHROPIC_API_KEY` / `CLAUDE_MODEL` (worker)
- `ALLOW_TEST_LESSONS`, `PRACTICE_LESSON_REGENERATE`
- OmniTTS + Azure Speech for pack audio cache

See `.env.example`.
