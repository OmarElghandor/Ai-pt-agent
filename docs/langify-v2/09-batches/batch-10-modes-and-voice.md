# Batch 10 · Two modes (اتكلّم / اتعلّم), no topic policing, voice-first

Run after batch 9. Decisions (Omar, 2026-11-05):

- The learner **chooses** at the start: practise speaking, or learn a topic. There is no intent classifier, and nothing guesses the intent from each message.
- **Practice:** a catalog topic (threads) or "أي حاجة" (fully open). Once a free chat starts, it stays free until the end. Nothing checks the topic of the learner's messages; the learner leaves whenever they want.
- **Learn:** the lesson conversation engine (packs, ladder, cards). A new topic requested here is logged as a request in this version (no live pack generation yet).
- **Voice-first UI**, with an icon that switches to text.
- **Calm Kit visual** is global for v2 (including free talk, learn talk, mode picker, path, cards, admin) — sage/ivory chrome; refs in `design/calm-kit/` (`05`). `.v2-free-talk` remains a session layout class that inherits shell tokens.

What stays, because it doesn't interrupt the conversation: the Arabic side channel, the recast inside the reaction, the checks on the **model's output** (pt-PT, tu, one question, translation), and the "ساعدني أرد" help.

## Prompt to paste into Cursor

Read docs/langify-v2/09-conversations.md, batch-9-free-chat-v2.md and this file. Implement D1 to D10 in order, and commit each as "conversations: modes+voice Dn <title>". Write the tests each step asks for. At the end, run the three "Done when" scenarios at 390px on a phone-sized viewport, and report anything you skipped.

---

## Steps

**D1 · Entry screen.**
- Route: /talk. Two large cards:
  - **🗣️ اتكلّم** (subtitle «اتمرّن تتكلم في أي موضوع»);
  - **📖 اتعلّم** (subtitle «افهم موضوع خطوة بخطوة»).
- Remember the last choice per user (try/catch around storage) and pre-select it, but always show both.
- Each card opens its topic picker (D2, D6).

**D2 · Practice picker.**
- A grid of the catalog topics: title_tl, title_ar, the character's avatar. Status chips come from progress where they exist.
- First card, always: **«أي حاجة 💬»** («اتكلم في أي موضوع إنت عايزه»).
- Topics with an unfinished session show «كمّل» and resume.

**D3 · Remove topic policing from practice.** Delete from free chat:
- off-topic detection and its "Mas diz-me…" bridge;
- the second-time topic switch and `nearestFreeTopic`;
- the end-of-threads bridge to a related topic;
- any classifier call on learner messages.

Keep:
- the Arabic side channel (code script detection, then the coach);
- the learner-question detection (a message ending in "?" or starting with "E tu"), because it only shapes the reaction.

Test: "I like football did you watch Benfica" inside casa gets a normal reaction plus the next authored line, and no topic change.

**D4 · Threads, then open on the same topic.**
- When a catalog topic's threads are done, the conversation continues in open mode (D5) **on the same topic**, with the session's facts. It never changes topic by itself.
- Show a small coach note once: «خلصنا أسئلة البيت 👏 كمّل كلام براحتك، أو دوس "خلّص"».

**D5 · Open mode ("أي حاجة" and after threads).**
- No thread bank. The model writes the whole turn in a fixed line format:
  1. `PT:` reaction plus exactly one question (max 20 words);
  2. `AR:` translation in simple MSA;
  3. `FRAME:` an answer frame in pt-PT with ___;
  4. `HINT:` one Egyptian line explaining the frame;
  5. `CHIPS:` 2–4 short pt-PT answers separated by " | ".
