# Langify v2 · Cursor handoff pack

This pack holds everything decided in design sessions for Langify v2: European Portuguese for Egyptian Arabic speakers, with a book-like interactive page experience. **All of v2 is built from scratch in the `ai-agent-talk` repo** (folder `ai-pt-agent`, Next.js 16): a mobile-first web app (PWA). The old `langify` repo is legacy; v2 only reads users from it. Copy this pack into the root of `ai-agent-talk`. The `.cursor/rules` folder merges with the existing rules, and `docs/langify-v2` is new.

## How to use it with Cursor

1. Copy the whole pack into the root of `ai-agent-talk` and commit it on its own branch (`langify-v2-docs`).
2. Open Cursor and start with **`docs/langify-v2/07-build-plan.md`**. It splits the work into phases. Each phase has a ready prompt to paste into Cursor Agent, and a "done when" checklist.
3. Do one phase per Cursor chat. Start every chat with: "Read `docs/langify-v2/00-decisions.md` and the docs listed for this phase before writing code."
4. When a decision changes, update `00-decisions.md` first, then the detailed doc. Cursor treats `00-decisions.md` as the tie-breaker.

## What's inside

| Path | What it is | Language |
|---|---|---|
| `.cursor/rules/00-langify-core.mdc` | Always-on rules: language fields, Arabic registers, colors as meanings, RTL/LTR, ownership | English |
| `.cursor/rules/10-content.mdc` | Rules when touching lesson content, schema, generation | English |
| `.cursor/rules/20-ui.mdc` | Rules when touching v2 UI (pages and components) | English |
| `.cursor/rules/30-practice-agent.mdc` | Rules for packs, grader, reactor | English |
| `docs/langify-v2/00-decisions.md` | **Single source of truth.** Every binding decision, short | English |
| `docs/langify-v2/01-architecture.md` | Stack, folder layout, collections, API routes, practice beat flow | English |
| `docs/langify-v2/02-content-schema.md` | Content JSON schema: lesson → page → block → item, 14 blocks, modes, presets | Arabic (source doc) |
| `docs/langify-v2/03-generation-and-learning.md` | Original generation spec, image style, flashcards, micro, question bank, progress, agent prompts | Arabic (source doc) |
| `docs/langify-v2/04-curriculum.md` | 90-day plan, day-by-day for days 1–30, weeks for 31–90 | Arabic (source doc) |
| `docs/langify-v2/05-design-system.md` | Tokens, fonts, components, the visual reference screen | English |
| `docs/langify-v2/06-screens.md` | Every screen and its states, with the reference image for each | English |
| `docs/langify-v2/07-build-plan.md` | Phases, tasks, acceptance checks, Cursor prompts | English |
| `docs/langify-v2/08-lesson-generation-prompts.md` | Live lesson-generation pipeline, steps, and the prompts the code sends | English |
| `examples/day06-example.json` | Gold ESTAR lesson (filename kept; `lesson.day` is **11** in the grammar-first order) | JSON |
| `prototypes/ser-estar.html` | Working prototype of a guided (autoplay) page | HTML |
| `prototypes/verb-endings.html` | Working prototype of an explore page (person dial, swap, build questions) | HTML |
| `design/reference/*.png` | Stitch screens to match, numbered by screen | PNG |
| `design/stitch-DESIGN.md` | Stitch's design-system notes ("Editorial Notebook"), for tokens | English |

The three Arabic docs are exports of the living docs in Claude. Links to the originals are at the top of each file.

## The product in one paragraph

Every day is one grammar unit (Practice Portuguese A1 order), taught inside a street situation in Lisbon. A day is 4–6 **pages**, and each page looks like a page from a visual-notes grammar book: a dense, illustrated poster. The page builds itself in front of the learner (guided autoplay that stops only for questions), or the learner explores it with controls (pick a person, swap a verb). After the pages, the learner practises the same situation with an AI character (Rita, Inês…) across the four skills. What they learn feeds **flashcards** (max 15 a day, newest lessons first), **3 micro units a day** that bring them back, and a **gaps** view that shows what they understand vs what they can say.
