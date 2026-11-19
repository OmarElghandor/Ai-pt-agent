# Role-play v2 · Scenes on the free-talk engine — FINAL SPEC

Version: 2026-11-17 (final). **This file replaces every earlier role-play spec and section** (batch-rp-1, «Light guidance», «Open and directed», «Fixes round 1/2»).

If the code does something that isn't described here, remove it. If something here is unclear, **stop and ask Omar**. Don't choose.

---

## 1. What a scene is

A scene is a goal bank (`ConvoGoalBank`) with `kind: "scene"`, run by the free-talk engine. The files are:
- `content/v2/convo/scenes/pt-PT.index.json`: `path[]` (n, id, round, emoji, title_tl, title_ar, recommended_day). This is the order of the scenes.
- `content/v2/convo/scenes/pt-PT.cena-<id>.json`: one bank per scene.

**Bank fields:**
- `kind: "scene"`, `topic_id`, `title_tl`, `title_ar`, `emoji`, `recommended_day`;
- `scene`:
  - `character_id`: the cast id; it gives the name, avatar and voice;
  - `place`: an English sentence with the character's role in this scene;
  - `time_of_day`;
  - `address`: formal → o senhor / a senhora; tu → informal;
- `scene_eg`, `intro_eg` (the mission line), `opening`, `closing`;
- `goals[]` (in order).

**Goal fields:**
- `id`, `intent_eg`, `label_eg` (checklist text), `intent_en`;
- `ask_tl`, `ask_ar` (+ optional `ask_tl_f`, `ask_ar_f`): the character's line that opens the goal. **Every `ask_tl` ends with a question or an invitation**, except the farewell goal's;
- `examples_tl[]`, `keywords[]`;
- `help` {frame_tl, eg, chips[], chips_f[]?};
- optional `cue_eg`, `facts_tl[]`, `farewell: true` (the last goal only).

**Female learner:** use `ask_tl_f`, `ask_ar_f` and `chips_f` when present.

**`{name}`:** replace it with the learner's name. If the name is unknown, remove it together with the comma before it.

---

## 2. The screen

