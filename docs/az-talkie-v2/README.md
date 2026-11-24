# A-Z Talkie (v2) · Cursor handoff pack

This pack holds everything decided in design sessions for **A-Z Talkie** (product brand; technical pack path `docs/az-talkie-v2`): European Portuguese for Egyptian Arabic speakers, with a book-like interactive page experience. **All of v2 is built from scratch in the `ai-agent-talk` repo** (folder `ai-pt-agent`, Next.js 16; npm package `a-z-talkie`): a mobile-first web app (PWA). The old `langify` repo is legacy; v2 only reads users from it. Copy this pack into the root of `ai-agent-talk`. The `.cursor/rules` folder merges with the existing rules, and `docs/az-talkie-v2` is new.

## How to use it with Cursor

1. Copy the whole pack into the root of `ai-agent-talk` and commit it on its own branch (`az-talkie-v2-docs`).
2. Open Cursor and start with **`docs/az-talkie-v2/07-build-plan.md`**. It splits the work into phases. Each phase has a ready prompt to paste into Cursor Agent, and a "done when" checklist.
3. Do one phase per Cursor chat. Start every chat with: "Read `docs/az-talkie-v2/00-decisions.md` and the docs listed for this phase before writing code."
4. When a decision changes, update `00-decisions.md` first, then the detailed doc. Cursor treats `00-decisions.md` as the tie-breaker.

## What's inside

| Path | What it is | Language |
|---|---|---|
| `.cursor/rules/00-az-talkie-core.mdc` | Always-on rules: language fields, Arabic registers, colors as meanings, RTL/LTR, ownership | English |
| `.cursor/rules/10-content.mdc` | Rules when touching lesson content, schema, generation | English |
| `.cursor/rules/20-ui.mdc` | Rules when touching v2 UI (pages and components) | English |
| `.cursor/rules/30-practice-agent.mdc` | Rules for packs, grader, reactor | English |
| `docs/az-talkie-v2/00-decisions.md` | **Single source of truth.** Every binding decision, short | English |
| `docs/az-talkie-v2/01-architecture.md` | Stack, folder layout, collections, API routes, practice beat flow | English |
| `docs/az-talkie-v2/02-content-schema.md` | Content JSON schema: lesson → page → block → item, 14 blocks, modes, presets | Arabic (source doc) |
| `docs/az-talkie-v2/03-generation-and-learning.md` | Original generation spec, image style, flashcards, micro, question bank, progress, agent prompts | Arabic (source doc) |
| `docs/az-talkie-v2/04-curriculum.md` | 90-day plan, day-by-day for days 1–30, weeks for 31–90 | Arabic (source doc) |
| `docs/az-talkie-v2/05-design-system.md` | Tokens, fonts, components, the visual reference screen | English |
| `docs/az-talkie-v2/06-screens.md` | Every screen and its states, with the reference image for each | English |
| `docs/az-talkie-v2/07-build-plan.md` | Phases, tasks, acceptance checks, Cursor prompts | English |
| `docs/az-talkie-v2/08-lesson-generation-prompts.md` | Live lesson-generation pipeline, steps, and the prompts the code sends | English |
| `docs/az-talkie-v2/09-conversations.md` | Character conversations: learn + free talk, grading, budget | English |
| `docs/az-talkie-v2/09a-conversations-tasks.md` | One-session task breakdown for conversations | English |
| `docs/az-talkie-v2/10-auth.md` | Google sign-in, v2 users, sessions, onboarding, deletion | English |
| `docs/az-talkie-v2/10-auth-tasks.md` | One-session task breakdown for auth (A0–A7) | English |
| `docs/az-talkie-v2/11-profile-progress.md` | Lesson progress, problems/weak spots, daily deck, streak, profile summary (P0–P12) | English |
| `docs/az-talkie-v2/12-custom-decks.md` | Learner-generated flashcard decks, shared item pool, images (§2.10), public list, admin promotion (C0–C9) | English |
| `docs/az-talkie-v2/13-step-progress.md` | Server-owned day-step ticks, next-step resume, shared step list, home stations hero (S0–S5) | English |
| `docs/az-talkie-v2/14-library.md` | Library: stories and podcasts from real life (levels, moments, ElevenLabs, player, saved words) | English |
| `docs/az-talkie-v2/14b-library-content.md` | Voices registry, moment bank, 20 episode briefs | English / Egyptian |
| `docs/az-talkie-v2/14c-library-design.md` | Stitch refs, language notes decision, player UI fixes | English |
| `docs/az-talkie-v2/14d-library-admin.md` | Admin tool to build episodes (LA0–LA9); replaces 14 tasks L1–L4b and L8 | English |
| `docs/az-talkie-v2/15-admin-dashboard.md` | Full-screen admin: lesson runs, cards-before-lesson, themed decks, bulk images, jobs, cost (D0–D8) | English |
| `docs/az-talkie-v2/16-practice-engine.md` | Daily practice engine: 30-min budget, review first, footer tab مراجعة, كروت النهارده + مراجعة النهارده, answer log / level tracking, stages (E0–E8) | English |
| `docs/az-talkie-v2/17-item-weights.md` | Item weights: target / survival / computed weight, priority score for cards + review, home produce·understand counts (W0–W6) | English |
| `docs/az-talkie-v2/18-review-chat-ui.md` | Review chat UI: مراجعة النهارده as a Lumina coach chat, tokens, every question type, components, tasks R0–R8 | English |
| `design/reference/library/` | Stitch screens for library home, story/podcast players, word sheet, end (see 14c) | HTML / PNG |
| `examples/day06-example.json` | Gold ESTAR lesson (filename kept; `lesson.day` is **11** in the grammar-first order) | JSON |
| `prototypes/ser-estar.html` | Working prototype of a guided (autoplay) page | HTML |
| `prototypes/verb-endings.html` | Working prototype of an explore page (person dial, swap, build questions) | HTML |
| `design/reference/*.png` | Stitch screens to match, numbered by screen | PNG |
| `design/stitch-DESIGN.md` | Stitch's design-system notes ("Editorial Notebook"), for tokens | English |

The three Arabic docs are exports of the living docs in Claude. Links to the originals are at the top of each file.

## The product in one paragraph

Every day is one grammar unit (Practice Portuguese A1 order), taught inside a street situation in Lisbon. A day is 4–6 **pages**, and each page looks like a page from a visual-notes grammar book: a dense, illustrated poster. The page builds itself in front of the learner (guided autoplay that stops only for questions), or the learner explores it with controls (pick a person, swap a verb). After the pages, the learner practises the same situation with an AI character (Rita, Inês…) across the four skills. What they learn feeds **flashcards** (max 15 a day, newest lessons first), **3 micro units a day** that bring them back, and a **gaps** view that shows what they understand vs what they can say.
