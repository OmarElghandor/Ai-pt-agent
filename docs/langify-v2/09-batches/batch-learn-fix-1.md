# Learn fix 1 · The Learn conversation (Module A) is wrong at the source

Reviewed on 2026-11-06: Omar's run of «اتعلّم → الاتجاهات», plus `convo-impl` @ 7caf675.

## What went wrong, and why

1. **The pack is stale and was written by Cursor.** `content/v2/convo/pt-PT.day-18.json` was supposed to be hand-written by Omar and Claude (T1.2), but Cursor wrote it.
   - Day 18 is now «A Casa» (house words). Directions moved to **days 33–34** in the 109-day plan.
   - So the pack's items, its map and the lesson don't match.
   - Its questions have no context: "Farmácia ou estação?" with the answer fixed as farmácia, and nothing in the scene says why. The learner's "a estação" was marked wrong.
   - The map steps point to the wrong items (`step_home` → word.station). Some lines are odd ("A via?", "remédio").
2. **The topics file is hard-coded** (`topics.pt-PT.json`): directions → pt-PT.day-18. It isn't derived from the curriculum.
3. **Module A character rules have no persona and no scene,** and nothing stops the character from giving the answer. After the miss, Inês said "A estação está à direita. Vai em frente.": words not taught yet, and no question, so the conversation stopped.
4. **Flow:**
   - at group start, 3 cards and then 3 separate coach notes are dumped before anything else;
   - the opening and the first question come as two separate bubbles ("Olá! Estás a procurar a estação?", then "Farmácia ou estação?");
   - after a miss, the re-ask (help step 1) wasn't appended.
5. **UI:**
   - the header shows "pt-PT.day-18";
   - the "map" is a row of word pills, not a map;
   - the screen still uses the old coral and mustard colours, not Calm/Kit;
   - there's no pronunciation line on the question bubbles.

## New content (already written; don't rewrite the Portuguese)

`content/v2/convo/pt-PT.day-33.json` is the hand-written reference pack for day 33 («Primeira Viagem a Portugal»):
- 9 core items in 3 groups;
- Inês lost after leaving the metro, sharing her location;
- the learner sees her on the map and names the places, then tells her right or left and near or far;
- then the roles flip and the learner asks «Onde fica…?»;
- every question has a context the learner can see on the map;
- every line has an Arabic translation;
- mistakes have in-story consequences.

It adds optional fields that the schema doesn't have yet (L2).

## Prompt to paste into Cursor

Read this file, docs/langify-v2/09-conversations.md §3–§5 and §7, and content/v2/convo/pt-PT.day-33.json. Implement L1 to L9 in order, and commit each as "conversations: learn fix L<n> <title>", with tests. Don't change the Portuguese in the pack. At the end, play «اتعلّم → الاتجاهات» to the end and report.

## Steps

**L1 · Remove the stale pack, map topics to real days.**
- Delete `pt-PT.day-18.json` and any stored `v2_convo_packs` for day 18 that came from it.
- In `topics.pt-PT.json`, directions → two topics:
  - «Onde fica? · فين المكان» (day 33, pack pt-PT.day-33, ines);
  - «Vire à esquerda · لف شمال» (day 34, generated later).
- Check every topic's `day` against `content/v2/plan/pt-PT.core-items.json`: the pack's item ids must equal that day's core items.
- Add a test that fails on any mismatch. (Batch 11 will generate this file from the curriculum. For now, just make it correct.)

**L2 · Schema additions (all optional, backward compatible).**
- `ar` on: choice questions, open questions, `step1_reask_tl` (as `step1_reask_ar`), opening, closing, bridge, recap questions, and the recap `intro_tl` / `intro_ar`.
- `map_node` on choice and open questions, besides the existing `map_step`.
- On map nodes: `x`, `y` (0–100), `kind` (place | home | far_place) and `item_id`. On route steps: `arrow` (left | right | straight).
- On groups: `intro_eg` (one coach line that introduces the whole group).
- The validator also checks:
  - every `map_node` and `map_step` exists;
  - `correct_id` is consistent with the map: a choice question tied to a node must have that node's item as the correct answer (for place questions);
  - no group mixes items from different days unless they're listed as recycled.

