# Corrections · Show a gentle correction hint under the learner's message

Run on 2026-11-06, /talk/free/ginasio. The learner wrote «eu Prefero noite». Tiago replied «À noite, como eu! Porquê?». That's a partial recast that silently fixes «noite» → «à noite», but «Prefero» (should be «Prefiro») is never shown. Omar wants a visible hint, mixed Arabic and Portuguese, whenever the learner writes or says something wrong.

The same run also showed a rendering bug: the coach note printed raw `**` and broke the order of the Arabic and Portuguese text («زي ما Tiago قال: **Eu vou…** — جرّب تقولها»).

## Decisions

- **The conversation never stops for a correction.** The character still replies normally (with a recast). The correction shows **under the learner's own bubble**, as a small note.
- **One main error per message.** The full corrected sentence is shown, but only the most important error is explained.
- **Errors that get a correction:** wrong conjugation, gender or agreement, a missing or wrong preposition or article, a wrong word, Brazilian forms, word order that changes meaning.
- **Errors that get a light hint only:** a missing accent («انتبه للعلامة: **à**»).
- **Ignored:** capitalisation, missing final punctuation, digits instead of words.
- The correction comes from an **async call after the reply starts**, so it never slows the character's answer. It appears within about 1–2 s.

## Prompt to paste into Cursor

Read this file, docs/langify-v2/00-decisions.md §8–§9 (grader, error taxonomy) and lib/v2/grader. Implement K1 to K6 in order, and commit each as "conversations: corrections K<n> <title>", with tests. Push the branch at the end.

## Steps

**K1 · Correction call (reuse the grader module).**
- Add a "free text" mode to `lib/v2/grader`, using the configured grader model (Claude Haiku per 00 §9, or `V2_GRADER_MODEL`).
- Non-streamed JSON, 6 s timeout.
- **Input:**
  - the learner's Portuguese message;
  - the character's last line (for context);
  - the current frame, if there is one;
  - the learner's level (A1).
- **Output:**
  - `has_error` (bool);
  - `severity`: none | accent | error;
  - `corrected_tl`: the full sentence, pt-PT, with the smallest change that makes it correct and natural;
  - `changes`: up to 3 entries of {from, to};
  - `main_error`: {from, to, type, using the 00 §8 taxonomy};
  - `note_eg`: one short Egyptian line explaining the main error, with Portuguese words wrapped as segments, e.g. «بنقول **prefiro** مش prefero — من الفعل preferir»;
  - `ar`: the translation of corrected_tl.
- **Validation:**
  - Portuguese fields are Latin script, Arabic fields are Arabic script, nothing else (the M2 script guard);
  - `corrected_tl` differs from the original after normalisation (otherwise has_error=false);
  - pt-PT word list check.

  One retry, then no correction (never a wrong correction).
- Tests with these inputs:
  - «eu Prefero noite» → corrected «Eu prefiro à noite.», main error prefero → prefiro;
  - «Eu vou ao ginásio 3 vezes por semana» → no error;
  - «Eu gosto comer koshari» → «Eu gosto de comer koshari.»;
  - «Nao meu casa é pocenuo» → «Não, a minha casa é pequena.»;
  - «a minha casa é pequeno» → agreement;
  - «Eu vai trabalhar» → conjugation;
  - «Voce mora onde?» → Brazilian → «Onde moras?».

**K2 · Fire it after every Portuguese learner message**, in practice (threads and open mode) and in Learn open questions.
- It runs in parallel with the character reply and never blocks it.
- Skipped for: chips sent unchanged, survival buttons, Arabic or English (the side channel), and messages under 2 words that match an accepted form.
- The result is sent as a stream event `{type: 'correction', learner_turn_id, ...}`, or polled if the stream already closed.

**K3 · The correction UI under the learner's bubble.**
- A small attached card under the learner's sage bubble, on a pale sand surface, with a pen icon:
  - **line 1:** the corrected sentence in Newsreader, LTR, with the changed words underlined in sage and bold. The original words appear faint and struck through just before them («~~Prefero~~ **prefiro** · **à** noite»);
  - **line 2:** `note_eg` in Arabic, with the Portuguese words in LTR isolates;
  - a play button for corrected_tl, and «ضيفها للكروت».
- **Accent-only:** a single compact line «انتبه للعلامة: **à**».
- The first 3 corrections of a session are expanded. After that, they collapse to a chip «✏️ تصحيح» that expands on tap.
- No red. Use muted ochre for the struck-through text.

**K4 · Learn mode.**
- For closed or choice answers, the existing near-miss / M5 logic stays.
- For open questions where the answer is accepted but the surrounding sentence has an error (e.g. «Eu fico na estação» for «Onde estás?»), show the same correction card under the bubble.
- The answer still counts as correct if the target item was right.

**K5 · Store and reuse.**
- Every correction with severity=error goes to `v2_errors` (append-only, with the main_error type), linked to the item ids when the corrected sentence contains a known item.
- The summary card's «اتصلّحت وإنت بتتكلم» list uses these.
- «ضيفها للكروت» creates a card from corrected_tl, with its ar.

**K6 · Fix coach note rendering.**
- Coach notes must not carry markdown.
- Change the coach payload to structured segments, `[{type:'eg', text}, {type:'tl', text}]`, or reuse the existing rt rules.
- Render the tl segments bold, in LTR isolates (`<bdi dir="ltr">`), with their own play button.
- Migrate the S3, coach-call and frame-fallback messages to this format.
- Test: «زي ما Tiago قال: Eu vou ao ginásio três vezes por semana. — جرّب تقولها» renders in the right order, with no `**`.

## Done when

In /talk/free/ginasio:
1. Send «eu Prefero noite» → Tiago replies as usual. Within about 2 s, under your bubble: «~~Prefero~~ **prefiro** · **à** noite» and «بنقول prefiro مش prefero — من الفعل preferir», with play and «ضيفها للكروت».
2. Send «Eu vou ao ginásio 3 vezes por semana» → no correction.
3. Send «Eu gosto comer frango» → a correction for «gosto de».
4. Tap «خلّص» → the summary lists the corrections.
5. The coach note from the side channel shows the Portuguese bold, in the right order, with no asterisks.
