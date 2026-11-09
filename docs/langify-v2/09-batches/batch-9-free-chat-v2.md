# Batch 9 · Free chat v2: a friendly partner, threads, Arabic help

**This replaces batch-8-fix-1.md. Don't run fix-1.** It keeps the parts of fix-1 that still apply (F1, F2, F5, F7, F8 and F9 are folded in below) and replaces angles with threads.

## Why

Free chat felt like a questionnaire. The angles were random yes/no questions ("Gosta da sala?"), so an A1 learner answered "Sim" and the conversation died. There was no friendly partner, and no Arabic help in the flow.

The new design:

- **The partner talks about herself first, then asks.** Her line is also a model the learner can copy in the answer.
- **Topics are threads, not question lists.** Each thread is: a share, an ask, and 1 follow-up on the learner's answer.
- **Every question has an answer frame with chips.** A "ساعدني أرد" button shows it, so the learner always has words to answer with.
- **The model writes only the reaction.** It reacts to the learner, recasts mistakes, and answers if the learner asked something. The next line comes from the authored thread. Result: better Portuguese, never a dead end, fewer tokens.
- **Every bubble has an Arabic translation.** Authored lines carry `ar`, and the model outputs the translation of its reaction.
- **Model: Qwen.** The existing `getChatModel()`: DeepInfra, Qwen3.5-35B-A3B, thinking off.

## Content already written (don't rewrite the Portuguese)

- `content/v2/convo/personas.pt-PT.json`: Inês, Tiago and Nour. Each has the address form (tu), who they are, facts they can tell, style, and 3 example replies with translations. The examples show the recast.
- `content/v2/convo/threads/pt-PT.<topic>.json`, 12 topics with 5 threads each:
  - casa, trabalho, bairro, transportes, ontem, amanha, ginasio, comida, compras, fim_de_semana, familia, egito.
  - **Topic fields:** id, title_tl, title_in_sentence_tl, title_ar, character_id, related, intro_eg (coach welcome), opening_tl/opening_ar (with a {name} slot).
  - **Thread fields:**
    - `share` {tl, ar};
    - `ask` {tl, ar, kind: open | either_or | yes_no, frame {tl, eg, chips[]}};
    - `follow_ups[]` {tl, ar, kind, frame, skip_if_negative?}.

If a line is wrong, report it, don't silently change it.

## Prompt to paste into Cursor

Read docs/langify-v2/09-conversations.md sections 5, 6 and 9, this file, the persona file and two thread files. Implement C1 to C10 below in order, and commit each as "conversations: free-chat v2 Cn <title>". Write the tests each step asks for. Don't change Module A (lesson conversations). At the end, run the "Done when" scenario with the real model, and paste the full prompt and raw model output of turns 1 and 5 from the dev panel.

---

## Steps

**C1 · Load and validate threads and personas.**
- Write a loader and a zod schema for both files.
- On load, the validator checks:
  - every ask and follow-up has exactly one "?";
  - shares have none;
  - every line has `ar`;
  - every frame has ≥2 chips;
  - no "você", "a sua", "o seu", or ask/follow-up lines starting with a formal verb (Mora, Gosta, Tem, Vive, Pode, Faz, Vai) for tu characters;
  - no Brazilian words (reuse the existing list).
- Free topics now come from the thread files. The `free-topics` API returns all 12, with title_tl, title_ar and character.
- Remove the old angle banks and their loader. Keep the T7.1 generation job, but switch its output to the thread schema (C10).
- Tests: all 12 files pass; a fixture with two questions in one ask fails.

**C2 · Session state for threads.**
- Free sessions store:
  - `thread_index`;
  - `step` (ask, or follow_up n);
  - `threads_done`;
  - `last_line_id`;
  - `assisted` (set when the help button was used on the current question);
  - `off_topic_streak`, `facts` (max 5) and `last_exchanges` (3, one per role per turn).
