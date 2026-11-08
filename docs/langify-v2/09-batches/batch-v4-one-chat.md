# Conversations v4 · One chat: a router picks the topic, goals drive it, the level is guarded

Decided by Omar on 2026-11-08 after the day-1 run. **This replaces the topic picker and the per-day entries from v3.** Role-play (pre-generated, day 33) stays as it is.

## What went wrong in the day-1 run

- **No direction.** After «Ola bom dia» Inês asked «de onde és?», then about Egyptian food, then «E depois, o que aconteceu?». None of these are day-1 goals. The goal bank was loaded, but the replies didn't follow it: the header still said «Qualquer coisa» and the open-mode fallback bank was used.
- **Above the learner's level.** Egyptian food, «fizeste», «aconteceu» — nothing the learner has studied by day 1.
- **Incoherent text.** «Ah, dizes que és do Egito e gostas de comida egípcia! E depois, o que aconteceu?» after the learner wrote «mutio bem.».
- **Two empty character bubbles** were rendered.
- **The model can't hold a goal.** Qwen3.5-35B-A3B keeps drifting even with CURRENT GOAL in the prompt. The example conversations written in planning (the directions and casa transcripts) are what a stronger model does with the same goal list. **Test a stronger model for the character reply** (V7) before tuning prompts any further.

## The design

1. **One entry: «اتكلّم».**
   - No topic list is needed, but there's an optional row of 3 suggestion chips.
   - Role-play has its own entry.
2. **The character opens** at the learner's level: «Olá, {name}! 😊 Tudo bem?». The opening has 3 topic chips chosen from the topics the learner can handle (V2).
3. **The router runs on the learner's first Portuguese or Arabic message, and on explicit topic requests only.** It is one small structured call (a classifier, temperature 0).
   - **Input:**
     - the message;
     - the catalog of **allowed** topics for this learner (V2): id, title and 1-line description;
     - the learner's level (last completed day).
   - **Output:** `{topic_id | "new", new_topic_title?, confidence}`.
   - Below 0.6, or "new" for a topic above the level → the character asks one simple question with the 3 chips.
   - **The topic is then locked.** No per-message classification. It changes only when:
     - the goals are done (V5);
     - the learner explicitly asks («quero falar de…», «عايز أتكلم عن…»; code patterns first, then the router).
4. **Goals for the topic:** an authored bank (e.g. `goals/pt-PT.day-1.json`) wins, then a cached generated bank, then a newly generated bank (the V7 cache from v3).
   - **Every bank is filtered by level:** goals whose examples need items the learner hasn't studied are dropped. A generated bank is generated **with** the allowed item list.
5. **Goal by goal**, as in batch v3:
   - the current goal's `ask_tl` opens it;
   - code checks the learner's messages;
   - steering escalates;
   - help comes from the goal.
   - The reply prompt's CURRENT GOAL part is mandatory, and the character may not ask about anything else until that goal is done, assisted or skipped by the escalation.
6. **Level guard on every reply:** at most 2 content words outside (studied items + a fixed list of ~300 function and very common words). Over that → one regeneration naming the words, then the fallback (reaction + `ask_tl`).
7. **When the goals are done:**
   - the closing line;
   - the goals-done note;
   - the character offers the next topic, with 2 chips from the allowed topics.
   - The learner's pick (or a free message) goes through the router again.

## Prompt to paste into Cursor

Read this file, batch-v3-two-modes.md and batch-v3-fix-1.md. Implement V1–V8 in order, committing each as "conversations v4: V<n> <title>", with tests. Don't change content Portuguese. **Push after every step**, so the work can be reviewed.

- **V1 · Fix first.**
  - Never render a character bubble with empty text: no empty `pt` → no bubble.
  - A session with goals never takes the open-mode path. The goal path is used whenever `goals.length > 0`, whatever the topic id.
  - The header shows the locked topic, never «Qualquer coisa» once a topic is set.
  - Tests for all three.
- **V2 · The learner level and the allowed topics.**
  - **Level** = the last completed lesson day (from progress; in dev, override it with `?level=N`).
  - **Allowed topics** = the thread topics + lesson-day topics + previously generated topics whose required items are all ≤ level.
  - A topic's required items are the core items its goal examples use. Compute them once per bank and store them.
  - Tests:
    - at level 1, only the day-1 topic (introductions) is allowed;
    - at level 20, casa, trabalho and others are allowed;
    - comida is not allowed before day 15.
- **V3 · Router.**
  - One structured call, with the input and output described above. It runs only on the first message and on explicit topic requests.
  - Tests with a stub model:
    - «Ola bom dia» at level 1 → the day-1 topic;
    - «quero falar de futebol» at level 1 → not allowed → the chip question;
    - «عايز أتكلم عن الشغل» at level 20 → trabalho.
- **V4 · Opening + topic lock.**
  - Level-appropriate opening with 3 allowed-topic chips.
  - The topic stays locked until the goals are done or there's an explicit request.
  - Remove the topic picker screen and the «دروسك» day entries from the talk flow (keep them in admin only).
- **V5 · Goals drive the reply.**
  - Enforce CURRENT GOAL: `ask_tl` on goal change.
  - Code fallback = reaction + `ask_tl`.
  - Escalation and help as in v3.
  - Goals done → closing → next-topic offer → router.
- **V6 · Level guard** on replies (the allowed vocabulary from studied items + a common-words list stored at `content/v2/convo/common-words.pt-PT.json`, generated once and reviewed).
- **V7 · Character model A/B.**
  - Add `V2_CONVO_MODEL`, and a dev-menu switch between the current Qwen and Claude Haiku (already used for the grader).
  - Log cost and latency per turn for both.
  - Add a dev script that plays the golden conversations (V8) against each model and prints the transcripts side by side.
- **V8 · Golden conversations (acceptance).** Scripted learner turns, with checks after each turn: the goal progress, one question, no off-level words, no topic drift.
  1. **Level 1**, messages in order:
     - «Ola bom dia.»
     - «Eu sou egito»
     - «mutio bem.»
     - «مش عارف»
     - «Chamo-me Omar. E a senhora, como se chama?»
     - «Igualmente»
     - «Boa tarde!»

     Expected: the day-1 goals in order, never food or past-tense questions, and the closing at the end.
  2. **Level 20, casa:** answers out of order still complete the goals.
  3. **Level 20, «quero falar de futebol»:** a generated topic within level, and goal-driven.

## Done when

- **Golden 1, with the chosen model:** Inês follows greet → name → ask her name → Muito prazer / Igualmente → goodbye, recasts «Eu sou egito» → «Ah, é do Egito!» briefly, and comes back to the current goal in the same reply.
- **Every turn:** no off-level words or topics, and no empty bubbles.
- Omar reads the side-by-side transcripts (Qwen vs Haiku) and picks the model.
