# Role-play v3 · The café: authored conversation, Qwen understands and corrects

**Version 2026-11-20. This whole file replaces the previous batch-rp-3** (including its «Change 2026-11-19» sections).

Kept from batch-rp-2:
- the entry button;
- the mission strip;
- the end card;
- scenes out of free talk;
- Step B matching (WEAK words, jump ahead, farewell only when current, one-typo tolerance for keywords of 5+ letters).

If something here is unclear, **stop and ask Omar**.

## The principle

- **Every character bubble comes from the scene file.** Qwen never writes text that appears in a bubble.
- **Qwen does one JSON call per learner message:** it understands what the learner meant, and corrects the learner's sentence.
- **Let the learner try first.** No answer is given before the learner has tried. The full answer appears only after a mistake.

## Scope

- Only `cena-cafe` (`format: 3`). The index lists only the café.
- Sessions from an older format never resume; they start fresh.

## The file format (`format: 3`)

**Top level:**
- `id`, `kind: "scene"`, `format: 3`, titles, `emoji`, `recommended_day`;
- `mission_eg`, `character_id`, `address`;
- `opening[]`;
- `global` {greeting, thanks, side_unknown};
- `goals[]` in order;
- `end_tips_eg[]`: 1–2 culture tips shown on the end card;
- `closing[]`.

**Lines:** every line is {tl, ar} + optional `tl_f`, `ar_f` (used when the learner is female).

**Each goal:**
- `id`, `label_eg`;
- `only_if` (optional) {goal, options[]}: the goal is active only if that earlier goal was completed with one of those option values. Otherwise it's silently left out (not shown in the checklist, not counted, not skipped). Example: `size`, `temp`, `sugar` and `water` are only for café, galão and chá, not for água;
- `coach_before_eg` (optional): an Arabic coach message shown **once**, right under the character bubble that opens this goal. Example: water → «💬 جرّب تطلب ماية كمان مع الأوردر.». These are rare on purpose (2 in the café), so the learner thinks for themselves. **Spacing rule (code):** at most one coach message every 3 character bubbles; if one is due sooner, drop it;
- `ask[]`: the variants of the character line that opens the goal. They end with a question;
- `options[]` {value, keywords[], examples[], react[]}: reacts are statements;
- `unclear[]`: the character's full turn when not understood (ends with a question);
- `suggest[]` (+ `suggest_f[]`): full example answers, shown **only after a mistake** (see Help);
- `hint_words`: 1–3 Portuguese words, the 💡 hint («um café · um galão»);
- `farewell: true` on the last goal.

**Variants:** a per-session counter for each `ask[]` / `react[]`. The first use takes [0], then [1], then it wraps.

## The screen

1. **The character bubble:** the Portuguese text + 🔊 + a **translate icon**. The Arabic is **hidden by default**; the icon shows or hides it for that bubble.
2. **Under the latest character bubble:**
   - one small button «💡» → shows `hint_words` (just the words, e.g. «um café · um galão»). Pressing it again hides it. It never shows a full sentence;
   - if the goal has `coach_before_eg`, it shows once as a small coach line.
3. **The correction card** under the learner's bubble when Qwen returns `has_error: true`: the corrected sentence + `note_eg`. It arrives as its own event after the character bubble; the stream stays open until Qwen returns or times out (4 s).
4. **Nothing is shown automatically at the start of a goal** except `coach_before_eg`: no hint card, no chips.
5. Unchanged: the mission strip, one character bubble per turn, the typing pacing, one audio per bubble.

## Guidance philosophy (Omar, 2026-11-20)

The learner should think and use the language from their own head:
- **The character steers with its questions** (the `ask` lines invite the next move: «E para beber, mais alguma coisa?»). That's the main guidance.
- **Coach messages are rare** (the spacing rule).
- **The 💡 words** appear only when the learner asks for them.
- **A full sentence** appears only after a mistake.

## Help (after mistakes only)

| Event on the current goal | What appears |
|---|---|
| 1st miss | The `unclear` bubble + a coach line «ممكن تقول: `suggest[0]`» (`suggest_f[0]` if female), with the sentence tappable |
| 2nd miss | The `unclear` bubble + the coach line with both `suggest` sentences, tappable |
| 3rd miss | The goal is marked `assisted`; the bubble = the next active goal's `ask` |
| «مش عارف» / «ساعدني» | Same as the next miss level, but no character bubble and it doesn't count as a miss |

A goal completed after any `suggest` was shown is marked `assisted`.

## One learner turn

**Step 1 · The message type (code):**
- an Arabic or English language question → the existing coach side channel (no bubble);
- «مش عارف» / «ساعدني» → Help (no bubble);
- a repeat request («Pode repetir?», «Mais devagar», «Não percebi», «مش فاهم», «تاني») → replay the last character bubble at TTS 0.85;
- anything else → Step 2.

**Step 2 · Start the Qwen call (in parallel) + code matching** over the **active** goals (Step B rules; `only_if` goals that are inactive are ignored).

**Step 3 · Decide** (the first rule that applies):

