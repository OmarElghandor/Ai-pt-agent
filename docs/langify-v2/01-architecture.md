# 01 · Architecture

## One repo

Everything in v2 is built in **`ai-agent-talk`**, the repo in the `ai-pt-agent` folder.

| Layer | Tech | Notes |
|---|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript | Read `AGENTS.md`: this Next.js version has breaking changes, so check `node_modules/next/dist/docs/` before using an API. |
| Styling | Tailwind 4 with CSS variables from `05-design-system.md` | Fonts through `next/font`. |
| Validation | zod 4 | One schema file per contract, used by API routes and generation. |
| Data | Mongoose 9, the existing `MONGODB_URI` | New collections prefixed `v2_`. |
| AI | Anthropic SDK (generation: Sonnet-class; grader and vision QA: Haiku), OpenAI images | Model names come from env, never hard-coded. |
| Audio | The existing `/api/tts` (Azure, OmniTTS) with its cache, and the existing `/api/stt` | Reuse; don't rebuild. |
| App shape | Mobile-first PWA, RTL, 390px design width | Installable; today's lesson and audio are cached for offline. |

The `langify` repo is legacy. v2 reads only identity from it, through the existing `lib/langifyRead` (users, read-only) and `lib/auth/currentUser.ts`. v2 never writes Langify collections.

## Folder layout (new code)

| Path | What goes there |
|---|---|
| `app/(v2)/` | All v2 pages, inside a route group with its own layout (tab bar, RTL, fonts) |
| `app/api/v2/` | All v2 API routes |
| `lib/v2/content/` | Schema types, the zod validator, loaders and resolvers (form ids → text) |
| `lib/v2/render/` | Pure helpers (no UI) for the guided and explore engines: step timing, target resolution |
| `components/v2/` | Core components and the 14 block components |
| `lib/v2/progress/` | SRS, the 4 levels, the cards engine, weak areas, error recording |
| `lib/v2/answers/` | The layered validator: normalise, match, classify |
| `lib/v2/grader/`, `lib/v2/reactor/` | Pure modules around Claude calls. No DB writes |
| `lib/v2/generation/` | The lesson generation pipeline and the practice-pack pipeline |
| `lib/v2/micro/` | Micro units and series state |
| `content/v2/` | The plan seed, conjugation seed, gold example lessons, prompts |

The old `app/lessons`, `app/chat`, `lib/turn.ts`, `lib/grade.ts` and `lib/friendPrompt.ts` stay until v2 practice replaces them. Copy their logic into `lib/v2` when it's useful; don't import v2 code into the old pages.

## Collections (new)

| Collection | Holds |
|---|---|
| `v2_lessons` | One document per day × target_lang × version: meta, item bank, pages (blocks, steps, controls), quiz ids, status (draft, reviewed, published) |
| `v2_conjugations` | lemma × tense × person: tl, stem, ending, irregular, say, source |
| `v2_packs` | Practice packs per day: character, scenes, beats with skill, artifacts and listening options |
| `v2_questions` | The question bank per item × skill (origin code or claude, day) |
| `v2_item_state` | One document per user × item: introducedDay, usedCorrectlyIn, the 4 levels, SRS per skill, card SRS, graduated |
| `v2_errors` | Append-only: user, item, tool, skill, category, scope, wrong, right, at |
| `v2_sessions` | Lesson, card and practice sessions: what was shown and the results (for the end screens and analytics) |
| `v2_micro` | The user's micro series position and today's units |
| `v2_assets` | Image and audio records keyed by item id and content hash (the existing audio cache can back it) |

The existing `practice_lessons`, `practice_progress` and `practice_chat_state` stay for the old pages. They are not used by v2.

## API routes (v2)

| Route | Purpose |
|---|---|
| GET `/api/v2/path` | Home: today's day, the 3 micro units, "بتفهم · بتقول" numbers |
| GET `/api/v2/lessons/[day]` | The published lesson, with forms resolved and asset URLs |
| POST `/api/v2/answers` | **The only place progress is written.** Covers lesson asks, quiz questions, card checks and practice beats |
| GET `/api/v2/cards/today` · POST `/api/v2/cards/[itemId]/review` | Today's cards (≤15) and ratings |
| GET `/api/v2/decks` · GET `/api/v2/decks/[id]` | The deck listing and detail |
| GET `/api/v2/packs/[day]` | The practice pack for a day (generated on first request if missing) |
| GET `/api/v2/gaps` | The Me and gaps screen |
| GET `/api/v2/micro/today` · POST `/api/v2/micro/[unitId]/done` | Micro units |
| POST `/api/v2/admin/generate/lesson/[day]` · `/pack/[day]` | Generation (dev or admin only) |

## Flow of one practice beat

1. The client posts the beat id, skill, answer, answer_source (voice or text) and attempt number to `/api/v2/answers`.
2. Code checks run in order:
   - normalise, exact match and known alternatives;
   - Arabic-only detection;
   - closed answers for listening and reading (decided here, no model).
3. If it's still undecided, call `grader` (Haiku, 8s timeout, `unclear` on failure).
4. Classify the error, then write `v2_item_state`, `v2_errors` and `v2_sessions`.
5. Call `reactor`, which returns `character_tl`, `coach_eg` and `advance`.
6. Return the verdict, the reaction, the progress deltas and the next beat.

## Environment

The existing variables stay. New ones:
- `CLAUDE_MODEL_GENERATION`
- `CLAUDE_MODEL_FAST` (Haiku, used for the grader and vision QA)
- `OPENAI_API_KEY`
- `OPENAI_IMAGE_MODEL=gpt-image-2.5-flare-2026-09-08`
- `V2_ENABLED`
