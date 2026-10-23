<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Langify v2 (single repo)

- **Spec:** `docs/langify-v2/`. **`00-decisions.md` is the tie-breaker** if any other doc disagrees. Start with that file, then `01-architecture.md`. Build plan: `07-build-plan.md`.
- **New code only under:** `app/(v2)`, `app/api/v2`, `lib/v2`, `components/v2`. Mongo collections for v2 are prefixed `v2_`.
- **Langify repo is legacy.** Read identity only via `lib/langifyRead` / `getCurrentUserId()` in `lib/auth/currentUser.ts` (dev: `DEV_LANGIFY_USER_ID`). Never write Langify collections.
- **Progress:** only `POST /api/v2/answers` writes learner progress. `lib/v2/grader` and `lib/v2/reactor` are pure modules (no DB writes).
- **Legacy UI stays** until cut-over: `/lessons`, `/chat`, and the old practice pipeline. Do not change them unless a task says so.
- **Deprecated (do not extend):** `POST /api/grade`, `POST /api/react`, `lib/agentAuth`, and `docs/v2-agent-contract.md`. Phase 6 moves useful grader/reactor logic into `lib/v2/grader` and `lib/v2/reactor`, then deletes those HTTP routes.
- **Flag:** `V2_ENABLED` gates the v2 shell. Details: `docs/langify-v2/01-architecture.md`.

## Practice lessons (legacy path)

- **Shared with Langify:** MongoDB connection only. Read Langify `users` / `userprogresses` via `lib/langifyRead` (read-only). Never write Langify collections.
- **Writes (legacy `/api/chat` path):** `practice_lessons`, `practice_progress`, `practice_chat_state`, `practice_new_answers`. Gate completion writes with `PRACTICE_WRITE_PROGRESS=false` when appropriate.
- **Generation (legacy packs):** `POST /api/lessons/:key/generate` calls Anthropic over HTTP (Prompt 1→2→hard validate→live; one full pack regen on hard fail; reviewer stores issues after live). Packs assign a `skill` per beat. No TTS during generation; audio is fetched when a line is played. No job queue/worker.
- **Runtime (legacy UI):** Lessons list `/lessons`; play at `/lessons/[lessonKey]`. Friend chat uses Prompt 5; reactions are Prompt 4. Details: `docs/app-core-prompts-and-conversation-flow.md`.
