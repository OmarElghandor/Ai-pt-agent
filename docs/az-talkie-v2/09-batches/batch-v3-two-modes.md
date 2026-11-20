# Conversations v3 · Two modes only: goal-directed free talk + pre-generated role-play

Decided by Omar on 2026-11-07. This replaces the «اتكلّم / اتعلّم» split and the threads / open-mode distinction from batches 9–10. Splitting things up created more problems than it solved. Where this file disagrees with 09-conversations.md or any batch file, **this file wins**.

## The two modes

| | **محادثة (free talk)** | **رول بلاي (role-play)** |
|---|---|---|
| What it is | A live conversation with direction: the character talks freely, and code steers it toward a short list of goals | A scripted scene with a clear task (guide Inês on the map, order at the café, buy at the pharmacy) |
| Content | **Goals** per topic, pre-written or generated once and cached. **The dialogue is live.** | **Pre-generated pack**: flow, questions, authored reactions, map or scene. This is the current Learn engine, kept as is (day 33 is the reference) |
| Who talks | The model writes every character line | The pack's lines; the model only optionally adds reactions (`V2_LEARN_MODEL_REACTIONS`, off by default) |
| Grading | **By meaning**: a goal is done when the learner expressed it, in any words and any order | Expected answer per question (item + accepted forms) |
| For which lessons | Every topic and every lesson | Only lessons with a real task (directions, café order, pharmacy, shop, appointment), **not** greetings days |

There is no «اتعلّم» label anymore. The entry screen shows «اتكلّم» (free talk) and «رول بلاي».

## Free talk, step by step (the first design, with what we learned since)

**Goals**
- A conversation has 4–6 goals. A goal has these fields:
  - `id`;
  - `intent_eg`, what the learner should express, in one Egyptian line (e.g. «يقول هو ساكن فين»);
  - `examples_tl`: 2–4 accepted ways to say it;
  - `keywords`: content words that must appear (lemmas, e.g. morar/moro, Amadora…), used as a plausibility check;
  - `seed_tl` / `seed_ar` (optional): something the character can say about herself to open the goal ("Eu moro em Alfama");
  - `help`: {frame_tl, eg, chips} for the help ladder.
- **Where goals come from:**
  1. **The 12 thread banks** (`content/v2/convo/threads/*.json`), converted by code. Every thread's ask becomes a goal, and its follow-up becomes an optional second goal:
     - the share → `seed`;
     - the frame and chips → `help` and `examples_tl`;
     - `keywords` derived from the chips.
  2. **Lesson topics:** for each lesson day, from `pt-PT.core-items.json`. Every phrase and pattern of the day becomes one goal (e.g. day 1: greet with the right greeting for the time, say your name, ask her name, say Muito prazer, say goodbye). Words become `suggested_words`, not goals. The scene (place, time of day, character) comes from the day's plan and its story cast. **Code sets the time of day**, so the character can't contradict it.
  3. **«أي حاجة» / a new topic:** one model call generates 5 goals in this schema from the topic and the learner's level. Code validates them and caches them per topic for every user (the same as the gen-1 caching).

**Per turn**
1. **Side channel first** (Arabic or English, as in the side-channel fix). The character waits.
2. **Goal check:** code matches the message against every **open** goal (any order; one message can complete several goals), using `examples_tl` (fuzzy, accent- and case-insensitive) and the keywords.
3. **The model writes the reply,** with the same six labelled parts. Part 4 becomes **CURRENT GOAL**, one line: «steer toward: <intent in English> · you may share: <seed_tl>».
   - The reply is a reaction to what the learner said (with a recast if there were mistakes), then **exactly one question** that moves toward the current goal.
   - Then the `AR:` line, then a hidden line `GOALS: g2,g3` (or `GOALS: -`): the goals the learner's last message expressed, judged by meaning.
   - Code accepts a model-reported goal only if the message shares at least one keyword with that goal or fuzzy-matches an example. This stops goals being marked done by mistake.
4. **Steering escalation (code, per current goal):**
   - after 2 learner turns without the current goal, the CURRENT GOAL line says «ask about it directly now»;
   - after 3, the help ladder starts automatically, in a coach note: the frame + chips;
   - after 4, the coach gives the sentence, the learner may repeat it, the goal is marked assisted, and the conversation moves to the next goal.
5. **«مش عارف», «مش فاهم» or silence** → the help ladder for the **current goal**, starting at step 2. Never the bare answer straight away.
6. **Never «مش واضح، حاول تكتبها تاني» for typed Portuguese.** If the character didn't understand, she reacts like a person («Desculpa, não percebi… queres dizer…?») and rephrases. «مش واضح» is only for empty or unclear STT.
7. **When all goals are done:** a small coach note «خلّصت أهداف المحادثة 👏», a summary chip, and the chat **continues**. Code picks 3 new goals from the learner's weak items on the same topic. There's no dead end and no forced exit, and «خلّص» stays available.

