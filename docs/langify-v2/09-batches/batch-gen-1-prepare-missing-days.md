# Gen 1 · Prepare missing lessons and conversations on demand (no dead ends)

Problem (2026-11-06): opening a Learn topic whose day has no published lesson shows «مفيش درس منشور لليوم ده — مش هنقدر نولّد المحادثة» and stops.

**Cause:** `ensureConvoPackReady` (lib/v2/convo/pack/ensure.ts) can generate a conversation pack, but only from a **published** lesson. Nothing generates the lesson itself. It also blocks the start request for up to 180 s.

**What already exists, and must be reused (not rebuilt):**
- `generateLessonDraft` and `generateLessonFull`;
- the job DAG and admin jobs;
- critic, lang_check and the fatal-issue gate;
- `publish.ts`;
- `enqueueAndStartGenerateConvoPack`;
- audio warming.

## Decisions

- **Content is shared, not per user.** A day is generated once, then everyone uses it.
- **Most days should be ready before anyone asks.** Background pre-generation covers that. On demand is the fallback.
- **The learner never sees a dead end.** While a day is being prepared, they see progress, and they can practise the topic right away.
- **Authored content wins:** a hand-written pack (e.g. `content/v2/convo/pt-PT.day-33.json`) is always used instead of a generated one, and serves as a generation example.

## Prompt to paste into Cursor

Read this file, docs/langify-v2/00-decisions.md (generation and publish rules), and lib/v2/convo/pack/ensure.ts, lib/v2/generation/generateFull.ts, lib/v2/generation/jobs.ts. Implement P1 to P8 in order, and commit each as "generation: prepare P<n> <title>", with tests. Reuse the existing pipeline. Don't create a second one.

## Steps

**P1 · Day readiness.**
- A function and route returning, per language × day:
  - `lesson`: none | generating | draft | needs_review | published;
  - `pack`: none | generating | ready (authored or generated);
  - `audio`: none | warming | ready;
  - `job_id` if something is running;
  - `error_eg` if it failed.
- A list form for the pickers (many days in one call).
- Tests with mocked states.

**P2 · `prepare_day` job (idempotent, one at a time per day).**
- A new job kind in the existing DAG that chains whatever is missing:
  1. **Lesson text** via `generateLessonDraft`, with images skipped (image slots keep their placeholders, as decided before).
  2. **Gate:**
     - existing fatals or lang_check Brazilian flags → stop at `needs_review` and show it in the admin queue;
     - otherwise **auto-publish**, with `meta.auto_published = true`, and add it to an admin "auto-published, please check" list.
  3. **Conversation pack** via the existing convo jobs, using the authored day 33 pack as the prompt example. Skipped if an authored pack exists for that day.
  4. **Audio warming** for the pack's fixed lines and the lesson's lines.
- Lock per day: a Mongo doc with a TTL. A second request joins the running job instead of starting another.
- One retry per step. Status updates are visible through P1.
- Tests:
  - a double request starts one job;
  - a fatal stops at needs_review;
  - an authored pack skips step 3.

**P3 · Start route never blocks.**
- Replace the 180 s blocking wait in `ensureConvoPackReady`.
- If the pack isn't ready, the start route returns `{status: 'preparing', job_id, readiness}` immediately, after enqueuing or joining `prepare_day`.
- The client polls readiness every 3 s, or subscribes if a stream already exists.

**P4 · "Preparing" screen (replaces the error).**
- Calm/Kit, inside the conversation shell:
  - the character's avatar;
  - the title «بنجهّزلك الدرس ده ✨»;
  - three steps with check states: «الدرس», «المحادثة», «الصوت»;
  - a gentle line «بياخد دقيقة أو اتنين».
- Two actions while waiting:
  - **«اتكلم عن الموضوع ده دلوقتي»** opens practice open mode with this day's core items as suggested words and the day's situation as the topic;
  - «رجوع».
- When it's ready: a toast «الدرس جاهز 🎉» with «افتح», plus auto-open if the learner is still on this screen.
- **Failure:** «الدرس ده محتاج مراجعة قبل ما يتنشر 🙏 هيبقى جاهز قريب», the practice option, and nothing red.

**P5 · Pickers show readiness.**
- Learn picker cards for days that aren't ready show a small «بيتجهّز» or «قريباً» chip instead of failing.
- Tapping one starts P3 (it doesn't open an error).
- Topic requests from free chat that map to an unready day behave the same way.

**P6 · Background pre-generation.**
- **Admin button «جهّز الأيام الجاية»:** runs `prepare_day` for a range, with concurrency 2, a stop button and a cost total.
- **Scheduled run** (the existing worker or a cron route, behind an env flag): keep the next 7 days after the furthest active learner's current day prepared.
- **Cost cap:** per day and per month (env). The run stops at the cap and logs it.

**P7 · Admin review queue.**
- One list of:
  - `needs_review` days, with their fatal issues;
  - `auto_published` days not yet checked.
- Actions: open the lesson preview, open the conversation preview, mark checked, regenerate, unpublish.

**P8 · Topics from the curriculum (minimum for now).**
- The Learn picker's topic list is built from `content/v2/plan/pt-PT.core-items.json` and the days file: day, title_tl, situation_eg as the subtitle, and the character from the lesson's story cast.
- It no longer comes from the hand-written `topics.pt-PT.json`. Keep that file only for theme grouping and overrides.
- The pack id is always `pt-PT.day-<n>`, and its items must equal that day's core items (the same test as learn-fix L1).

## Done when

1. With day 34 not generated, open it from Learn → the preparing screen appears in under 1 s, the three steps tick, and the conversation opens by itself when ready.
2. Opening it at the same time from a second browser joins the same job.
3. Tap «اتكلم عن الموضوع ده دلوقتي» while waiting → open mode on the directions words.
4. Force a fatal → needs_review, the failure message, and the day appears in the admin queue.
5. Admin «جهّز الأيام الجاية» for days 35–40 shows progress and cost, and all reach ready or needs_review.
