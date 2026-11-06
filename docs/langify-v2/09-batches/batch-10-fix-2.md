# Batch 10 · Fix 2 · Broken open-mode bubble ("PTaro! … AR") and the Learn CTA

Based on Omar's run on 2026-11-06. Root causes were read from `lib/v2/convo/output/parseOpen.ts` and `runFreeTurn.ts` on `convo-impl` @ 7caf675. Batch-10 fix-1 commits weren't on GitHub at review time, so push them before this fix.

## What happened

- The learner wrote «عايز اتعلم عن الاتجاهات», and the coach suggested Learn, but with no buttons.
- The learner typed «نعم». It was treated as an Arabic answer, and the coach translated it to «Claro».
- The learner sent "Claro". Inês's bubble showed: "PTaro! Adoras cozinhar? 😋 E qual é o teu prato favorito? ARPTaro! E qual é o teu prato favorito? AR".

## Root causes

1. **`visibleOpenStreamText` leaks labels and swallows text.** The `PT:` label only gets stripped once the whole "PT:" has arrived. `onChunk` compares **lengths**, not prefixes:
   - chunk "PT" → emitted as visible text;
   - "PT: Cl" → visible becomes "Cl", the same length, so nothing is emitted;
   - "PT: Claro!" → emits `slice(2)` = "aro!". The client shows "PT" + "aro!" = **"PTaro!"**.

   A trailing "\nAR" also gets emitted before its ":" arrives, so **"AR"** is shown.
2. **Regeneration appends to the bubble.** On regenerate, `rawAcc` and `visibleAcc` reset to empty, but the client never gets told to clear. The second attempt streams after the first, so the text is duplicated.
3. **The final parsed PT never replaces the streamed text.** The client trusts whatever streamed.
4. **The Learn CTA has no buttons, and a typed «نعم» isn't read as accepting it.**

## Fixes

**G1 · A safe stream filter.**
- Hold back output until the first line's label is fully resolved (either "PT:" was stripped, or the text clearly has no label).
- Always hold back a trailing partial line that could still turn into a label: "\n", "\nA", "\nAR", "\nF", "\nH", "\nC"… plus the label and its colon.
- Emit deltas only when the new visible text **starts with** the already-emitted text. Otherwise emit a `reaction_reset` event with the full corrected text.
- Apply the same filter to the thread-mode reaction stream (the "AR:" marker).
- Tests: feed the stream one character at a time for these outputs:
  - "PT: Claro! E tu?\nAR: …\nFRAME: …";
  - "PT:Claro!" (no space);
  - a reply with no labels;
  - an "AR" word inside the Portuguese text.

  The client-visible text must equal the parsed PT at every step, with no "PT" or "AR" fragments.

**G2 · Regeneration resets the bubble.** Before a regenerate attempt, or before falling back, emit `reaction_reset` with empty text. The client clears the streaming bubble on `reaction_reset`.

**G3 · The final text wins.**
- The final bubble event carries the authoritative `pt`, `ar` and `say`.
- The client replaces the streamed text with it, and stores that in the transcript and the summary.
- The streamed text is only a preview.

**G4 · CTA buttons, and typed answers to them.**
- Do fix-1 E9 (a `cta` event, rendered as «يلا نتعلّم» / «لأ، نكمّل»).
- While a CTA is pending, the next message is checked in code before the side channel:
  - **yes:** نعم، أيوه، ايوه، آه، اه، تمام، يلا، ماشي، sim, yes, ok → follow the CTA (navigate to the Learn pack; for unmatched topics, log the request and show the note);
  - **no:** لا، لأ، no, não, nao → dismiss and continue.
- Don't translate these replies as Arabic answers.
- Tests: «نعم» after a CTA navigates; «لأ» dismisses; «نعم» with no pending CTA goes to the side channel as before.

**G5 · Learner name sanity.** Don't use account names like "admin", "test", "user", "dev", or anything with "@" or digits. Drop the slot instead. (Omar's dev account says "admin".)

**G6 · Open mode after a side-channel exchange.**
- When the learner's Portuguese message is the phrase the coach just suggested (for example "Claro" right after the coach said «Claro»), the EVENT line says "learner practised the coach's phrase: {phrase}".
- The character reacts to it in context, instead of starting an unrelated topic.

## Done when

Open mode, text:
1. «عايز اتعلم عن الاتجاهات» → the coach note plus two buttons;
2. type «لأ» → dismissed;
3. "Quero falar de comida";
4. 4 more Portuguese turns.

Expected:
- no bubble ever shows "PT", "AR" or duplicated sentences, even when a regeneration happens (force one with a test flag);
- the transcript and summary show the clean final text;
- the greeting doesn't say "admin".

Then repeat step 1 and type «نعم» → the app opens the directions Learn conversation.
