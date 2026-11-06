# Learn fix 2 · Day 33 run still breaks (Chinese text, wrong order, typo rejected)

Based on Omar's run on 2026-11-06 at 08:21. Learn-fix-1 isn't on GitHub yet (`convo-impl` is still at 7caf675), so this is diagnosed from the screenshots. Push the branch after this batch.

## What the run showed

1. **Qwen wrote Chinese inside the bubble:** «Ah, já vejo! 😊 AR: أ،،أ终于明白了！». The "AR:" line came on the **same line** as the PT, so the parser didn't split it, and nothing rejected non-Arabic and non-Latin script. The same broken reaction appeared twice.
2. **Two questions in one bubble:** «Como se chama este sítio? O metro… é na…?». The help step-1 re-ask was appended even though the previous answer was correct.
3. **The order jumps around.** After resume: the pharmacy question; then the station question; then the station open question; then the pharmacy choice **again**. The map dot stays at the station the whole time.
4. **A typo was rejected:** "Uma farácia" got «مش واصلاني، جرّب تكتبها». That's the STT message, and it's wrong for typed text. It was one letter from "farmácia". After the miss, the conversation moved to a different question instead of asking the same one again.
5. **Resume:** «Bem-vindo de volta. Então…» plus the coach note «فاصل ورجعنا — نفس الطريق». That's two lines, and both are odd.
6. **Header bidi:** «?Onde fica · فين المكان» — the question mark jumps to the wrong side.
7. **Leftover old colours:** the coral send button and the peach accent keys.

## Content change (already done, don't rewrite the Portuguese)

`content/v2/convo/pt-PT.day-33.json` now has:

- `groups[].flow`: the authored question order for each group, following the story (station → street → pharmacy, then the open questions);
- `items[].reactions_correct`: 2 short, in-character reactions with `ar` for each item;
- `reactions_near_miss`: the template "Ah, {correct}! 😊";
- `resume`: «Olá outra vez! 😊 Então…».

## Prompt to paste into Cursor

Read this file and learn-fix-1. Implement M1 to M8 in order, and commit each as "conversations: learn fix M<n> <title>", with tests. Don't change the pack's Portuguese. At the end, push the branch to GitHub.

## Steps

**M1 · Learn reactions come from the pack by default.**
- In Module A, the character's reaction is code-picked, with no model call:
  - correct → one of `reactions_correct` for the item (rotate; never the same one twice in a row);
  - near miss → `reactions_near_miss` filled with the correct surface;
  - listed mistake → its `consequence_tl`;
  - other wrong answers → "Hmm… 🤔".
- The model reaction stays behind a flag, `V2_LEARN_MODEL_REACTIONS=false` by default. Learn is pre-generated content; the AI part lives in practice. This also removes the latency on every Learn turn.

**M2 · Output guard for every model output** (practice reactions, open mode, coach):
- Split PT and AR on "AR:" wherever it appears, not only at the start of a line.
- Reject any CJK, Cyrillic or other non-Latin and non-Arabic script, anywhere.
- PT must be Latin script (emoji allowed). AR must be Arabic script.
- A failure goes to the existing single regeneration, then the fallback.
- Log the rejection reason in the dev panel.
- Tests:
  - "Ah, já vejo! 😊 AR: آه، أرى!" splits correctly;
  - "…终于明白了" is rejected;
  - an AR line in Latin script is rejected.

**M3 · Follow the authored flow.**
- If a group has `flow`, the next question is the first one in `flow` whose item still needs that rung. There's no model choice in Learn when `flow` exists.
- Candidate ranking (and model choice) is only used for packs without `flow` (old generated packs).
- Never ask a question already answered correctly in this session, unless review mode says so.

**M4 · Re-ask after a miss, only after a miss.**
- After a wrong or unclear answer, the next bubble is the **same question**: help step 1, then step 2, then step 3.
- Append the step-1 re-ask only when a miss happened, never after a correct answer.
- One question per bubble, always.

**M5 · Spelling tolerance for typed answers.**
- Before marking an answer wrong, compare the content word against the expected surface, ignoring accents and case. Allow Levenshtein distance ≤ 1, or ≤ 2 for words of 8+ letters.
- Within the tolerance → `near_miss`. It counts as correct for the rung, with the near-miss reaction and a small coach line «مظبوط 👏 بتتكتب farmácia», showing the correct spelling.
- «مش واصلاني» is only for empty or unclear **voice** input. For typed text that's still unclear, the coach says «قربت! الكلمة هي …» only after help step 2.
- Tests: "Uma farácia", "farmacia", "estaçao", "a estacão" → near_miss for their items.

**M6 · Map follows the question.**
- The dot sits at the node of the current question's `map_node`, or at the `from` of its `map_step`.
- On a correct answer about a node, the node gets a small sage check.
- On a listed mistake, the dot drifts the wrong way, as in learn-fix-1 L8.

**M7 · Resume = one bubble.**
- Reopening shows only the pack's `resume` line followed by the pending question, in one bubble (with `ar`).
- No extra coach note.
- The map is restored to the pending question's node.

**M8 · Small UI fixes.**
- Wrap every Portuguese span in the header and the coach notes in an LTR isolate, so punctuation stays with the Portuguese ("Onde fica? · فين المكان").
- The send button and the accent keys use the Calm/Kit tokens: sage send button; surface keys with a sand outline.

## Done when

Play «Onde fica?» from the start, typing:
1. "na estação" → «Isso, a estação! Já te vejo. 😊» + the street question.
2. "Uma farácia" when asked about the street → a wrong answer, not a near miss (it's a different word) → the same street question, re-asked in a simpler way.
3. "na rua" → correct.
4. "farácia" for the pharmacy question → near miss: «Ah, a farmácia! 😊» and the spelling note.
5. Leave and come back → one bubble: «Olá outra vez! 😊 Então…» + the pending question.

Never: Chinese or other foreign script, two questions in one bubble, a repeated question that was already answered, or the map dot out of sync with the question.
