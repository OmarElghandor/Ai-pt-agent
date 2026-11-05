# 09a · Conversations: task breakdown for Cursor

Companion to `09-conversations.md`. That document says **what** and **why**; this one splits section 11 ("Build order") into small tasks, each sized for **one Cursor session**. Do them in order. Each task lists what it depends on, where the code goes, and when it is done. No code in this document.

## How to run a task

Give Cursor this prompt, replacing the task id:

> Read docs/langify-v2/09-conversations.md (whole), docs/langify-v2/09a-conversations-tasks.md (only the task below and its dependencies), AGENTS.md and 00-decisions.md. Implement task **T-x.y only**. Do not start the next task. Follow 09 section 5 strictly: nothing may be added to the per-turn prompt beyond the six parts in 5.1. Reuse the modules listed in 09 section 10 instead of writing new ones. Write the tests the task asks for. Stop when "Done when" is met and list the files you changed.

Rules for every task:

- One task = one PR-sized change. If Cursor says a task is too big, split it, don't merge two.
- Pure logic tasks (grading, ladder, selection, prompt building) have **no UI and no model calls**; they come with unit tests using the day 18 pack.
- Nothing writes progress except `POST /api/v2/answers`.
- New code only under `lib/v2/convo`, `app/api/v2/convo`, `app/(v2)`, `components/v2/convo`.

Milestones (what Omar can play):

- **M1** after T1.11: a text-only day 18 conversation, streaming, in the browser.
- **M2** after T1.14: the full day 18 experience (cards, map, result card).
- **M3** after T4.1: Arabic questions and resume work; the budget is guarded.
- **M4** after T5.4: packs are generated, not hand-written.
- **M5** after T7.5: topics list and free chat are live.

---

## Step 0 · Decisions

**T0.1 · Write the decisions**
- Depends on: nothing.
- Do: add "§9b Conversations" to `00-decisions.md` summarising 09 sections 2, 3, 5 and 7; mark the beat-based Phase 6 practice as superseded for new work (kept until cut-over); link 09 and 09a from `docs/langify-v2/README.md`.
- Done when: the three docs are updated and nothing else changed.

---

## Step 1 · Engine on a hand-written day 18 pack

**T1.1 · Pack type, validator and loader**
- Depends on: T0.1.
- Where: `lib/v2/convo/pack`.
- Do: define the conversation pack shape from 09 §4.1 (scene, visual of type map or scene_card, groups, per-item coach intro, trick, choice questions, open questions, mistakes, help-ladder lines, recap, opening, closing, bridge). Items are referenced by lesson item id, not copied. Write a zod validator with every code check from 09 §4.1 that doesn't need generation (each item has ≥1 choice and ≥1 open question and is in the recap; choice questions contain the item; open questions don't; map questions reference existing steps). Loader reads packs from content files now (Mongo later in T5.3).
- Tests: a valid minimal pack passes; each rule has one failing fixture.
- Done when: tests pass. No UI, no DB.

**T1.2 · Day 18 pack content**
- Depends on: T1.1.
- Where: `content/v2/convo/pt-PT.day-18.json`.
- Do: the reference pack for day 18 (directions) authored by hand (Omar and Claude write it; Cursor only wires it and fixes validation errors it reports, never rewrites the Portuguese). Groups of 3: places, directions, relations. Map with the route metro → right → straight at the traffic light → left at the corner → home after the café.
- Done when: the validator passes on it and the loader returns it.

**T1.3 · Session document and start**
- Depends on: T1.1.
- Where: `lib/v2/convo/session`, Mongo model `v2_convo_sessions` (or `v2_sessions` with a kind; decide and note it in 09 §10).
- Do: create or load a session for user × pack. Fields from 09 §10. Start initialises every item at 📖, group 1 active, pending question empty, last 3 exchanges empty. Returns the opening bubbles (character opening line + group 1 coach intro and card ids). No model call.
- Tests: create, reload, second start returns the same session.
- Done when: tests pass.

