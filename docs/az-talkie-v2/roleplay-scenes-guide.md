# Role-play scenes · The pattern and the rules (approved by Omar on 2026-11-20)

This is the standard for every role-play scene (round 1 now; rounds 2 and 3 later; other languages later). It comes from the café, which Omar approved after many test runs. Every rule below exists because we got it wrong once.

## 1. What a scene is

- **A real situation with one character and one task** (café, pharmacy, Finanças…). The learner presses one button and the character speaks first.
- **The character's words all come from the scene file:** natural, 1–3 short sentences per turn, with variants.
- **Qwen never writes a bubble.** Per learner message, Qwen does one JSON call that:
  - says which goal and option the message meant;
  - corrects the learner's sentence.
- **Arabic help questions** («ازاي أقول…؟») get one more Qwen call, grounded in the scene and checked by code, with the scene glossary as the fallback.
- **Code owns the state:** which goal we're on, what's done or skipped, hints, the end.

## 2. The shape of a turn

**The character's bubble = the reaction to what the learner said + the line that opens the next goal.**
- Example: «Um galão, saindo!» + «Pequeno ou grande?».
- A reaction is a statement. A goal line ends with a question.
- So every turn moves forward and invites the next answer.

## 3. Writing a scene (checklist)

**Goals**
- [ ] 6–12 goals, in the order things really happen. The last goal is the goodbye (`farewell`).
- [ ] **Stay inside the situation.** Every question is something this person would really ask here. Example: the barista asks size, hot or cold, sugar, water. He doesn't ask «where are you from?».
- [ ] **Add the real-life details** a resident meets: «Contribuinte?», «Precisa de saco?», «Natural ou fresca?», the system being down at Finanças, the pork in the caldo verde.
- [ ] **`only_if`** for questions that only make sense after a certain answer: size, temperature and sugar only for hot drinks; «pode ser amanhã?» only if «hoje» was refused.

**Lines**
- [ ] **`ask`** ends with «?». `unclear` ends with «?» and is a complete turn. **`react`** never ends with «?». The farewell's `ask` and `unclear` are the only exceptions.
- [ ] **No echo:** never repeat the learner's whole sentence back («o senhor quer um café e um pastel…»). Use a short natural reaction: «Boa escolha!».
- [ ] **Facts are in the lines:** prices, times, platforms are written in the file, never left to a model.
- [ ] **Check every join:** read «react + next ask» aloud. Avoid double thanks («Obrigado! … Obrigado e…»), double emoji, a reaction that answers something the learner didn't ask, and a «De nada!» before the learner said thanks.
- [ ] **Female learner:** add `tl_f` / `ar_f` wherever the character addresses the learner («Bem-vinda», «Nunca a vi»), and `suggest_f` wherever the learner says «obrigado».
- [ ] **Register:** pt-PT only; formal «o senhor / a senhora» with staff and older people; «tu» with friends. Never «você».

**Matching**
- [ ] **Each option:** 2–6 `keywords` and 1–2 `examples`.
- [ ] **A keyword must not appear naturally in answers to earlier goals**, or the learner jumps ahead by accident. Examples from our mistakes:
  - «onde» in the supermarket's "anything else" goal caught «Onde está o leite?»;
  - «cinema» in the meeting-place goal caught «Vamos ao cinema?»;
  - «lavar» caught «A máquina de lavar…»;
  - «tenho» caught «Tenho tosse».
- [ ] **Keyword typo tolerance** is 1 letter for keywords of 6+ letters, and 2 for 9+. A close-but-misspelled answer word **stops** the learner with «قصدك …؟» and the right form in context (from the current goal's options). It's accepted only on the second try, marked assisted. Missing accents pass but always get a correction card. Watch out for near-twins: «preto» / «preço» and «quarto» / «quanto» collided.
- [ ] **WEAK words** (sim, não, obrigado, está bem, ok, claro, pode, aqui tem, por favor, bom dia, boa tarde) only match the current goal. Use them freely for yes/no goals.
- [ ] Add common learner mistakes as keywords when they're unambiguous («todo» for «tudo»).

**Guidance (less is more)**
- [ ] **`opening_coach_eg`:** one Arabic line under the first bubble: where you are, who this is, what to do first. It's the only instruction at the start.
- [ ] **`coach_before_eg`:** 1–2 per scene at most, only where the learner needs a nudge («جرّب تطلب ماية») or a key word they'd otherwise miss («contribuinte = …»). Code allows one coach line per 3 bubbles; the validator reports any that would be dropped. Merge those into the opening line or remove them.
- [ ] **`hint_words`:** 1–3 Portuguese words behind 💡. Never a full sentence.
- [ ] **`suggest`:** 2 full sentences, shown **only after a mistake**.
- [ ] **`glossary`:** 10–25 Arabic → Portuguese entries for the words a learner would ask about in this scene.
- [ ] **`end_tips_eg`:** 1–2 culture tips for the end card (not in the middle of the talk).

## 4. Before shipping a scene

1. Run the validator. It checks:
   - the line endings;
   - empty Arabic;
   - «/» in lines;
   - the `only_if` references;
   - that every example and suggestion is understood at its own goal without jumping ahead;
   - the 2 suggestions and the `hint_words`;
   - the glossary size;
   - the opening coach and end tips.
2. Generate the golden run (one learner answer per goal) and read it aloud as a conversation. Fix any join that sounds robotic.
3. Check that the golden run ends with the end card, and that no coach line was dropped by spacing.
4. Add the golden run to the test fixture. CI must reproduce it word for word.

## 5. Mistakes we made, and the rule that now prevents each one

| What went wrong | The rule now |
|---|---|
| The model wrote the character's lines: drift, wrong prices, «Não obrigado? Claro!», invented words | Bubbles come only from the file; Qwen only classifies and corrects |
| The prompt and rules grew patch by patch until they contradicted each other | One clean spec per version, with exact golden tables; patches get merged, not stacked |
| Too much guidance (intro cards, a «دورك» strip, chips under every line) | One opening line, 1–2 coach lines per scene, 💡 words on demand, full sentences only after a mistake |
| No guidance at all | `opening_coach_eg` + questions that steer + help after mistakes |
| The answer was given before the learner tried | `suggest` only after a miss |
| Answers had to be exact / typos passed silently | Exact (accent-insensitive) answers pass with a correction card for missing accents; a misspelled answer word stops the learner with the right form in context |
| No correction card / a card for a comma only | The correction is its own event after the bubble; code drops punctuation-only corrections |
| Closed turns («Pronto E agora?» glued on) | Every goal line ends with a question; nothing is ever glued |
| The off-by-one (the character asked what the learner just answered) | The next goal is chosen after updating the goal states; golden tests |
| Jumping ahead by accident | Keywords can't collide with earlier answers; the validator checks |
| Off-topic small talk («where are you from?» at the café) | Questions stay inside the situation |
| Arabic help invented «Saquei» | A grounded Qwen answer, checked against the scene's words, with the glossary as fallback |
| Old sessions resumed in a new format | A format mismatch starts a fresh session |
| The wrong character (Inês in the café) | Name, avatar and voice come from the file's `character_id`; tested per scene |
