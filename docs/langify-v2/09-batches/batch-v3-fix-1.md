# v3 fix 1 · Lesson-day free talk opens as «أي حاجة»

Run on 2026-11-07, /talk/free/open?day=1 (branch docs/conversations-plan @ 822e121):

- the header says «أي حاجة»;
- the bubble says «Olá! 😊 Sobre o que queres falar hoje? Bom dia!».

So the day-1 goals are loaded, but nothing else about day 1 is.

## Causes

1. **Session reuse:** `startFreeConvoSession` resumes any open `free:open` session and ignores `lessonDay`. Day N and «أي حاجة» share one session.
2. **Opening:** `buildFreeOpeningBubbles` composes `topic.opening_tl` (the open topic's «Sobre o que queres falar hoje?») with the first goal's `seed_tl`. For lesson goals, `seed_tl` is set to the **learner's** expected line (Bom dia!), so the character says the learner's line.
3. **No day framing:** the header, the coach intro, the topic chip and the character's lines don't use the day's title, situation or scene.
4. **Day 1 goals are hard-coded** in `day1Goals()`. Other days get generic goals with no character lines that open them.

## New content (already written; don't change the Portuguese)

`content/v2/convo/goals/pt-PT.day-1.json` is an **authored lesson-day goal bank**. It adds these fields to ConvoGoalBank:

- **Bank level:**
  - `title_tl` / `title_ar`;
  - `intro_eg` (the coach intro);
  - `opening` {tl, ar, tl_f, ar_f};
  - `closing` {tl, ar}, with a {name} slot;
  - `scene.address`: formal | tu.
- **Per goal:**
  - `ask_tl` / `ask_ar`, with `ask_tl_f` / `ask_ar_f` when the learner's gender changes it. This is the character line that opens the goal; the model may rephrase it lightly, or code uses it verbatim when the model fails.
  - optional `time_of_day`: this goal happens later in the day, so the scene moves on, e.g. the goodbye at the end of the afternoon.
- **`seed_tl` means what the character says about herself, never the learner's line.**

## Prompt to paste into Cursor

Read this file and batch-v3-two-modes.md. Implement F1–F6 in order, and commit each as "conversations v3: fix F<n> <title>", with tests. Don't change the content Portuguese. Push at the end.

**F1 · Separate sessions per lesson day.**
- Lesson-day sessions use the key `free:day-<N>`.
- Resume only matches the same key and the same `lesson_day`.
- Tests:
  - day=1 after an existing «أي حاجة» session → a new day-1 session;
  - day 1 twice → the same session;
  - day 2 never resumes day 1.

**F2 · Authored goal banks win.**
- Loader order for a lesson day:
  1. `content/v2/convo/goals/pt-PT.day-<N>.json` if it exists;
  2. else the cached generated bank (F5);
  3. else `loadGoalsForDay`.
- Remove the hard-coded `day1Goals()` once the file covers day 1.
- Validate the new fields:
  - every goal has `ask_tl` + `ask_ar`;
  - the opening exists;
  - the goal ids are unique;
  - the examples and keywords rules as before.

**F3 · Lesson-day opening and framing.**
- The opening bubble is the bank's `opening` (the `_f` variant by learner gender). Never compose it with the open topic's template.
- The coach intro is `intro_eg`.
- The header is the character name with `title_tl · title_ar`. The topic chip is «يوم N · title_ar».
- The prompt's TOPIC part gets the scene: place, time of day, address form (formal → o senhor / a senhora or the verb with no pronoun, never tu).
- `seed_tl` is only the character's own share line.

**F4 · Character lines per goal.**
- When the current goal changes, CURRENT GOAL includes its `ask_tl` («open this goal with something like: …»).
- If the model's reply fails its checks twice, code uses the reaction fallback + `ask_tl` verbatim.
- If a goal has `time_of_day`, the scene time moves to it when that goal becomes current, and the character's line can mark it.
- When all goals are done: the `closing` line, then the goals-done note (V6).

**F5 · Lesson-day goal banks for other days (generated once, cached).**
- One generation call per day, using the day's core items, situation, story cast and `real_world` phrases. It produces the same schema as the day-1 file: opening, intro_eg, 4–6 goals with ask lines and help.
- The day-1 file is the prompt example.
- Validated, cached in Mongo per day, and shown in the admin «review» list (like gen-1 P7).
- Run it for days 2–5 from the admin.

**F6 · «دروسك» section + admin links.**
- In /talk/practice, add a «دروسك» section above the topics: completed lesson days (in dev: days 1–5), each opening /talk/free/open?day=N.
- Admin "Open talk" opens the same URL. A separate "Role-play" link shows only when the day has a role-play pack.

## Done when

Open «دروسك → يوم 1»:
1. The header shows «Inês · Apresentar-se · تقديم نفسك», the coach intro shows, and the bubble says «Olá, bom dia! 😊 É o novo colega?».
2. «Ola bom dia, sim e meu primeiro dia» → greet done, and Inês asks your name.
3. «مش عارف» → the frame «Chamo-me ___.» with chips.
4. «Chamo-me Omar.» → Inês: «…Ainda não sabe o meu nome! 😄»; «Como se chama?» → «Chamo-me Inês. Muito prazer!»; «Igualmente.» → the scene moves to the afternoon: «Bom, vou para casa. Boa tarde!»; «Boa tarde!» → «Até amanhã, Omar! 👋» + the goals-done note.
5. Going back to «أي حاجة» still opens its own session.