| # | Condition | Character bubble | State |
|---|---|---|---|
| 1 | Code matched the farewell goal | `closing`, then the end card | finished |
| 2 | Code matched a goal | option `react` + « » + the next active open goal's `ask` | done (gaps skipped) |
| 3 | No match; a `global.greeting` keyword | greeting `react` + « » + the current `ask` | — |
| 4 | No match; a `global.thanks` keyword, and farewell isn't current | thanks `react` + « » + the current `ask` | — |
| 5 | No code match; Qwen returns a valid goal + option | as rule 2 (or rule 1) | as rule 2 |
| 6 | Qwen `side_question` | `side_unknown` react + « » + the current `ask` | — |
| 7 | Otherwise | Help (the miss ladder above) | misses +1 |

**The next active goal** = the first goal after the current one that is not done or skipped and whose `only_if` (if any) is satisfied.

## The Qwen call (JSON only)

- **Model:** `getChatModel()`, temperature 0, max tokens 150, timeout 4 s.
- **Input:**
  - the character's last line;
  - the learner's message;
  - the candidate goals: the current goal + the next 2 active non-farewell goals (+ farewell if current), with their option values and examples.
- **Output:**
  `{"kind": "answer" | "side_question" | "other", "goal", "option", "corrected", "has_error", "note_eg"}`
- **Rules given to Qwen:**
  - fix ALL mistakes;
  - keep the learner's words where they are correct;
  - prefer the matching example's wording («qureia» → «queria», never «quero»);
  - `has_error` is false if only capital letters or punctuation differ;
  - `note_eg` is one short Egyptian line naming the main fix as «غلط → صح».
- **Validation:**
  - the goal must be a candidate and the option one of its values;
  - invalid JSON or a timeout → no match and no correction.

## Acceptance

**G1 · Golden run** (stub Qwen: `kind: "other"`, `has_error: false`). Every bubble must match exactly:

| Learner | Character bubble | Coach line |
|---|---|---|
| (start) | Bom dia! 😊 Então, o que vai ser hoje? | — |
| Bom dia | Bom dia, bom dia! Está frio hoje, hã? ☕ O que lhe sirvo? | — |
| quero um galão | Um galão, saindo! Pequeno ou grande? | — |
| grande | Grande, muito bem. Também temos com gelo. 🧊 Quente ou frio? | — |
| quente | Quente, claro. Com açúcar ou sem açúcar? | — |
| sem açúcar | Sem açúcar, muito bem. Os pastéis de nata acabaram de sair do forno. 😋 Quer um para acompanhar? | — |
| um pastel de nata | Boa escolha! E para beber, mais alguma coisa? | 💬 جرّب تطلب ماية كمان مع الأوردر. |
| e uma agua | Uma água, claro! Natural ou fresca? | — |
| fresca | Fresca, muito bem. É para comer aqui ou para levar? | — |
| Comer para aqui. | Então sente-se à vontade. Aqui está! 😊 Bom apetite! Precisa de mais alguma coisa? | — |
| é tudo, a conta? | É tudo, então! São três euros e dez. Cartão ou dinheiro? | — |
| Cartão | Com cartão, sem problema. Pode passar aqui. 💳 Quer fatura com contribuinte? | 💬 contribuinte = رقمك الضريبي (NIF). هتسمع السؤال ده في أي محل. |
| Nao obrigado | Muito bem. Obrigado e bom dia! Até amanhã? 😊 | — |
| até amanhã! | Até amanhã! 👋 → end card | — |

**Other tests (stub):**
- **G2 · water path:** «quero uma água» at order_drink → `size`, `temp` and `sugar` are inactive; the bubble = «Uma água, claro! Os pastéis de nata acabaram de sair do forno. 😋 Quer um para acompanhar?»; the checklist doesn't list size, temp, sugar, water or water_type.
- **G3 · help ladder:** at order_drink:
  - «xyz» → «Desculpe, não percebi… Um café? Um galão? 😊» + the coach line «ممكن تقول: Queria um café, por favor.»;
  - «xyz» again → the same bubble + both suggestions;
  - «xyz» a third time → order_drink is assisted with no option, so `size`, `temp`, `sugar` and `water` are inactive, and the bubble = the order_food `ask` («Os pastéis de nata acabaram de sair do forno. 😋 Quer um para acompanhar?»).
- **G4 · no automatic help:** a fresh start shows no hint and no suggestions; only the opening bubble and the «💡» button.
- **G5 · 💡:** pressing it at order_drink shows exactly «um café · um galão».
- **G6 · translation:** the Arabic is hidden by default; the translate icon toggles it.
- **G7 · correction after the bubble:** a stub Qwen with a 1 s delay `{has_error: true, corrected: "Para comer aqui.", note_eg: "comer para → para comer"}` → the bubble first, then the correction card.
- **G8 · Qwen never writes bubbles:** assert that every bubble ⊆ authored lines.
- **G9 · old session:** an older-format session starts fresh.
- **G10 · coach spacing:** two goals with `coach_before_eg` opened 2 bubbles apart → only the first coach message shows.
- **G11 · end card** shows the 2 `end_tips_eg`.

