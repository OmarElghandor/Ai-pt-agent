# Batch 8 · Fix 1 · Free chat does not follow the plan

> **Superseded by `batch-9-free-chat-v2.md` (on branch free-chat-v2-content). Do not run this file.**

Run observed on /talk/free/home (2026-11-04). Code reviewed on branch `convo-impl` (commit 7705ddd). Each problem below lists its root cause in the code, then the fix. Only free chat (Module C) changes. The lesson conversation (Module A) stays as it is.

## Prompt to paste into Cursor

Read docs/langify-v2/09-conversations.md sections 5, 6 and 9, and this file. Implement fixes F1 to F9 below in order, and commit each fix on its own as "conversations: free-chat fix Fn <title>". Write the tests each fix asks for. Do not touch Module A behaviour. At the end, run the "Done when" scenario with the real model, and paste the dev-panel prompt of turn 1 and turn 6.

---

## Problems and root causes

1. **"Sim", "Não", "grande" are treated as off-topic.**
   - **Cause:** `isOffTopic` (lib/v2/convo/free/offTopic.ts) marks any message with no word from the topic's word set as off-topic. Short answers have none.
   - **Effect:**
     - the learner's message is not saved to `last_exchanges`;
     - the angle doesn't advance;
     - the current angle is re-asked.

   This is why the same question repeats.
2. **The model doesn't know what each part of the prompt is.**
   - **Cause:** in `runFreeConvoTurn`, the user prompt is joined with headers made only of the number (`### 3`, `### 4`…). The labels in `buildConvoPrompt` are dropped. So the model sees two angle questions with ids and the learner's text, without knowing which is which.
   - **Effect:** it merges or repeats questions ("A tua casa tem janela? Vives com vizinho?") and doesn't react to the learner.
3. **Free rules are too thin.** `FREE_CONVO_CHARACTER_RULES` (about 70 words) is missing:
   - who the character is;
   - the address form;
   - "react first, then ask one question";
   - the recast rule;
   - "never repeat a question from the conversation".
