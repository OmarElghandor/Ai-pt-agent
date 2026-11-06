# Side channel fix · "How do I say…" in Arabic or English gets no real help

Run on 2026-11-06, /talk/free/ginasio, with Tiago. The relevant code is on `convo-impl` @ 7caf675.

## What happened

1. «ازاي اقول بتمرن ٣ مرات?» → the coach answered with the generic fallback «جرّب تقولها بالبرتغالي — لو مش متأكد، اسأل تاني بجملة أقصر». That's useless.
   - **Cause 1:** `LANGUAGE_QUESTION_RE` (sideChannel/classify.ts) only matches «ازاي أقول» with hamza. «ازاي اقول» falls through, so the message isn't treated as a language question.
   - **Cause 2:** the coach call runs on Qwen with a 4 s timeout. On a timeout, an empty reply or a failed check, it returns the generic line, even when the answer is right there in the conversation: Tiago had just said «Eu vou ao ginásio três vezes por semana».
2. «how i can say i train 3 times in week?» (English) → it went to **Tiago as if it were Portuguese**. He replied «Vou ao ginásio três vezes por semana. 💪 Quantas vezes por semana?», and the thread moved to the follow-up, even though the learner never answered «E tu, fazes desporto?».
   - **Cause:** the side channel only detects Arabic script. English isn't detected.

## Prompt to paste into Cursor

Read this file and docs/langify-v2/09-conversations.md §6. Implement S1 to S6 in order, and commit each as "conversations: side channel S<n> <title>", with the tests listed. Don't change content Portuguese. Push the branch at the end.

## Steps

**S1 · Normalise Arabic before every side-channel regex.**
- Use one shared `normalizeAr`:
  - أ إ آ → ا;
  - ى → ي;
  - ة → ه;
  - strip tashkeel and tatweel;
  - Arabic-Indic digits → Latin digits;
  - both «?» and «؟».
- Apply it in classify.ts, topicRequest.ts and the CTA yes/no matcher.
- Widen the language-question patterns: ازاي / ازاى / إزاي / كيف + اقول / نقول / بيقولوا / بقول; «يعني ايه»; «معنى»; «ترجمة»; «بالبرتغالي ايه»; «قولي … بالبرتغالي».
- Tests: «ازاي اقول بتمرن ٣ مرات?», «إزاي أقول…», «يعني ايه semana», «بالبرتغالي ايه جيم» → language_question.

**S2 · English goes to the side channel too.**
- A message is English when it's Latin script with ≥2 English function words (i, you, how, what, can, say, the, is, do, my, in, to, mean, word…) and it has fewer Portuguese function words than English ones.
- Classify it like Arabic: «how do I say / what does X mean» → `language_question`, anything else → `other`.
- English never goes to the character, never advances the thread, and never enters the exchanges.
- Tests:
  - "how i can say i train 3 times in week?" → language_question;
  - "what does semana mean" → language_question;
  - "I like football" → other;
  - "Eu treino três vezes" → normal Portuguese;
  - "ok" and "sim" → normal.

**S3 · Answer from the conversation first (no model).**
- Before calling the coach model, search the current context for a Portuguese line the learner is asking for:
  - the current thread's share, ask and follow-ups (they have `ar`);
  - the last 3 character lines (they have `ar`);
  - the current frame and chips;
  - in Learn, the pack items.
- Match the learner's normalised Arabic or English against each line's `ar` and English gloss, using token overlap with a small synonym list:
  - بتمرن / اتمرن / train → treino, ginásio;
  - مرات / times → vezes;
  - اسبوع / week → semana;
  - numbers → um, dois, três….
- On a confident match, the coach says: «زي ما Tiago قال: **Vou ao ginásio três vezes por semana.** — جرّب تقولها», with a play button for the Portuguese.
- Tests: the run above returns that line without a model call.

**S4 · Make the coach model call reliable.**
- Timeout 6 s, as decided in batch 9 C8. The model comes from `V2_COACH_MODEL` (default: the current chat model).
- Send it the context from S3 (the current lines with ar, frame and chips), so it reuses the conversation's own phrases.
- Validate the output (batch 10 fix 1 E2, plus batch learn-fix-2 M2's script guard): Arabic script + a Portuguese segment, and no other scripts. On failure, retry once.

**S5 · Fallback order (the generic line is the last resort).**
1. S3 context match.
2. Coach model (S4).
3. The current frame: «تقدر تقول: **{frame.tl}**», with the chips shown.
4. Only then the generic line, and it must be helpful: «مش متأكد من الجملة دي 🙏 دوس "ساعدني أرد" أو اكتبها بطريقة تانية».

**S6 · The character waits during side-channel turns.**
- While the side channel handles a message (Arabic, English, CTA), the thread pointer, the pending question and the help state don't change.
- After the coach note, the pending question stays visible.
- If the learner then says the coach's phrase, that's the G6 "practised the coach's phrase" event.

## Done when

In /talk/free/ginasio with Tiago:
1. «ازاي اقول بتمرن ٣ مرات?» → a coach note with «Vou ao ginásio três vezes por semana.» (or «Treino três vezes por semana.»), and Tiago is still waiting on «E tu, fazes desporto?».
2. «how i can say i train 3 times in week?» → the same coach help; nothing goes to Tiago and the thread doesn't move.
3. «Vou ao ginásio três vezes por semana.» → Tiago reacts to it (the practised coach phrase), then the follow-up.
4. With the coach model forced to time out, steps 1–2 still give the S3 answer, never the generic line.
