<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Practice lessons (this app owns the pipeline)

- **Shared with Langify:** MongoDB connection only. Read Langify `users` / `userprogresses` via `lib/langifyRead` (read-only). Never write Langify collections.
- **Writes:** `practice_lessons`, `practice_progress`, `practice_chat_state`, `practice_new_answers`.
- **Generation:** `POST /api/lessons/:key/generate` calls Anthropic over HTTP (Prompt 1→2→validate→live). No TTS during generation; audio is fetched when a line is played. No job queue/worker.
- **Identity:** `getCurrentUserId()` in `lib/auth/currentUser.ts` (dev: `DEV_LANGIFY_USER_ID`).
- **Runtime:** Lessons list `/lessons`; play at `/lessons/[lessonKey]`. Flow: intro → story beats (character line, coach tip by difficulty, graded answer, live reaction, then the next line) → closing hook → friend-bridge. Friend chat uses Prompt 5; reactions Prompt 4. No `/chat?agent=practice`.
- Details: `docs/app-core-prompts-and-conversation-flow.md`.