4. **Two angles are offered as candidates** (current and next) with no instruction about which to ask, so the model asks both.
5. **Angle bank is formal, while Inês uses tu.**
   - Every angle in content/v2/convo/angles/*.json uses the formal form: "Mora…", "A sua casa…", "Gosta da sua…". The model replies with "a tua", so the conversation mixes forms.
   - Most angles are yes/no questions.
6. **Arabic in free chat gets no real help.**
   - **Cause:** `runFreeConvoTurn` answers every `arabic_answer`, `other` and `language_question` with a fixed line («قولها بالبرتغالي، جرّب» or «سؤال حلو — خلّينا نكمل بالبرتغالي»). It never gives the Portuguese, and it never calls the T3.3 coach.
   - The plan's key selling point (ask in Arabic mid-chat) is missing in free chat.
7. **Character exchanges are pushed twice.** The reaction and the appended angle are pushed as two separate character exchanges. With slice(-3), the learner's own line drops out of the window after one turn.
8. **Display and opener:**
   - the header shows the topic id ("home") because `setTitle(data.topic_id)`;
   - the opener is "Olá! Vamos falar de Casa?" (capital C, no article), followed by a separate angle bubble;
   - the resume template is "Falávamos de Casa".
9. **Metrics are estimates.** `cached_input_tokens` comes from a chars/4 estimate in streamModel.ts, not from the provider, so the 111 cached figure is not real. Input is about 236 tokens because parts 1–2 are thin (see 3).

---

## Fixes

**F1 · Off-topic only for real off-topic messages.**
- A message is off-topic only if:
  - it has **at least 4 content words**; and
  - none of them are in the topic word set, the current angle's hints or the suggested words; and
  - it is not a yes/no or one-word answer.
- Short answers (sim, não, talvez, numbers, one or two words) are always on-topic.
- Always save the learner's Portuguese message to the exchanges, on-topic or not.
- Tests:
  - "Sim", "Não", "grande", "Nao meu casa é pocenuo" are on-topic for home;
  - "I like football did you watch Benfica" is off-topic;
  - "Gosto de futebol e do Benfica" is off-topic for home.

**F2 · Labelled prompt parts.** The user prompt must keep the labels, as `buildConvoPrompt.assembled` does:
- EVENT;
- ASK NEXT;
- LAST EXCHANGES;
- LEARNER JUST SAID.

Test: the free-turn prompt contains all six labels in order and no empty part.

**F3 · One angle, not two.**
- Pass only the current angle, as "ASK NEXT (one question, rephrase freely to follow the conversation): …".
- The next angle stays in code.

**F4 · Free character rules (static part 1).** Rewrite `FREE_CONVO_CHARACTER_RULES` in about 250–350 words. It must include:
- the character's name, age, job and city (from characters.json);
- the address form, with examples (tu: "a tua casa", "moras", "gostas");
- this order for every reply:
  1. react to what the learner just said in one short sentence (agree, show interest, or a small personal comment);
  2. ask exactly one question, based on ASK NEXT;
- **recast:** if the learner's Portuguese has mistakes, the reaction says back what they meant, correctly and naturally, without pointing out the mistake. Examples:
  - "Nao meu casa é pocenuo" → "Ah, a tua casa é pequena!";
  - "eu gosto comer" → "Gostas de comer, que bom!";
- never repeat a question already in LAST EXCHANGES;
- A1 words, at most 16 words in total, pt-PT only;
- if EVENT says off-topic: one short friendly sentence about it, then bridge back with "Mas diz-me…" and the ASK NEXT question.

This part is static, so it adds no per-turn growth.

**F5 · Address form per character.**
- Add `address` to each cast member in characters.json:
  - tu: ines, nour, tiago, sofia;
  - formal (o senhor / a senhora + 3rd person): graca, manuel, carlos, rita.
- Free topics use their character's form.
- Post-check: in a tu character's reply, any of these triggers the single regeneration, with the reason "use tu: a tua, moras":
  - "a sua", "o seu", "você";
  - a sentence starting with a formal 3rd-person verb aimed at the learner (Mora, Gosta, Tem, Vive, Pode).

**F6 · Rewrite the angle banks** (all six files, in the topic character's form).
- One question per angle.
- At most 1 in 3 are yes/no. The rest are:
  - either/or with known words ("A tua casa é grande ou pequena?");
  - open and simple ("Como é a tua casa?", "Quantos quartos tem a tua casa?").
- Each angle has 2–4 `answer_words`.
- Add a check that runs on load and drops angles that break these rules.

**F7 · Arabic in free chat uses the real side channel (09 §6).**
- `arabic_answer`: the coach gives the Portuguese for what they wrote, then "جرّب تقولها". Use the item card if it matches a known item, otherwise the T3.3 coach call. The character waits, and the angle doesn't advance.
- `language_question`: the T3.3 coach call, which answers in Egyptian with the Portuguese phrase.
- `other`: the coach offers the Portuguese version.
- Arabic never enters the exchanges.
- Test: "ازاي أقول مع رز؟" returns a coach note containing "com arroz".

**F8 · One character exchange per turn.**
- Store the character's reply (reaction plus question) as a single exchange.
- When code appends an angle because the reply had no question, append it to the same exchange and the same bubble.
- The client shows one bubble per character turn.
- Never emit the reply twice (as reaction_delta and again as question). If the reply already has the question, the `question` event carries only the id and the audio key, with no tl.

**F9 · Display, opener, resume, metrics.**
- Header: `title_tl` with `title_ar` under it, never the id.
- Topic titles get the article in sentences ("da casa", "da comida", "do trabalho"). Add `title_in_sentence_tl` to free-topics.
- Opener: one bubble with the greeting and angle 1, for example "Olá! Vamos falar da casa? Como é a tua casa?".
- Resume: "Olá outra vez! Estávamos a falar da casa…" plus the pending angle, in the character's form.
- Metrics: report `cached_input_tokens` only from the provider's usage. When the provider gives nothing, show "n/a" instead of an estimate.

---

## Done when

Play /talk/free/home with the real model, sending these in order:

1. Nao meu casa é pocenuo
2. Sim
3. grande
4. ازاي أقول جيران؟
5. Tenho vizinhos simpáticos
6. I like football did you watch Benfica
7. Gosto de futebol
8. talvez
9. A minha cozinha é pequena
10. Sim

Expected:
- **Turn 1:** the reply starts with a recast like "Ah, a tua casa é pequena!".
- **Every reply:** one bubble with a reaction and exactly one question, and no question repeated across the 10 turns.
- **Turns 2, 3, 8 and 10:** "Sim", "grande", "talvez" are not treated as off-topic, and the angle advances.
- **Turn 4:** a coach note with "vizinhos"; the character does not answer it.
- **Turn 6:** a friendly one-line bridge back ("Mas diz-me…").
- **Address:** never "a sua", "Mora" or "você" from Inês.
- **Header:** "a casa" with "البيت" under it.
- **Prompt:** labelled, input about 600–900 tokens, flat across turns (±10%).
