# 13 · Lesson step progress: stored on the learner, shown on home

Status: plan, 2026-11-14. Author: Omar + Claude. Implementation: Cursor.
Checked against repo `Ai-pt-agent` at commit `49a3806` ("update lessons structure").

Read first: `11-profile-progress.md` (§3 lesson progress, §7.3 summary), `00-decisions.md` §8b, `AGENTS.md`. This doc only adds to `11`. Where they disagree about step tracking, resume or the home hero, **this doc wins**.

No code in this document by design.

---

## 1. What already works

- `v2_lesson_progress` already has `steps` (id, status, done_at), `resume`, `day_questions`, `started_at`, `last_opened_at`.
- The day map page sends `lesson_opened` (through `LessonProgressBootstrap`) with the day's steps in display order and marks absent ones `skipped`.
- Every "finish" button (`PagePlayer`, `SectionsPage`, `VocabFlowPlayer`, `ItemViewer`, `RealWorldPlayer`, `FindImageStep`, the questions page) calls `markPageDone`, which posts `step_done`.
- `GET /api/v2/progress/lesson/[day]` returns steps and a `resume_href`.

So the **writes are already there**. The problem is that nothing reads them.

## 2. What is broken or missing

1. **Ticks come from the browser, not the learner.** `DayMap` and `PathRoadmap` read done steps from `sessionStorage` (`readDonePages`). A new tab, another device, or a PWA restart shows every step as not done, even though the server has them.
2. **Path marks a day done from session storage** when `day_questions` **or `practice`** is in it. Practice alone must never complete a day (`11` §3.2: completed = day questions answered).
3. **Resume points at the step just finished**, not the next one. `step_done` sets `resume` to the finished step, so `resume_href` would send the learner back to a page they already did.
4. **Nobody calls** `GET /api/v2/progress/lesson/[day]`, so `resume_href` is unused.
5. **Home hero shows a fake percentage**: "{N}٪ مكتمل", built from done days plus a 0.4 bonus for the current day. It breaks the "no percentages" rule (`11` §2) and doesn't reflect steps at all. Its button opens the day map, not the step where the learner stopped.
6. **The summary has no step data**, so home can't say "3 of 5" or "continue at the grammar page".
7. **Lock hole:** `step_done` on a `locked` day turns it `in_progress`. Outside dev mode that skips the one-new-day-per-local-day rule.
8. **Step list lives inside the day page.** The ids, titles, order and hrefs of a day's steps are built inline in `app/(v2)/(flow)/day/[day]/page.tsx`. Home can't name the next step without copying that logic, and two copies would drift.

## 3. Rules (proposed, 2026-11-14)

- **The server is the only truth for ticks.** Session storage stays only as an instant local echo: the tick shows the moment the learner taps "finish", and the server answer replaces it on the next load. No screen decides "done" from session storage alone.
- **One shared day-step list.** One server function builds a day's steps from the published lesson: id, kind, Arabic title, subtitle, minutes, href, in the same order the day map shows today (story, detail pages, find_image if visible, day_questions, practice). The day map, the lesson-open event and the summary all use it.
- **What counts as a station for the count:** every step that is present, **except `practice`**. Skipped steps are not counted. Practice keeps its own "اتمرّن" mark on the path (`11` §6), because it comes after the day is already complete.
- **Next step = resume.** On read, the next step is the first counted step in saved order whose status is `not_started`. If every step before `day_questions` is done, it's `day_questions`. For a `completed` day there is no next step (a replay starts at the story, as `11` §3.2 says). The stored `resume` field keeps the last step touched, and later its page or item index; the next step is computed and never stored.
- **Order:** the saved order from `lesson_opened` wins. If a doc has no order yet (a `step_done` arrived before the open), fall back to the shared list's order.
- **Lock guard:** `step_done` and `lesson_opened` never change a `locked` or `scheduled` day, except day 1 and dev mode (`?dev=1` from an admin session). The event is accepted, nothing is written, and it is logged.
- **Counts, not percentages**, everywhere on home and the day map.

## 4. What the summary adds

`GET /api/v2/me/summary` gets one new block for the current day, `current_day_steps`:

- `done` and `total`: counted stations (rule above);
- `next_step`: id, Arabic title and href of the next step, or nothing;
- `started`: true when at least one step is done;
- `last_step_done_at`;
- `practised`: from the day's practice fields.

It reads the one lesson progress document for the current day plus the shared step list (content is already cached), so the summary still uses indexed reads only. The existing 60-second cache and the invalidation in the events route stay as they are.

## 5. Home (المسار) hero

Same card and colours (mint theme), new content:

- **Remove** the "٪ مكتمل" pill and the week-percentage bar.
- **Stations line** instead: "٣ من ٥ محطات" with a bar split into one segment per counted station, done segments filled. When nothing is done yet: "٥ محطات · حوالي N دقيقة", using the minutes from the shared list.
- **Where you stopped**, only when started and not completed: a small line "وقفت عند: {title of the last done step}".
- **Button, by state:**
  - not started: "يلا نبدأ", opens the first step;
  - in progress: "كمّل: {next step title}", opens the next step directly (not the day map);
  - questions done, practice not yet: "اتمرّن على الدرس", opens practice;
  - completed and practised: "راجع الدرس", opens the day map;
  - "بكرة" day: the day's title stays visible, the button is disabled with "بيفتح بكرة", and the suggestion line from the summary (deck, نواقصك or a conversation) shows under it.
- A small "شوف كل المحطات" link to the day map stays under the button.
- Path tiles: a day shows as done only when its server status is `completed`. An `in_progress` tile can show a small "٢/٥" under it.

## 6. Day map

- Reads ticks from the server: the page already loads on the server, so it fetches the learner's lesson progress for that day and passes the done ids into `DayMap`, merged with the local echo.
- The "current" station is the next step from §3.
- The header "محطات مكتملة (x/y)" uses the counted stations (practice not counted), and the % stays out.

## 7. Out of scope

- Resuming inside a page (page or item index). The `resume` field already has room for it; it's a later task.
- Minutes tracking and the streak: unchanged.
- Library unlock: unchanged (reads status, not steps).

---

## 8. Tasks for Cursor

Same rules as `11`: one task per session, in order, tests included, stop at "Done when". Prompt:

> Read docs/az-talkie-v2/13-step-progress.md (whole) and 11-profile-progress.md §3 and §7.3, AGENTS.md and 00-decisions.md §8b. Implement task **S-x only**. Do not start the next task. The user id always comes from the session helper. Only `/api/v2/progress/events` writes lesson progress. No screen decides a step is done from sessionStorage alone. No percentages on home or the day map. Write the tests the task asks for. Stop when "Done when" is met and list the files you changed.

**S0 · Write the doc in**
- Do: copy this doc to `docs/az-talkie-v2/13-step-progress.md`, add one line to `00-decisions.md` §8b pointing at it, link it from the README.
- Done when: docs updated, nothing else changed.

**S1 · Shared day-step list**
- Where: `lib/v2/progress/daySteps` (or next to `lib/v2/path.ts`).
- Do: move the step building out of the day map page into one server function that takes a day (and the dev flag) and returns the ordered steps with id, kind, title, subtitle, minutes, href, `present` and `counted`. The day map page and `LessonProgressBootstrap` use it, with no visible change.
- Tests: for a day with find_image visible and one with it hidden, the list and order match what the day map showed before; legacy scene pages stay out; practice is present but not counted.
- Done when: tests pass and day 3's day map looks exactly as before.

**S2 · Next step, counts and the lock guard**
- Where: `lib/v2/progress` (a small "step view" function) and `lib/v2/progress/events/handle.ts`.
- Do: one pure function that takes a lesson progress doc and the shared list and returns done, total, next step, last done step, started. `GET /api/v2/progress/lesson/[day]` uses it, so `resume_href` becomes the next step's href. Add the lock guard of §3 to `step_done` and `lesson_opened`.
- Tests: no steps done → next is the story; story and two pages done → next is the third page; all pages done → next is `day_questions`; completed day → no next step; skipped steps are never next and never counted; a doc with no saved order falls back to the shared order; `step_done` on a locked day 4 writes nothing; day 1 and dev still work.
- Done when: tests pass.

**S3 · Day map reads the server**
- Do: the day map page loads the learner's lesson progress for the day and passes done ids and the next step into `DayMap`; `DayMap` merges them with the local echo and stops treating session storage as the source; the header count follows §6.
- Done when: Omar finishes the story and one page of day 3 in one browser, opens day 3 in a private window signed in as himself, and sees the same two ticks with the right next station.

**S4 · Path reads the server**
- Do: remove `dayLooksDone` from `PathRoadmap`; a tile is done only when `learner_status` is `completed`; in-progress tiles show the small "x/y" from the summary or from `mergeLearnerPath` (add done/total there for in-progress days only).
- Tests: a day with only `practice` in session storage is not shown as done.
- Done when: clearing site storage changes nothing on the path.

**S5 · Summary and home hero**
- Do: add `current_day_steps` to `buildMeSummary` per §4; the path page passes it to the hero; the hero follows §5 (stations line, segmented bar, "وقفت عند", the state-based button that links straight to the next step, the "بكرة" state); remove the percentage.
- Tests: summary step numbers match a seeded user (day 3, story + 2 pages done, find_image hidden); the summary still makes no query on `v2_errors`; a completed-and-practised day returns no next step.
- Done when: on Omar's account home shows "٣ من ٥ محطات", "وقفت عند: …", and "كمّل: …" opens that exact page; after finishing the questions the button becomes "اتمرّن على الدرس"; the next morning day 4 shows "يلا نبدأ".
