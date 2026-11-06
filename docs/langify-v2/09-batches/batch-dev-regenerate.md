# Dev · Regenerate and restart buttons for testing

So Omar can retest after each fix without touching the DB by hand.

## Prompt to paste into Cursor

Add a dev/admin "⋯" menu to the conversation header (Learn and Practice). Show it only when the user passes the existing admin gate (`lib/v2/generation/adminGate.ts`) or when `NODE_ENV=development`. Never show it to normal learners. Commit as "dev: conversation regenerate menu", with tests for the admin gate on every route.

Menu items:

1. **«ابدأ من الأول»** (reset session): deletes this user's session for this conversation, then reloads the start route. The pack and lesson are untouched. Available in all modes.
2. **«أعد تحميل المحادثة»** (reload pack, Learn only):
   - **authored pack** (a content file like pt-PT.day-33.json): re-read the file, clear any cached copy, reset the session;
   - **generated pack:** re-run the existing convo pack jobs for this day with `force: true`, then reset the session.

   Show the preparing screen (gen-1 P4) while it runs.
3. **«أعد توليد الدرس كله»** (Learn only): runs `prepare_day` with `force: true` (lesson text → gate → pack → audio). This creates a new version and never deletes the old one. Ask for confirmation first: «ده هيعمل نسخة جديدة من الدرس والمحادثة. متأكد؟». Show the preparing screen.
4. **«امسح الصوت المتخزن»**: clears cached audio for this conversation's fixed lines and re-warms it.
5. **«افتح في الأدمن»**: a link to this day's admin page (lesson preview, conversation preview, jobs).

Server side:
- One admin route, `POST /api/v2/admin/convo/regenerate`, with `{ pack_id | topic_id, action: reset | reload_pack | regenerate_day | clear_audio }`.
- It reuses the existing jobs and `prepare_day`, and returns a job id for polling.
- All actions are logged with the admin user and a timestamp.
- Rate limit: 1 `regenerate_day` per day per 2 minutes.

Done when: after a code fix, Omar opens «Onde fica?», taps ⋯ → «ابدأ من الأول», and replays from the opening. Tapping «أعد تحميل المحادثة» picks up edits to pt-PT.day-33.json without restarting the server.