- Prompt: the same six labelled parts. The topic part says "open chat" or the topic name. The event part comes from code. NEXT LINE is replaced by "You ask the next question yourself: open or either/or, never yes/no, about what the learner just said."
- Partner choice for "أي حاجة": Inês by default; the learner can switch the partner from the header (Inês, Tiago, Nour).
- The partner may answer real questions ("Qual é a melhor praia perto de Lisboa?") briefly, in at most 2 short A1 sentences, before the question.
- Output checks on PT:
  - exactly one "?" at the end, and not a yes/no question (doesn't start with É, Tens, Gostas, Vais, Estás, Queres when it has no "ou");
  - pt-PT, tu, at most 2 words outside the known list (glossed);
  - AR is Arabic script;
  - FRAME has "___";
  - CHIPS has ≥2 entries.
- Failure → one regeneration naming the problem. Second failure → keep the PT reaction without its question, and append a question from a small fallback bank (`content/v2/convo/open-fallback.pt-PT.json`, 10 open questions with ar and frames: "Conta-me mais!", "E tu, o que achas?", "Porquê?", "E depois, o que aconteceu?"…).
- The first message in "أي حاجة" is from a template: «Olá {name}! 😊 Sobre o que queres falar hoje?», with chips from the catalog titles plus "Sobre o meu dia".
- Tests: parser fixtures (missing FRAME, a yes/no question, two questions, a markers-split stream) and the fallback path.

**D6 · Learn picker.**
- A grid of lesson conversation topics (the existing topics list for Module A packs), with their review status.
- Last card: **«موضوع جديد ✍️»** opens a text field («عايز تتعلم إيه؟»). The request is saved to `v2_topic_requests` with mode "learn", and the coach replies «سجّلنا طلبك وهنجهّزه قريب 🙏»; the learner goes back to the picker.
- No live pack generation in this batch.

**D7 · "خلّص" and the summary card (all modes).**
- A button in the header, always visible.
- The summary card shows:
  - what the learner said in Portuguese (up to 8 lines, the recast version if one exists);
  - the mistakes that were recast, each with a «ضيفها للكروت» button (default on for up to 3);
  - minutes talked;
  - in Learn: the existing result card.
- Buttons: «اتكلم عنه دلوقتي» (Learn only → opens practice on the same topic, or open mode on it if it has no thread bank) and «رجوع».

**D8 · One coach suggestion per session.** ~~Cancelled (conversations v4).~~ Free talk never offers a Learn CTA or navigates to a role-play pack; every topic request goes through the v4 router.

**D9 · Voice-first conversation screen** (all modes, Module A and C share it).
- **Default input is voice.** A large mic button sits at the bottom centre: tap to talk, tap again to send, with a live level indicator and a timer. No hold-to-talk.
- **A keyboard icon** next to the mic switches to text input (with the accent row). A mic icon in text mode switches back. Remember the choice per user (try/catch storage). The old «مش قادر أتكلم دلوقتي» becomes this toggle, and the writing-vs-speaking skill counting stays as before.
- **Character turns auto-play:** the reaction's TTS starts on its first sentence while it streams; the authored line's cached audio follows with no gap. The bubble text appears as the audio plays, with the `say` line under it and «معناها؟» on tap. A speaker icon replays it.
- **Barge-in:** tapping the mic while the character speaks stops the audio and starts recording.
- **After STT,** the learner's transcript shows as their bubble, with a small «مش ده اللي قلته» link for 3 seconds that cancels the turn and re-opens the mic. Empty or unclear STT shows the coach «ما سمعتكش كويس 🎧 قولها تاني؟», and nothing is sent.
- **Arabic by voice:** a smaller secondary button, **«اسأل بالعربي 🇪🇬»**, records with Arabic STT and sends to the side channel (coach). The main mic always uses pt-PT STT. In text mode, typed Arabic is detected as before.
- **"ساعدني أرد"** shows the frame card above the mic. In voice mode, tapping a chip shows the full sentence large, with a play button, and asks «قولها» with the mic armed. The turn is marked assisted.
- **Survival chips** stay as quick buttons above the mic: Pode repetir? · Mais devagar · Não percebi. They replay the last line (slower for Mais devagar) with no model call.
- **Hands-free auto-listen** after the character finishes is a setting, off by default.
- 390px layout: the conversation scrolls, the mic area is fixed at the bottom, and nothing overlaps the last bubble.

**D10 · Metrics and latency for voice.**
- The dev panel adds:
  - STT time;
  - time from send to first audio;
  - TTS time for the reaction.
- Target: first audio within about 2.5 s of tapping send.
- If reaction TTS is slower than its stream, play the authored line's cached audio first only when the reaction is empty; otherwise wait for the reaction. Never play the two out of order.

---

## Done when

**Scenario 1 · Practice, catalog topic, voice.** /talk → اتكلّم → «A casa».
- By voice: "Moro em Amadora". Then tap «اسأل بالعربي» and say «ازاي أقول مع مراتي». Then by voice: "Moro com a minha mulher". Then by voice, an off-topic sentence about football. Then tap the keyboard icon and type "Na sala." Then tap «خلّص».
- Expected:
  - audio auto-plays every turn;
  - the Arabic question gets a coach note and the character waits;
  - the football sentence gets a normal reaction and the casa thread continues, with no "Mas diz-me";
  - text mode works and is remembered;
  - the summary card lists the sentences said and offers the recast mistakes as cards.

**Scenario 2 · "أي حاجة", text.** /talk → اتكلّم → أي حاجة.
- Type "Quero falar de carros", then 6 more turns about cars, including one question to the partner ("Tu tens carro?").
- Expected:
  - every turn is one bubble with one open or either/or question, a translation, and a help frame with chips;
  - the partner answers the question about herself;
  - the topic is never switched;
  - no yes/no dead ends;
  - the input tokens are flat.

**Scenario 3 · Learn.** /talk → اتعلّم → «الاتجاهات» (day 18 pack).
- Play to the end, then tap «اتكلم عنه دلوقتي».
- Then /talk → اتعلّم → «موضوع جديد», and type «عايز أتعلم أعمل حساب في البنك».
- Expected:
  - the lesson conversation works by voice;
  - the button opens practice on directions (open mode if there's no thread bank);
  - the new-topic request is saved and acknowledged.