**L3 · Group start = one coach card.**
When a group starts, show **one** coach card with:
- the group's `intro_eg`;
- the group's items as a compact horizontal row of mini cards (glyph or image, tl, say, play), not one full card per item;
- the items' `coach_intro_eg` lines inside each mini card, behind a tap («إزاي أفتكرها؟»), not as separate notes.

Then the character's line. Nothing else is stacked.

**L4 · One character bubble per turn.**
- The opening, plus the first group's first question, is one bubble.
- Every later character turn is: reaction (model) + the next question (code), in **one** bubble.
- No reaction-only bubbles followed by a separate question bubble.

**L5 · Module A character rules (static part).**
- Add the persona JSON (from personas.pt-PT.json) and the pack's scene + information gap.
- Add these rules:
  - **never give the answer to the current question;**
  - never use target items that haven't been taught yet (the code passes the list of taught items in the EVENT part);
  - after a mistake, react with the mistake's `consequence_tl` idea, in character;
  - after a correct answer, a short natural reaction ("Isso!", "Ah, já vejo!") tied to the story;
  - at most 8 words; never a question (code appends it);
  - output the PT line, then "AR:" with the translation, using the same safe stream filter as batch 10 fix 2 (G1).
- Post-check: if the reaction contains the correct answer's surface, or any untaught target item, regenerate once; if it fails again, drop the reaction.

**L6 · After a miss, always ask again.**
- Code appends the help-ladder line for the same question in the same bubble: step 1 re-ask (with its `ar`), then step 2 coach hint, then step 3 choices.
- If a mistake matches `common_mistakes`, the map shows the consequence (Inês's dot moves the wrong way), and the coach note is the mistake's `coach_note_eg`, not a generic «حاول تاني، ركّز في الاتجاه».

**L7 · Grading uses the question's context.**
- For choice questions, accept the option the learner typed or tapped, by surface (with or without the article: "estação", "a estação", "na estação").
- Correct means equal to `correct_id`.
- Add tests with the day 33 pack for every choice and open question, including "na rua", "À direita!", "é perto", "Onde fica a farmácia?".

**L8 · A real map.**
- Render the nodes at their `x` / `y` on a simple illustrated-style street, using Calm/Kit colours:
  - sage for the route and the Inês dot;
  - moss for highlights;
  - a muted ochre dot for a wrong-way move.
- The question's `map_node` pulses; its `map_step` shows the arrow.
- The dot moves when a step is answered correctly, and moves the wrong way on a listed mistake.
- The map is hidden during the recap.
- It's pinned at the top and collapses to a 120px strip when scrolling.

**L9 · Header, colours, pronunciation.**
- Header: Inês's avatar + name, and «Onde fica? · فين المكان» with the group progress dots. Never the pack id.
- Move TalkSession and the Module A components to the Calm/Kit tokens: no coral or mustard; coach notes use the coach-note style.
- Every character bubble has the `say` line (computed by code for model text) and «معناها؟» with the `ar`.

## Done when

Play «اتعلّم → Onde fica?»:
1. **Group 1:** one coach card with 3 mini cards, then one bubble: "Olá! 😊 Já saí do metro, mas estou perdida! Vês-me no mapa? … Estou na estação ou na rua?" with the station node pulsing.
2. Answer "na estação" → correct. A short reaction and the next question, in one bubble.
3. At the farmácia step, answer "à direita" on purpose → Inês's dot moves the wrong way, she says something like "Fui para a direita… mas não vejo a tua casa! 🤔", the coach shows the mistake's note, and the same question is asked again.
4. Finish the recap with the map hidden → the result card.

Never:
- the character giving the answer;
- a bubble without a question (except the closing);
- the pack id on screen;
- coral or mustard colours.