**Kept from earlier batches:**
- the stream filter and the final-text-wins rule (fix-2 G1–G3);
- the output script guard (learn-fix-2 M2);
- the correction card under the learner's bubble (batch-corrections);
- coach segments (K6);
- resume (reopen line + pending question);
- voice-first UI;
- the dev ⋯ menu;
- metrics and the flat-prompt test (add a case: turn 3 vs turn 30).

**Removed:**
- the thread pointer and the "authored next line appended after the reaction" behaviour in free chat (threads now only feed goals);
- the open-mode FRAME / HINT / CHIPS model output lines (help comes from the goal's `help`, or from a cheap code template for generated goals);
- the «اتعلّم» naming;
- conversation packs for greeting-type days. Delete the generated day 1 pack ("Bom dia… São dez da noite… Boa tarde ou boa noite?"); day 1 is free talk with goals now.

**Bugs seen on 2026-11-07 that must not come back** (add tests):
- the reaction text repeated 3 times in one bubble («Hmm… Como? Hmm… Como? …»);
- the same coach note emitted twice in a row («بتبدأ بـ Boa…» ×2);
- a natural correct answer («Ola bom dia, sim e meu primeiro dia») rejected as unclear;
- «مش عارف» answered with the final answer instead of help.

## Role-play

- It keeps the current Module A engine: authored or generated pack, `flow`, authored reactions, map or scene, near-miss spelling, the re-ask after a miss.
- **Role-play list:** only days whose plan situation is a task. Start with day 33 (authored). Later candidates: café order (3/4), pharmacy (40), clothes shop (42/43), appointment (35/36), tickets (32). Each one is authored by Omar + Claude, or generated and then reviewed.
- At the end of a role-play: «اتكلم عنه دلوقتي» opens free talk with that day's goals.

## Prompt to paste into Cursor

Read this file first; it overrides the earlier batches where they disagree. Then read 09-conversations.md §5–§7, batch-side-channel-fix.md, batch-corrections.md and batch-10-fix-2.md. Implement V1–V8 in order, committing each as "conversations v3: V<n> <title>", with tests. Don't change any content Portuguese. Push the branch at the end.

- **V1 · Goal schema, loader and validator.**
  - Convert the thread banks into goals in code (no new files).
  - Build lesson-day goals from core-items for days 1–49.
  - Tests:
    - casa has 5–10 goals;
    - day 1 has goals for greeting, name, asking the name, Muito prazer and goodbye;
    - every goal has examples, keywords and help.
- **V2 · Free-talk session state:**
  - `goals[]` with status: open, done or assisted;
  - `current_goal`;
  - `turns_on_goal`;
  - `scene` (place, character, time of day from code);
  - the existing fields.
- **V3 · Goal check in code** (fuzzy examples + keywords, multiple goals per message).
  - Tests: «Ola bom dia, sim e meu primeiro dia» completes "greet"; «Chamo-me Omar. E tu, como te chamas?» completes "name" and "ask name".
- **V4 · Prompt part 4 = CURRENT GOAL,** plus the output contract (reaction + one question + `AR:` + hidden `GOALS:`), plus the keyword plausibility check.
  - Parser tests: split markers, `GOALS` missing, `GOALS` with an unknown id.
- **V5 · Steering escalation, help ladder per goal,** the «مش عارف» handling, and no «مش واضح» for typed text.
  - Tests for turns 2, 3 and 4 on the same goal.
- **V6 · All goals done → coach note,** then new goals from weak items, and the chat continues.
- **V7 · Generated goals for «أي حاجة» / new topics:**
  - one call, validated, cached per language × topic slug;
  - the preparing state reuses gen-1 P4 (it's short here).
- **V8 · Modes and cleanup:**
  - the entry screen shows «اتكلّم» and «رول بلاي»;
  - the role-play list is day 33 only for now;
  - remove the free-chat thread pointer, the open-mode FRAME / HINT / CHIPS lines and the generated day 1 pack;
  - add the four 2026-11-07 regressions as tests.

## Done when

1. **Free talk, day 1 (morning, Inês, office), typed:** «Ola bom dia, sim e meu primeiro dia» → recast and correction card, the greeting goal done, and Inês moves on to names. «مش عارف» → the frame «Chamo-me + اسمك» with a chip. «Chamo-me Omar. E tu, como te chamas?» → two goals done. Continue to goodbye → the goals-done note, and the chat continues.
2. **Free talk, casa:** natural answers in any order complete the goals; nothing like «مش واضح»; the input tokens stay flat.
3. **«أي حاجة» → «Quero falar de carros»:** goals are generated once (a second user gets them from the cache), and the conversation steers through them.
4. **Role-play day 33** still works as before.