- **Next line, in code:**
  - after the learner answers an ask, go to its follow-up, unless `skip_if_negative` is set and the answer is negative (starts with não, nunca or ainda não);
  - after the last follow-up, go to the next thread's share and ask;
  - after the last thread, the bridge: "Queres falar {related.title_in_sentence_tl}?" ("Queres falar dos transportes?"). Yes switches topic, and the related topic's opening and thread 1 follow; anything else re-offers the next related topic.
  - Never a dead end.
- Tests:
  - a scripted 12-answer run walks through threads and follow-ups;
  - a negative answer skips a `skip_if_negative` follow-up;
  - the bridge switches topic.

**C3 · Opening.**
- Start shows, in this order:
  1. a coach note with `intro_eg`;
  2. **one** character bubble: opening_tl ({name} filled from the Langify user's first name via `lib/langifyRead`, or the slot and its comma removed if unknown), then thread 1's share and ask, with the combined `ar`.
- No model call.
- The header shows title_tl with title_ar under it, never the id.

**C4 · The reaction prompt (six labelled parts, 09 §5.1).**
1. **CHARACTER (static, cached):** the persona JSON for this character, verbatim, plus these rules:
   - you are chatting with an A1 learner, as a friend;
   - write ONE short reaction (at most 12 words) to what the learner just said. Show interest, agree, or make a small personal comment from your facts;
   - if the learner's Portuguese has mistakes, the reaction says back what they meant, correctly and naturally, without pointing out the mistake (see the examples);
   - if the learner asked you something, answer it from your facts in at most 2 short sentences;
   - **never ask a question.** The app adds the next line, which you can see in NEXT LINE, so don't repeat it or contradict it;
   - pt-PT only, tu form;
   - **output exactly two lines:** the Portuguese reaction, then "AR: " followed by its translation into simple Modern Standard Arabic.
2. **TOPIC (static per session, cached):** title_tl and up to 5 facts about the learner.
3. **EVENT:** one line from code, e.g. "learner answered your question about where they live", "learner's answer is negative", "learner asked you a question", "learner went off topic: {gist}", "learner used the help chips".
4. **NEXT LINE:** the authored line the app will add after the reaction (share + ask, or follow-up).
5. **LAST EXCHANGES:** 3 exchanges, Portuguese only.
6. **LEARNER JUST SAID:** the message.

- **Labels must appear in the prompt** (this was the bug that made the model lost).
- Target: about 600–900 input tokens, flat across turns.
- Tests:
  - snapshot of turn 1 and turn 10;
  - all six labels present and non-empty;
  - token difference under 10%.

**C5 · Output parsing and checks.**
- Split on the line starting "AR:".
- Checks on the reaction:
  - remove any sentence ending in "?";
  - at most 12 words, or 24 when the learner asked a question;
  - no Brazilian, English or formal forms (the F5 list);
  - the AR line exists and is Arabic script.
- Any failure → one regeneration, whose extra instruction names the exact problem.
- Second failure → drop the reaction. The bubble still has the next line, so the turn never fails.
- Tests: fixtures for each case, including a missing AR line, a question in the reaction, "a sua casa", and an AR marker split across stream chunks.

**C6 · Composing and streaming one bubble.**
- **Stream:**
  1. reaction tokens until the "AR:" marker (hide everything from the marker on);
  2. then append the authored next line immediately, in the same bubble;
  3. then send the bubble's full `ar` (reaction ar + authored ar) in a final event.
- **Exchanges:** one character exchange per turn, the reaction plus the next line.
- **No separate question bubble**, and the text is never emitted twice.
- **Audio:**
  - warm the authored lines (share, ask, follow-ups, openings) once per topic with the character's voice, like pack audio;
  - TTS the reaction on the fly;
  - play the reaction, then the authored line.
- "معناها؟" shows the bubble's `ar`. Remove any client-side or third-party translation call.

**C7 · "ساعدني أرد" (help button).**
- Under the input, always visible.
- Tapping it shows a coach NoteCard with the current question's `frame.eg` and `frame.tl`, plus the chips.
- Tapping a chip fills the input (the learner can edit, then sends).
- The turn is marked `assisted`, and the EVENT line says so.
- No model call.

**C8 · Arabic side channel in free chat (from fix-1 F7).**
- Use the real side channel (09 §6) instead of the fixed lines:
  - `arabic_answer`: the coach gives the Portuguese for what they wrote, then «جرّب تقولها». If it fits the current frame, use the frame (no model); otherwise use the coach call.
  - `language_question`: the coach call, answering in Egyptian with the Portuguese.
  - `other`: the coach offers the Portuguese version.
- The coach call also uses Qwen (`getChatModel()`), with its own small fixed prompt and a 6s timeout with a bank fallback.
- The character waits, the thread doesn't advance, and Arabic never enters the exchanges.
- Tests:
  - "ازاي أقول مع رز؟" → a coach note containing "com arroz";
  - "ساكن في أمادورا" during casa.t1 → "Moro em Amadora".

**C9 · Off-topic and the learner's questions (from fix-1 F1).**
- **Off-topic** only when the message has ≥4 content words and none relates to the topic, the current frame chips or the thread lines.
  - Short answers (sim, não, talvez, numbers, 1–3 words) are never off-topic.
  - First time: the EVENT says off-topic, and the next line is the current question again, prefixed by code with "Mas diz-me…".
  - Second time in a row: switch to the nearest topic by word overlap, with a coach note.
- **Learner questions:** a message ending in "?" or starting with "E tu" is a question to the character. The EVENT says so, and the reaction answers from the persona facts. The thread still advances.
- **Every Portuguese message is saved to the exchanges.**
- Tests:
  - "Sim", "grande", "Moro em Amadora" are on topic;
  - "I like football did you watch Benfica" is off-topic;
  - "E tu, moras onde?" is a question.

**C10 · Display, metrics, generation job.**
- **Metrics:** cached tokens only from provider usage, otherwise "n/a" (from fix-1 F9).
- **Topics screen:** the 12 topics as cards (title_tl, title_ar, character avatar).
- **Generation job:** the old angle-generation job (T7.1) becomes a thread-generation job for future topics. It outputs the thread schema, uses two authored topic files as examples, and goes through the C1 validator. Not run on the 12 authored topics.

---

## Done when

Play /talk/free/casa with the real model and send these in order:

1. *(tap ساعدني أرد, pick "Moro em Amadora.")*
2. É longe.
3. Nao meu casa é pocenuo
4. Tem dois quartos.
5. ازاي أقول مع مراتي؟
6. Moro com a minha mulher.
7. E tu? Tens animais?
8. Na sala.
9. I like football did you watch Benfica
10. Vejo televisão.
11. Não, não conheço.

Expected:
- **Opening:** the coach intro note, then one bubble ("Olá {name}! 😊 Hoje vamos falar da casa? Eu moro em Alfama… E tu, onde moras?").
- **Bubbles:** every bubble is a reaction plus exactly one question, with "معناها؟" showing a translation that matches.
- **Turn 1:** the chips appear; after sending, the reaction mentions Amadora, then the follow-up "É longe do centro?".
- **Turn 2:** the next thread (casa.t2): share, then "Como é a tua casa: grande ou pequena?".
- **Turn 3:** the reaction recasts ("Ah, a tua casa é pequena!"), then "Quantos quartos tem?".
- **Turn 5:** a coach note with "com a minha mulher"; the character doesn't answer it, and the question "E tu, com quem moras?" stays pending.
- **Turn 6:** follow-up "Há quanto tempo moras lá?".
- **Turn 7:** Inês answers about Pimenta the cat, then the thread continues to casa.t4.
- **Turn 9:** a short friendly reaction, then "Mas diz-me…" and "E o que fazes lá?" again.
- **Turn 11:** the follow-up "E no Egito, é diferente?" (not skipped, because that follow-up has no skip_if_negative).
- **Never:** "Sim" alone killing the conversation, a repeated question, two questions in one bubble, "a sua", "você", or the topic id on screen.
- **Prompt:** input about 600–900 tokens, flat across the 11 turns.