**T1.4 · Grade one answer in code**
- Depends on: T1.1.
- Where: `lib/v2/convo/grade`.
- Do: given the current question, the map state and the learner text, return correct, near_miss, wrong (with which mistake id if listed) or unclear, plus the item ids used. Reuse `lib/v2/answers` normalize, match and knownNearMiss. Accepted forms are built by code from the item (articles, prepositions, accentless, vire/vira, gender variants).
- Tests: at least 20 day 18 cases ("direita", "à direita", "Vira à direita", "a direita", "direito", "esquerda" when the map shows right, empty text, mixed garbage).
- Done when: tests pass. No model.

**T1.5 · Ladder and help-ladder state machine**
- Depends on: T1.3, T1.4.
- Where: `lib/v2/convo/ladder`.
- Do: apply a graded answer to the session: move the item's rung (09 §3), count attempts per question, move through help steps 1→4, mark assisted, gate groups (next group only when the current one is all 👆 or higher), detect "all done → recap" and "recap done → closing". Also emits the moments the coach bank needs (first 🗣, success after struggle, 3 in a row, group done, miss 1–4).
- Tests: walk day 18 through a scripted run: right answers, a wrong one, four misses on one question, group change, recap, end.
- Done when: tests pass. Pure function, no DB.

**T1.6 · Candidate selection**
- Depends on: T1.5.
- Where: `lib/v2/convo/select`.
- Do: return the top 3 eligible questions with ids (09 §4.3): question type matches the item's next rung, current or earlier groups, consistent with the map position, not asked in the last 2 turns; ranking current-group behind items, then recycled weak, then others. After a miss, return the help-ladder step for the same question instead.
- Tests: fixtures for each rule; never returns an ineligible question; never empty while items remain.
- Done when: tests pass.

**T1.7 · Coach bank**
- Depends on: T1.5.
- Where: `lib/v2/convo/encouragement` and a content file `content/v2/convo/coach-bank.eg.json`.
- Do: 6–8 Egyptian variants per moment from 09 §7, with an {item} slot; picker that never repeats any of the last 3 lines used in the session; uses the item's memory trick on miss 2.
- Tests: no repeats across 20 picks; every moment has variants; slot filled.
- Done when: tests pass. Omar reviews the bank's tone.

