# Role-play v3 · The café first: authored conversation, Qwen understands and corrects

Decided by Omar on 2026-11-18. **This replaces how a scene turn is built** in batch-rp-2.

Kept from batch-rp-2:
- the entry button;
- the mission strip;
- the end card;
- the scene-out-of-free-talk rule;
- Step B matching (WEAK words, jump ahead, farewell only when current, the one-typo tolerance of 8.2).

Everything else about how the character's bubble is made is replaced by this file. If something here is unclear, **stop and ask Omar**.

## Why

The character's words now come **only from the scene file** (authored, natural, with variants). **Qwen never writes text that appears in a character bubble.** Qwen does two things it's good at:
- understanding what the learner meant;
- correcting the learner's sentence.

## Scope of this pass

- **Only `cena-cafe`**, in the new format (`format: 3`).
- `content/v2/convo/scenes/pt-PT.index.json` lists **only the café** for now. The other 14 bank files stay in the repo, untouched, out of the path.
- The free-talk engine is used as today for loading, session, mission strip and end card. Only the scene turn changes.

## The file format (`format: 3`)

**Top level:**
- `id`, `kind: "scene"`, `format: 3`, `title_tl`, `title_ar`, `emoji`, `recommended_day`;
- `mission_eg`: the mission strip text;
- `character_id`, `address`;
- `opening[]`: the first character bubble;
- `global`:
  - `greeting` {keywords, react[]};
  - `thanks` {keywords, react[]};
  - `side_unknown` {react[]};
- `goals[]`, in order;
- `closing[]`.

**Each goal:**
- `id`, `label_eg` (checklist);
- `ask[]`: the character's line(s) that open this goal. They are variants; each ends with a question or an invitation;
- `options[]`: each has {value, keywords[], examples[], react[]}. `react[]` = what the character says when the learner picks this option; reacts are statements, never questions;
- `unclear[]`: a complete character turn for when the learner's message isn't understood (it ends with a question);
- `suggest[]` (+ optional `suggest_f[]`): the 2 suggestion chips;
- `hint_eg`: the Egyptian hint;
- `farewell: true` on the last goal.

**Lines:** every line is {tl, ar}.

**Variants:** for each `ask[]` and each `react[]`, keep a counter per session. The first use takes [0], the next takes [1], then it wraps around.

## The screen (changes only)

1. **Under every character bubble:** the Arabic (`ar`) is **always visible**, in small grey text. It's no longer hidden behind a tap.
2. **Under the latest character bubble:** a row «ممكن تقول:» + the current goal's 2 `suggest` chips (`suggest_f` for a female learner). Tapping a chip puts it in the input; the learner sends it. The row moves to the newest bubble every turn.
3. **The correction card** under the learner's bubble whenever Qwen says `has_error: true`: the corrected sentence + `note_eg`.
4. **The hint card** (coach) only for «مش عارف» / «ساعدني», or on the second miss of a goal: `hint_eg`.
5. Unchanged: the mission strip; one character bubble per turn; the typing pacing; one audio per bubble.

## One learner turn

**Step 1 · The type of message (code).**
- An Arabic or English language question → the existing coach side channel. No character bubble.
- «مش عارف» / «ساعدني» / empty STT → the hint card (`hint_eg`). No character bubble. It doesn't count as a miss.
- A repeat request («Pode repetir?», «Mais devagar», «Não percebi», «مش فاهم», «تاني») → replay the last character bubble, TTS rate 0.85.
- Anything else → Step 2.

**Step 2 · Start the Qwen call (in parallel) and run code matching.**
- The Qwen call (below) starts at once, for every Step 2 message. It's needed for the correction card anyway.
- Code matching = batch-rp-2 Step B, on the goals' `options[].keywords` and `options[].examples`. The first matching option of a goal wins. The result is `DONE(goal, option)` or nothing.

**Step 3 · Decide.** Take the first rule that applies:

| # | Condition | Character bubble | State |
|---|---|---|---|
| 1 | Code matched the farewell goal | `closing`, then the end card | finished |
| 2 | Code matched a goal | option `react` + « » + the next open goal's `ask` | matched goal done (gaps skipped) |
| 3 | No code match, and the message contains a `global.greeting` keyword | greeting `react` + « » + the current goal's `ask` | no change |
| 4 | No code match, and the message contains a `global.thanks` keyword (farewell isn't current) | thanks `react` + « » + the current goal's `ask` | no change |
| 5 | No code match → wait for Qwen. Qwen returns a goal + option that pass validation | the same as rule 2 (or rule 1 if it's farewell and farewell is current) | the same |
| 6 | Qwen says `side_question` | `side_unknown` react + « » + the current goal's `ask` | no change |
| 7 | Otherwise (Qwen says `other`, or it failed / timed out) | the current goal's `unclear` | misses +1; on the 2nd miss also show the hint card; on the 3rd miss the hint card shows `suggest[0]` as the full sentence and the goal is marked assisted when the learner sends anything |

**Nothing else is ever added to a bubble.**

**Step 4 · The correction card.** When the Qwen result arrives with `has_error: true`, show it under the learner's bubble. It can arrive after the character bubble; that's fine.

## The Qwen call (JSON only, never shown as a bubble)

- **Model:** `getChatModel()` (Qwen), temperature 0, max tokens 150, timeout 4 s, JSON mode if the provider supports it.
- **System:** «You read one message from a beginner learner of European Portuguese in a role-play. Return JSON only.»
- **Input:**
  - the character's last line;
  - the learner's message;
  - the candidate goals: the current goal + the next 2 non-farewell goals (+ farewell only if it's current), each with its options (value + examples).
- **Output:**
  `{"kind": "answer" | "side_question" | "other", "goal": "<id or null>", "option": "<value or null>", "corrected": "<the learner's sentence with ALL mistakes fixed, pt-PT>", "has_error": true/false, "note_eg": "<one short Egyptian Arabic line naming the main fix, or empty>"}`
- **Rules given to Qwen:**
  - fix every mistake (spelling, accents, missing or wrong words), and keep the learner's words where they are correct;
  - when the learner's meaning matches an example, prefer the example's wording (quero → queria);
  - `has_error` is false if the only differences are capital letters or final punctuation.
- **Validation (code):**
  - `goal` must be one of the candidates and `option` one of its values; otherwise treat it as no match;
  - invalid JSON or a timeout → no correction card, and the matching result is «no match».

## Remove from the scene path

Remove the model reaction text, the reaction guards, the opener strip, the `GOAL:` line parsing, and any streaming of model text into a scene bubble.

## Acceptance

**Test G1: the golden café run** (Qwen stubbed with `has_error: false`, `kind: "other"`). Each line must match **exactly**:

| Learner | Character bubble |
|---|---|
| (start) | Bom dia! 😊 Então, o que vai ser hoje? |
| Bom dia | Bom dia, bom dia! Está frio hoje, hã? ☕ O que lhe sirvo? |
| quero um cafe | Um café, saindo! Os pastéis de nata acabaram de sair do forno. 😋 Quer um para acompanhar? |
| um pastel de nata | Boa escolha! É para comer aqui ou para levar? |
| Comer para aqui. | Então sente-se à vontade. 😊 Com açúcar ou sem açúcar? |
| sem açúcar | Sem açúcar, muito bem. É a primeira vez que vem cá? Nunca o vi por aqui! 😊 |
| sim, moro aqui perto | Ah, então somos vizinhos! E de onde é? |
| sou do Egito | Do Egito! Que bom! Adoro as pirâmides. 😍 Aqui está! 😊 Mais alguma coisa, ou é tudo? |
| a tudo, e quenta? | É tudo, então! São dois euros e sessenta. Cartão ou dinheiro? |
| Cartão | Com cartão, sem problema. Pode passar aqui. 💳 Quer fatura com contribuinte? |
| Nao obrigado | Muito bem. Obrigado e bom dia! Até amanhã? 😊 |
| até amanhã! | Até amanhã! 👋 → end card |

**Other tests** (stub):
- **G2:** «xyz» at order_drink → «Desculpe, não percebi… Um café? Um galão? 😊»; a second «xyz» → the same + the hint card.
- **G3:** «مش عارف» → the hint card only, no character bubble, no miss.
- **G4:** «Quanto é?» at order_food → «Claro! São dois euros e sessenta. Cartão ou dinheiro?»; order_food, here_or_go and ask_price are marked skipped / done as in Step B.
- **G5:** the stub Qwen returns goal «pay» at order_drink (not a candidate) → ignored → unclear.
- **G6:** under every character bubble, `ar` is rendered; under the latest bubble, the 2 `suggest` chips of the current goal.
- **G7:** no scene turn ever makes a model call whose text reaches a bubble (assert).

**Live check (real Qwen, not CI):** run the G1 learner messages and print the bubble + the correction card for each. Expected corrections (contain):
- «quero um cafe» → «café»;
- «Comer para aqui.» → «Para comer aqui»;
- «a tudo, e quenta?» → «É tudo» and «conta»;
- «Nao obrigado» → «Não, obrigado».

Bubbles must be identical to G1.

---

## Change 2026-11-19 (Omar's test). This section wins over the sections above

**1. Hints, not answers.** The «ممكن تقول:» row gave the learner the full answer to tap. Remove it.
- Under the latest character bubble there is now one small button: **«💡 تلميح»**.
- Each goal has `hints` {what_eg, words_eg, frame_tl} (in the café file; `hint_eg` was replaced by `hints.what_eg`). `suggest[]` is kept as the last level only.
- **The hint ladder per goal.** Each press of «💡 تلميح», each «مش عارف» / «ساعدني», and each miss from the 2nd one on, moves one level up. The hint card shows only the current level:

| Level | The hint card shows | Example (order_drink) |
|---|---|---|
| 1 | `what_eg` (what to do) | «Manuel بيسألك تشرب إيه. اطلب بـ Queria + المشروب + por favor.» |
| 2 | `words_eg` (the words you need, with their meaning) | «café = قهوة · galão = قهوة بلبن · chá = شاي» |
| 3 | `frame_tl` (a sentence with a blank, not tappable) | «Queria um ___, por favor.» |
| 4 | `suggest[]` as tappable chips (the full answer) | `Queria um café, por favor.` |

- If the goal is completed after level 4 was shown, it's marked `assisted`, not done.
- The ladder resets for each new goal.
- Misses: the 1st miss = the `unclear` bubble only; the 2nd miss = `unclear` + level 1 (or one level up if the learner already pressed).

**2. The correction card never appeared.** «par aqui» and «e cont» were matched by code and got the right bubble, but no correction card showed. The likely cause: on a code match, the turn's stream closes after the bubble, so the Qwen result (which arrives later) is lost. Fix:
- keep the turn's stream open until the Qwen call finishes (or times out at 4 s), and send the correction as its own event after the bubble;
- the UI must accept a correction event after the bubble.
- Then print the raw Qwen JSON for «par aqui», «e cont», «Nao obrigado» and «quero um cafe» in the live check.

**3. Old sessions.** One screen showed a bubble from the old format («Não obrigado? Claro! …» with Arabic that doesn't match). A scene session made with an older format must not resume: on open, if the session's format ≠ the bank's `format`, start fresh.

**New tests:**
- **G9:** at order_drink, press «💡 تلميح» 4 times → the card shows `what_eg`, then `words_eg`, then `frame_tl`, then the 2 `suggest` chips; then «Queria um café, por favor.» → order_drink is `assisted`.
- **G10:** at here_or_go, «par aqui» with a stub Qwen `{has_error: true, corrected: "Para comer aqui."}` delayed 1 s → the bubble first, then the correction event; the UI reducer renders the card.
- **G11:** an old-format session for cena-cafe → opening the scene starts a fresh session.
- **G6 changes:** no `suggest` chips are rendered unless the ladder is at level 4.

## Change 2026-11-19 (2): a longer café

- The café now has **10 goals**: order_drink, order_food, here_or_go, **sugar**, **first_time** (small talk), **origin** (small talk), ask_price, pay, contribuinte, bye. The **G1 table above is updated** to the new golden run.
- **Lines may have `tl_f` / `ar_f`:** use them for a female learner (e.g. «Nunca a vi por aqui!», «bem-vinda»).
- **The live check uses the new G1 learner messages**, and adds these expected corrections: «sem açúcar» → none; «sim, moro aqui perto» → «Sim, moro aqui perto.» (only capital/punctuation → `has_error` false).