1. **Entry (`/roleplay`):**
   - one card for the next scene in `path` order (the first one without a finished session): emoji, titles, `scene_eg`;
   - one button: «ابدأ المكالمة», or «كمّل المكالمة» if this scene has an unfinished session. **Pressing it opens the call directly** (the chat with the character's first bubble). There's no intro sheet and no second start button. `/roleplay/[id]` also goes straight into the call. Delete `RoleplayIntroSheet`;
   - a small link «المكالمات اللي فاتت» lists finished scenes for replay;
   - when all scenes are done, the card says «خلصت كل المكالمات 👏 الجولة الجاية قريب».
2. **Header:** back arrow, the character avatar + name, the scene title, «ساعدني», ⋯ (dev menu).
3. **Mission strip** (pinned under the header, never scrolls):
   - one line: 🎯 `intro_eg` · «n من N» (done + skipped goals / all goals except farewell);
   - tapping it expands the checklist of `label_eg`: ✓ for done, a dash for skipped, **bold** for the current goal (no farewell row); tap again to collapse.
4. **Chat:**
   - **one character bubble per turn** (Portuguese text; Arabic on tap; one audio);
   - the learner's bubble;
   - the correction card under the learner's bubble when there is a correction;
   - the coach hint card when needed (section 4).
   - **No other cards:** no intro card, no «دورك» strip, no «الموضوع» chip, no resume note on a fresh start.
5. **Cue line:** when the current goal has `cue_eg`, show it as one small 💡 line under the latest character bubble. It disappears when that goal is done.
6. **Pacing:** the typing indicator before each character bubble (the free-talk pacing). Delays are 0 in tests.
7. **Resume:** «كمّل المكالمة» shows the history and replays the last character bubble's audio.
8. **The end card** (after `closing`): «خلصت ✓», the checklist (✓ / skipped / assisted), the phrases the learner said, the corrections, and the button «المكالمة الجاية».

---

## 3. One learner turn: the algorithm

Run these steps in order. The first matching branch handles the turn.

### Step A · The message type (code only, no model)

| # | The learner sends | Result | Goal state changes? |
|---|---|---|---|
| A1 | An Arabic or English language question («يعني إيه contribuinte؟», «how do I say…») | The coach answers (existing side channel), using the current goal's `ask_tl` / `ask_ar` / `help` and the scene's `facts_tl`. **No character bubble.** | No |
| A2 | «مش عارف», «مش فاهم أعمل إيه», «ساعدني» (button), or empty STT | The hint for the current goal (section 4). **No character bubble.** | Only the hint counter |
| A3 | A repeat request: «Pode repetir?», «Repete, por favor», «Mais devagar», «Não percebi», «Desculpe?», «مش فاهم», «تاني», «عيد» | The character bubble = the **last character text again**, with TTS at rate 0.85. **Exception:** if the current goal's `examples_tl` contain a repeat request (`encomenda.sign`), treat it as Step B. | No |
| A4 | Anything else (Portuguese, or mixed) | Go to Step B | — |

### Step B · Goal matching (code first, then the model)

`normalize` = lowercase, remove accents and punctuation, collapse spaces.

**WEAK words:** sim, não, nao, obrigado, obrigada, está bem, ok, claro, pode, pode ser, aqui tem, por favor, bom dia, boa tarde.

1. **The current goal matches** if any of:
   - the message contains one of its `keywords` (WEAK words count here);
   - the message is ≥ 80% similar to one of its `examples_tl`;
   - the model's `GOAL:` line (Step C) names the current goal, and the message has at least 2 letters.
2. **A later goal matches (jump ahead)** if it isn't the farewell goal and any of:
   - the message contains one of its `keywords` that isn't a WEAK word;
   - the message is ≥ 80% similar to one of its `examples_tl`.
   - If several later goals match, take the **furthest** one.
   - Every goal between the current goal and the reached one becomes `skipped`.
3. **The farewell goal** matches only when it is the current goal (keywords or examples; WEAK words count).
4. **Check rules 1–3 against all goals from the current one to the farewell, then combine:**
   - every goal that matched is `done`;
   - every goal between the current goal and the **furthest** matched goal that did not match is `skipped`;
   - the result is `DONE(furthest matched goal)`.
   - Example (café): at `order_drink`, «Um galão e um pastel de nata» → `order_drink` done (current, keyword), `order_food` done (strong keyword «pastel») → `DONE(order_food)`, next = `here_or_go`.
   - Example: at `order_food`, «Quanto é?» → only `ask_price` matched → `order_food` and `here_or_go` skipped → `DONE(ask_price)`, next = `pay`.
5. **If nothing matched:** `SIDE` when the model said `GOAL: side`, otherwise `MISS`.

### Step C · The one model call (Qwen, every A4 turn)

**Input**, constant size, in English except the quotes:
- the character's name and `scene.place`; the address (o senhor / tu);
- the character's last line;
- the learner's message;
- the current goal: `id` + `intent_en`; the next goal: `id` + `intent_en`;
- the scene facts: all `facts_tl` + every `ask_tl` sentence that contains a number;
- 3 example reactions: «Um café? Claro! 😊» / «Com cartão, muito bem.» / «Ah, do Egito!»;
- the rules:
  - write ONE short reaction in pt-PT, at most 12 words, that doesn't end with a question (a short recast like «Um café?» inside it is fine);
  - if the learner made a mistake, use the correct form inside the reaction;
  - never repeat the learner's whole sentence;
  - if the learner asked something about the scene, answer it in one sentence using only the facts; if the facts don't cover it, say «Isso não sei, desculpe.»;
  - never invent prices, times or places.

**Output**, exactly 3 lines:
- `PT: <reaction>`
- `AR: <the Arabic of the reaction>`
- `GOAL: <current goal id> | <next goal id> | side | none`

**Model:** Qwen via `getChatModel()`, temperature 0.4, max tokens 80, timeout 4 s.

**Reaction guards.** Drop the reaction (keep the turn going) if it:
- is empty;
- has non-Latin script in the PT line;
- is more than 12 words;
- **ends with «?»** (a recast inside the reaction like «Um café? Claro!» is fine);
- contains 4+ consecutive words of the learner's message;
- contains a number that isn't in the scene facts;
- has more than 2 content words outside the level list.

**Opener rule:** if the reaction starts with the same first word as the previous character bubble («Claro», «Perfeito»…), remove that first word.

The `GOAL:` line is used only as described in B1. A `GOAL:` naming any other goal is ignored.

### Step D · The character's bubble

| Result | Character bubble (PT; the AR is built the same way) | State |
|---|---|---|
| `DONE(goal)`, and the next open goal isn't farewell | reaction + «␠» + the next open goal's `ask_tl` | the goal is done; any skipped goals are marked |
| `DONE(goal)`, and the next open goal is farewell | reaction + «␠» + the farewell goal's `ask_tl` (the goodbye) | the same |
| `DONE(farewell)` | `closing`, then the end card | the scene is finished |
| `SIDE` | reaction (the answer) + «␠» + the **current** goal's `ask_tl` | no change; not a miss |
| `MISS`, first miss on this goal | «Desculpe?» + «␠» + the current goal's `ask_tl` (no reaction) | misses += 1 |
| `MISS`, second miss on this goal | the same bubble + **the hint card** (section 4, level 1) | misses += 1 |
| `MISS`, third miss on this goal | the same bubble + **the hint card, level 2** | misses += 1 |

When the reaction was dropped, the bubble is just the `ask_tl` part. **Nothing else is ever added**: no «E agora?», no generic tail, no second sentence from anywhere else.

### Step E · The correction card (async, every A3/A4 message)

- **Input to the grader:**
  - the learner's message;
  - the character's last line;
  - the `examples_tl` of the matched goal (or the current goal).
- **The rules the grader gets:**
  - spelling and accents are always corrections (Con → Com, perciso → preciso, agua → água, Nao → Não);
  - the correction is either one of the given examples or a minimal edit of the learner's text;
  - **never a new phrase** («Para cá» for «Para aqui» is wrong; the right form is «Para comer aqui.»);
  - if the message is already correct, return none.
- **Output:** the corrected text + a one-line Egyptian note, or none.
- The card shows under the learner's bubble.

---

## 4. Hints

- **Level 1** (A2 the first time on a goal, or the second miss): the coach card shows `help.eg` + 2 chips (`help.chips`, or `chips_f`). A tapped chip fills the input; the learner sends it.
- **Level 2** (A2 again, or the third miss): the coach card shows `help.frame_tl` as one chip. When the learner sends anything after this, the goal is marked `assisted` and the scene moves on as in `DONE`.
- **Hints never appear otherwise.**

---

## 5. What to delete

Delete everything not described in this file, including:
- the old `lib/v2/roleplay` engine;
- the strict ordered matching;
- «E agora?» or any generic tail;
- the intro card and the «دورك» strip;
- post-goodbye small talk;
- the Haiku / A/B code for scenes.

Scenes never appear in the free-talk topic catalog, router or chips.

---

## 6. Acceptance tests (stub model where noted; all must pass)

**rp = cena-cafe unless written. «R» = the stub reaction.**

| # | Setup | Learner sends | Expected bubble (exact unless «contains») | Expected state |
|---|---|---|---|---|
| T1 | start | — | «Bom dia! Diga.» | current = order_drink |
| T2 | start | «quero um cafe», R=«Um café? Claro! 😊» | «Um café? Claro! 😊 Mais alguma coisa?» | order_drink done |
| T3 | start | «sim» | «Desculpe? Bom dia! Diga.» | misses 1, no hint |
| T4 | after T3 | «sim» again | the same bubble + hint level 1 (help.eg + 2 chips) | misses 2 |
| T5 | start | «مش عارف» | no character bubble; hint level 1 | — |
| T6 | at order_food | «Quanto é?» | contains «dois euros e sessenta» and ends «Cartão ou dinheiro?» | ask_price done; order_food and here_or_go skipped |
| T7 | at order_food | «Obrigado!» | «Desculpe? Mais alguma coisa?» (WEAK words can't jump; farewell isn't current) | not finished |
| T8 | at order_food | «Tem wifi?», stub GOAL: side, R=«Isso não sei, desculpe.» | «Isso não sei, desculpe. Mais alguma coisa?» | no miss |
| T8b | at order_drink | «Um galão e um pastel de nata» | contains «É para comer aqui ou para levar?» | order_drink + order_food done |
| T9 | at pay | «Pode repetir?» | the last character text again, rate 0.85 | no change |
| T10 | at contribuinte | «Nao perciso», R=«Não precisa, muito bem.» | «Não precisa, muito bem. Obrigado! Bom dia!» | contribuinte done; current = bye |
| T11 | at bye | «Obrigado!» | «Até amanhã! 👋» then the end card | finished |
| T12 | any | the stub reaction «Claro, o senhor quer um café e um pastel» | the reaction dropped (echo) | — |
| T13 | any | the stub reaction ends with «?» («Quer mais alguma coisa?») or contains «2 euros» | the reaction dropped | — |
| T14 | any | «Con cartão», «Nao perciso», «nao como porco», «agua» (the real grader) | corrections: «Com cartão», «Não preciso», «Não como carne de porco», «água» | — |
| T15 | cena-direcoes at confirm | «pode repetir?» | the last character text again; confirm still current | — |
| T16 | every scene | open | the name / avatar = `scene.character_id` | — |
| T17 | every scene | the chips only | the scene finishes | — |

---

## 7. Live check (Qwen, not CI)

Run these 3 scripts, and print every turn as:
`YOU / CHAR / FIX / HINT / LOG (match result, goal state, raw model output, the guard that dropped the reaction)`.

- **cafe-off:** «sim» → «مش عارف» → «queria um galão» → «Tem pastel de nata sem açúcar?» → «يعني إيه contribuinte؟» → «Só isto» → «Para aqui» → «Quanto é?» → «Con cartão» → «Nao perciso» → «Obrigado!»
- **cafe-jump:** «quero um cafe» → «Quanto é?» → «cartão» → «não» → «obrigado»
- **direcoes:** «onde fica metro?» → «pode repetir?» → «em frente e esquerda?» → «é longe?» → «obrigado» → «bom dia»


---

## 8. Changes after the café run of 2026-11-18 (part of the spec; these win where they touch the sections above)

**8.1 · The fresh-start opening is `opening`.** The run started with «Mais alguma coisa?» (the second goal's line) instead of «Bom dia! Diga.». On a fresh start, the first character bubble is the bank's `opening`, and the current goal is the first goal. T1 must test the real start route, not a stub.

**8.2 · Keyword matching tolerates one typo.** In Step B, a keyword also matches a word in the message when, after `normalize`:
- the keyword has ≥ 5 letters and the edit distance is ≤ 1;
- or the keyword has ≥ 8 letters and the distance is ≤ 2.

Keywords shorter than 5 letters must match exactly. This applies to both the current goal and the jump-ahead. Example: «com caráo» → «carao» vs «cartao» = distance 1 → `pay` matches.

**8.3 · The reaction may not bring new things into the scene.** The run had «Um café com creme? Claro!» for «quria um cafe con paste de nata»: nobody said «creme». Add a guard to Step C: drop the reaction if it contains a content word (noun, adjective or verb, not a common word) that is in none of these:
- the learner's message (typo-tolerant, as in 8.2);
- the current or matched goal's `examples_tl`;
- the scene facts;
- the character's last line.

**8.4 · The correction fixes every mistake, not just one.** In the run, «Ola quria um cafe con paste de nata» became «Ola quria um cafe com paste de nata» (only «con» fixed). The rule in Step E is:
- the corrected text is the learner's sentence with **all** its mistakes fixed (spelling, accents, missing words, wrong words): «Olá, queria um café com um pastel de nata.»;
- minimal means "keep the learner's words and order where they're correct", not "fix one word";
- the Egyptian note names the 1–2 most important fixes.

**8.5 · Content:** «conta» now asks for the bill in `cafe.ask_price` and `mercado.ask_price` («E a conta?» got «Desculpe?»).

**New tests:**

| # | Setup | Learner sends | Expected |
|---|---|---|---|
| T18 | fresh start, real start route | — | the first bubble = «Bom dia! Diga.»; current = order_drink |
| T19 | cena-cafe at pay | «com caráo» | `pay` done; the bubble ends with «Quer fatura com contribuinte?» |
| T20 | any | the stub reaction «Um café com creme? Claro!» for «quria um cafe con paste de nata» | the reaction dropped (8.3) |
| T21 | real grader | «Ola quria um cafe con paste de nata» | the corrected text contains «queria», «café», «com», «pastel» |
| T22 | cena-cafe at ask_price | «E a conta?» | `ask_price` done; the bubble contains «dois euros e sessenta» |