**T1.8 · Prompt builder**
- Depends on: T1.6.
- Where: `lib/v2/convo/prompt`.
- Do: build the six parts of 09 §5.1 in fixed order (character rules, scene, event line, candidates, last 3 exchanges, answer), with the static parts marked for caching. Event line is produced by code from the T1.5 result (including the mistake's story consequence). Nothing from 09 §5.2 may appear.
- Tests: snapshot of the prompt for turn 1 and turn 30 of a scripted run; their token counts differ by under 10%; the prompt never contains the pack's item list, accepted forms, Arabic, or coach text.
- Done when: tests pass.

**T1.9 · Output parsing and post-checks**
- Depends on: T1.8.
- Where: `lib/v2/convo/output`.
- Do: parse the leading candidate-id tag (unknown id → first candidate), strip it, strip any question from the reaction, run the Brazilian/English/length checks, decide "ok", "regenerate once with this exact reason", or "drop the reaction". Unknown words are marked for "معناها؟", not rejected.
- Tests: fixtures for each case, including a tag split across stream chunks.
- Done when: tests pass. No network.

**T1.10 · Turn route (streaming)**
- Depends on: T1.4–T1.9.
- Where: `app/api/v2/convo/turn`, logic in `lib/v2/convo/turn`.
- Do: the 9 steps of 09 §4.2 without the Arabic side channel (T3.x) and without progress writes (T1.12): grade → update state → coach bank line sent first → candidates → one streamed model call (model from env) → tag handled as soon as it arrives and the question's audio key sent → post-checks (one regeneration at most) → append the chosen question with its cached audio key → save the session. Unclear answers go to the model as an event, never to the grader.
- Done when: a scripted curl/test run of 10 turns on day 18 returns streams in the right order and the session advances.

**T1.11 · Conversation screen, text only (M1)**
- Depends on: T1.10.
- Where: `app/(v2)/(flow)/talk/[packId]`, `components/v2/convo`.
- Do: character bubbles with the `say` line and hidden "معناها؟", learner bubbles, coach NoteCard, streaming text, choice chips for choice questions and help step 3, play buttons using existing TTS and cached audio. Follow 05 and `design/stitch-html/11-practice-conversation.html`, 390px, RTL with tl segments LTR.
- Done when: Omar can play day 18 to the end by typing.

**T1.12 · Progress mirroring**
- Depends on: T1.10.
- Where: `lib/v2/convo/progress`, calling `POST /api/v2/answers`.
- Do: map rungs to progress (🔈 heard, 👆 understood, 🗣 said, assisted → understood) with answer_id idempotency and the implicit-review cap; assisted items become tomorrow's cards.
- Tests: replaying the same turn twice writes once.
- Done when: after a day 18 run, `v2_item_state` shows the expected levels.

**T1.13 · Item cards and the map**
- Depends on: T1.11.
- Do: inline item card when a group starts (image or arrow, `say`, audio); the map component for the `map` visual: nodes, the character's position, the route step highlighted when a question refers to it, wrong-way movement on a wrong direction, hidden during the recap; scene_card with hotspots for non-map packs (simple version).
- Done when: day 18 shows cards per group and the map reacts to answers.

**T1.14 · Result card, survival buttons, voice (M2)**
- Depends on: T1.12, T1.13.
- Do: result card (said / understood / extra words, "بتفهم +N · بتقول +M"); survival buttons Pode repetir? · Mais devagar · Não percebi (replay or simpler re-ask from the pack, no model, counted as used); voice input through `/api/stt` with "مش قادر أتكلم دلوقتي" switching to typing.
- Done when: day 18 plays fully by voice and ends on the result card.

---

## Step 2 · Prompt budget guard

**T2.1 · Turn metrics in the dev panel**
- Depends on: T1.10.
- Do: log per turn input, cached and output tokens, time to first token and total time; show them in the existing dev panel.
- Done when: visible for every turn.

**T2.2 · 40-turn budget test in CI**
- Depends on: T2.1.
- Do: a script that plays 40 turns on day 18 with a scripted learner (correct, wrong, unclear, Arabic once T3 exists, off-topic) against a stub model, and fails if turn 40's input tokens exceed turn 3's by more than 10%.
- Done when: it passes, and fails when a line is added to the prompt on purpose.

---

## Step 3 · Arabic side channel

**T3.1 · Detection and Arabic answers**
- Depends on: T1.10.
- Do: detect Arabic or mixed script before grading; classify answer-in-Arabic vs question vs other (code rules first); for an answer in Arabic, the coach gives the Portuguese item from the current question and the character waits; never counted as an error; Arabic never enters the character's exchanges.
- Done when: typing "يمين" mid-run gets a coach note and the session's exchanges contain no Arabic.

**T3.2 · Questions about pack items, no model**
- Depends on: T3.1.
- Do: "يعني إيه esquina؟" or "ازاي أقول شمال؟" about a pack item → answer from the item card and highlight it on the visual.
- Done when: works for every day 18 item.

**T3.3 · Coach call for other questions**
- Depends on: T3.1.
- Do: a small separate coach call with its own fixed prompt (Egyptian, 1–2 lines, then "جرّب تقولها"); never sees the character prompt; one short timeout with a bank fallback line.
- Done when: "ازاي أقول مع رز؟" gets a correct short answer and the conversation continues where it was.

---

## Step 4 · Resume

**T4.1 · Resume after leaving (M3)**
- Depends on: T1.10.
- Do: reopening a session builds the reopening line from a template plus the pending question, with no model call; works after a server restart.
- Done when: leave day 18 mid-group, reopen later, and continue on the same question.

---

## Step 5 · Pack generation

**T5.1 · Job kind: convo_outline**
- Depends on: T1.1, the Phase 3 job DAG.
- Do: new job kind after lesson publish: scene, character from characters.json by place, information gap, visual type, groups, recap shape. Visible in admin and handoffs like other jobs.
- Done when: running it for day 18 produces an outline that passes its part of the validator.

**T5.2 · Job kind: convo_items (one per group)**
- Depends on: T5.1.
- Do: per group: coach intros, tricks, choice and open questions, mistakes with consequences, help-ladder lines. Prompt examples come from the hand-written day 18 pack.
- Done when: generated groups for day 18 pass the validator.

**T5.3 · Assemble, checks, store, audio**
- Depends on: T5.2.
- Do: code builds accepted forms, map wiring and help-step choices; run the full check list (09 §4.1) with one retry and question-level drops; reuse critic and lang_check; store in `v2_convo_packs`; warm audio for every fixed line with the character's voice and the coach voice; the loader reads Mongo first, content files second.
- Done when: a generated day 18 pack is stored with all audio ready.

**T5.4 · Admin wiring and three days (M4)**
- Depends on: T5.3.
- Do: admin button per lesson to generate or rerun the conversation pack; generate days 3, 18 and 22.
- Done when: all three play end to end as well as the hand-written day 18.

---

## Step 6 · Topics list and review

**T6.1 · Topics mapping and status API**
- Depends on: T1.12.
- Do: a content file mapping topics to lessons (pt-PT title, Arabic subtitle); API returning topics with unlock state and status 🟢/🟡/⚪ from `v2_item_state`.
- Done when: the API returns correct statuses for a test user.

**T6.2 · Topics screen and home suggestion**
- Depends on: T6.1.
- Do: the topics screen grouped by theme, and one 🟡 suggestion card on home.
- Done when: tapping a topic opens or resumes its conversation.

**T6.3 · Review mode**
- Depends on: T6.1.
- Do: on replay, each item starts at the rung from its progress (said → open questions, no card; understood → choice).
- Done when: replaying day 18 after finishing it skips the cards.

---

## Step 7 · Free chat

**T7.1 · Free topics and angle bank**
- Depends on: T5.3 (job infrastructure).
- Do: list of free topics; a one-off job generating 8–12 angles per topic (pt-PT question + item hints), cached in `v2_topic_angles`, checked like character lines.
- Done when: angles exist for 6 topics.

**T7.2 · Free chat turn**
- Depends on: T7.1, T1.8–T1.10.
- Do: the Module C prompt variant (same six parts; candidates become current and next angle; up to 15 suggested words from weak and recent items); reply ends with a question, otherwise append the next angle question; screen reuses the conversation components.
- Done when: a 30-turn free chat never ends without a question and the budget test passes for it.

**T7.3 · Off-topic handling**
- Depends on: T7.2.
- Do: code off-topic signal (no shared content word with the topic set); first time bridge back, second time switch to the nearest catalogue topic; non-learning requests get the coach decline.
- Done when: an English football message is bridged back, and twice switches topic.

**T7.4 · Facts and resume for free chat**
- Depends on: T7.2, T4.1.
- Do: one fact per closed angle from correctly said items (max 5 per session); reopening line from a template plus the pending question.
- Done when: leave and return, and the chat continues on the same angle.

**T7.5 · Topic requests and the lesson-to-free bridge (M5)**
- Depends on: T7.2, T6.1, T3.1.
- Do: "عايز أتعلم X" in free chat → open the matching topic conversation, then return to the pending free-chat question; unmatched requests logged in `v2_topic_requests`; the end of a lesson conversation continues into free chat on its topic.
- Done when: the full loop free chat → directions conversation → back to free chat works.

---

## Step 8 · Polish

**T8.1 · Tone and variety pass**: Omar reviews the coach bank and 10 recorded runs; fix lines that feel childish or repetitive.
**T8.2 · Speed pass**: target first audio within ~2.5 s of sending; use T2.1 numbers to find the slow step.
**T8.3 · Edge cases**: STT empty or unclear, network loss mid-stream, double send, very long learner message.

## Step 9 · Cut-over

**T9.1** Remove legacy Friend and Assessment chat, the friend-bridge and the JSON learner file store.
**T9.2** Remove the beat-based `/practice/[day]` route and its pack kind once every published day has a conversation pack.