**Live check (real Qwen):** play G1, and print the bubble + correction for each turn. Also play these, printing the correction:
- «Sim qureia um pastel de nata» → contains «queria»;
- «si acucar» → «com açúcar»;
- «e todo» at ask_price → understood (matches ask_price) + a correction «É tudo»;
- «con carto» → «Com cartão».

## Fixes after Omar's run (2026-11-20, noon)

1. **«não obrigado» at ask_price got «Desculpe?».** Content fix: the `tudo` option of `ask_price` now also matches «não» and «obrigado» (answering «Precisa de mais alguma coisa?» with «Não, obrigado» means "that's all").
2. **A correction card for punctuation only.** «Pequeno por favor» → «Pequeno, por favor.» was shown as a mistake. Enforce it in code, don't trust Qwen: lowercase both texts and remove punctuation; if the learner's text equals the corrected text → no card.
3. **Corrections show collapsed («✏️ تصحيح»)** for some messages. Always show the card expanded (the corrected sentence + `note_eg`).
4. **The miss suggestion is shown twice:** once as chips under the bubble, and again as a coach card with an empty «ممكن تقول:» + the same chip. Show it **once**: the «ممكن تقول:» line with the tappable sentence(s), under the `unclear` bubble. Never render an empty coach card.

Tests:
- **G12:** «Pequeno por favor» with a stub Qwen `corrected: "Pequeno, por favor."`, `has_error: true` → no correction card.
- **G13:** at ask_price, «não obreigado» → `tudo` (typo tolerance on «obrigad» isn't needed; «não» matches) → «É tudo, então! São três euros e dez. Cartão ou dinheiro?».
- **G14:** one miss → exactly one «ممكن تقول:» element in the rendered output.

## Fixes after Omar's run (2026-11-20, 12:10)

1. **Arabic help gave a wrong answer** («ازاي اقول ساقع؟» → «Saquei», an invented word). **Omar's decision: Qwen answers it, in context, grounded and checked.**
   - **The Qwen call (JSON):**
     - **Input:**
       - the character's last line (pt + ar);
       - the current goal's option values + `examples`;
       - the scene `glossary` (as the preferred words);
       - the learner's Arabic/English question.
     - **Instruction:** «The learner is in this role-play and asks how to say something. Give ONE short pt-PT sentence they can say now, as a reply to the character's last line. Prefer the words in the glossary and examples. Then one short Egyptian Arabic note about the key word.»
     - **Output:** `{"pt": "<the sentence>", "note_eg": "<short note>"}`. Temperature 0, max tokens 120, timeout 4 s.
   - **The coach card shows:** «تقدر تقول: **<pt>** 🔊» + `note_eg`. The «pt» sentence is tappable (it fills the input). The character waits (no bubble).
   - **The check (code), before showing:**
     - `pt` must be Latin script and at most 10 words;
     - every content word in `pt` must appear in the scene's own Portuguese (`ask`, `react`, `unclear`, `examples`, `suggest`, glossary `tl`) or the common-words list.
     - «Saquei» fails this check.
   - **If the check fails, or Qwen times out:** answer from the `glossary` (normalized Arabic, longest keyword first; keywords of 2 letters or fewer must match a whole word) as «تقدر تقول: <the entry tl>». If the glossary has nothing, show «تقدر تقول: <suggest[0]>» for the current goal.
   - **Example:** the character's last line «Natural ou fresca?» + «ازاي اقول ساقع؟» → «تقدر تقول: **Fresca, por favor.** 🔊 — fresca = ساقعة (للماية)».
2. **The first line needs an instruction.** The bank has a new `opening_coach_eg`, shown once under the opening bubble on a fresh start. It counts for the coach spacing rule (so the next coach message can come only 3 bubbles later). The water coach is far enough away.
3. **«Nao perciso» at `sugar` was matched to `order_food` («só isso»)** and skipped sugar. Content fix: `sugar` › `sem` now also matches «não», «nao» and «preciso», so the current goal wins first.
4. **«não obrigao» at ask_price got «De nada!»** (the thanks rule). It's already fixed by the previous zip's `ask_price` content change (rule 2 runs before rule 4); make sure that file is applied.

Tests:
- **G15:** at water_type, a stub Qwen returns `{pt: "Fresca, por favor.", note_eg: "fresca = ساقعة"}` for «ازاي اقول ساقع؟» → the coach shows «تقدر تقول: Fresca, por favor.» + the note, and there's no character bubble.
- **G15b:** a stub Qwen returns `{pt: "Saquei"}` → the check fails → the glossary answer «تقدر تقول: fresca = ساقعة (للماية) · frio = ساقع (للمشروب)».
- **G16:** Qwen times out, and «ازاي اقول مطار؟» isn't in the glossary → «تقدر تقول: <current suggest[0]>».
- **G17:** a fresh start → the opening bubble, then `opening_coach_eg` once.
- **G18:** at sugar, «Nao perciso» → «Sem açúcar, muito bem.» + the next active `ask`.
