# Role-play v4 · All 15 scenes in the café format

Decided by Omar on 2026-11-20: **the café is the standard.** All 15 scenes now use the same format and the same engine.

**No new engine behaviour.** Everything the scenes need was already built for the café in `batch-rp-3-cafe-first.md`, including its later sections:
- `only_if`, `coach_before_eg` with spacing, `opening_coach_eg`, `hint_words`, `glossary`, `end_tips_eg`;
- the miss help;
- the correction event;
- the Arabic help (grounded Qwen + glossary fallback);
- old-session reset.

That file stays the engine spec.

The authoring rules are in `docs/az-talkie-v2/roleplay-scenes-guide.md`. If something here is unclear, **stop and ask Omar**.

## What's in this zip

- `content/v2/convo/scenes/pt-PT.cena-*.json`: all 15 scenes, `format: 3`. **They replace the 14 old format-2 files with the same names.** The café file is unchanged except for one line: the temperature question now ends with the question, «Também temos com gelo. 🧊 Quente ou frio?».
- `content/v2/convo/scenes/pt-PT.index.json`: the path, 15 scenes in this order: café, mercado, supermercado, encomenda, restaurante, vizinha, telefone, comboio, direções, consulta, farmácia, roupa, quarto, avaria, finanças.
- `tests/fixtures/v2-scenes-goldens.pt-PT.json`: one golden run per scene (learner message → the exact bubble + the coach line).
- `docs/az-talkie-v2/roleplay-scenes-guide.md`: the pattern and the mistakes to avoid.

## Code changes (small)

1. **The typo tolerance changes** (it's used only to detect close-but-wrong answers, see point 3), overriding batch-rp-2 8.2: one typo for keywords of **6+** letters, two for **9+**. Shorter keywords match exactly. Reason: «preto» matched «preço», and «quarto» matched «quanto».
2. **The scene validator** (the loader's validate step) enforces the guide's checks for every scene:
   - `ask` and `unclear` end with «?» (except the farewell goal); `react` doesn't end with «?»;
   - no empty `ar`; no «/» in `tl`;
   - `only_if` points to an earlier goal and real option values;
   - every option's `examples` and every `suggest` / `suggest_f` is matched by code at its own goal **without jumping** to a later goal;
   - each goal has 2 `suggest` and a `hint_words`;
   - the glossary has ≥ 8 entries; `opening_coach_eg` exists; `end_tips_eg` has 1–2 items;
   - the last goal is the farewell.

   A failing scene is reported and left out of the path, never auto-fixed.
3. **Close but wrong → stop and correct; don't guess and let it pass (Omar).** The correction is tied to the question that was asked: the right form comes from the current goal's options (what the character just asked about), not from a free guess.

   | The learner's answer word | What happens |
   |---|---|
   | **Exact** (case- and accent-insensitive) | The goal advances normally. If accents or cedilla are missing («agua», «cartao», «Nao»), the correction card is **always** shown (Qwen's, or else one built in code) |
   | **Close but misspelled** (only a fuzzy match: «caráo», «tose», «fresco» for «fresca») | **Stop.** The goal does not advance and there's no character bubble. A coach card under the learner's bubble says «قصدك **cartão**؟ 🔊 اكتبها صح وجرّب تاني.» with the learner's sentence corrected in context («Com cartão.»), tappable. It's not counted as a miss |
   | The same goal gets a **second** close-but-wrong answer in a row | Accept it to avoid a loop: advance, show the correction card, and mark the goal `assisted` |
   | Understood only by Qwen (no keyword) | Qwen also returns `answer_word` (the expected word from the options, correctly spelled) and `answer_word_misspelled` (bool). If misspelled → **stop**, as in row 2. Otherwise advance; if `has_error`, show the card (errors elsewhere in the sentence, like «quero» → «queria», don't stop the learner) |

   **"In context" means:** the corrected word must be one of the current (or matched) goal's option keywords or example words. At «Natural ou fresca?», «fresco» is corrected to «fresca», not to anything else. Qwen gets the character's last line + the options to do this, and code checks that `answer_word` is in that list; otherwise it's ignored.
4. **Remove old format-2 scene code paths** that are no longer reachable (all scenes are format 3 now).

## Tests

- **R4-1:** all 15 scenes load and pass the validator; the index has 15 entries in the order above.
- **R4-2 · Goldens:** for each scene in the fixture, start a fresh session (stub Qwen: `kind: "other"`, `has_error: false`; learner name «Omar», male; replace `{name}` with «Omar»), send each `learner` message, and assert the exact `bubble`, the `coach` line (or none) and the end card at the end. 15 runs.
- **R4-3:** the character per scene comes from `character_id`: café, mercado and restaurante → Manuel; supermercado, comboio, consulta and finanças → Rita; encomenda and telefone → Tiago; vizinha → Graça; direções, quarto and avaria → Carlos; farmácia → Sofia; roupa → Inês.
- **R4-4 · Typo tolerance:** «com caráo» matches `cartão`; «preto» does **not** match `preço`; «quarto» does **not** match `quanto`.
- **R4-5 · Close but wrong → stop:** at cena-cafe `pay`, «com caráo» → no character bubble, the goal stays `pay`, and a coach card «قصدك cartão؟…» + «Com cartão.» is shown. Then «com cartao» → advances (the next bubble ends with «Quer fatura com contribuinte?») **and** shows the accent correction card «Com cartão.».
- **R4-6 · No loop:** «com caráo» twice in a row → the second time advances, shows the correction card, and `pay` is `assisted`.
- **R4-7 · Qwen-only:** at cena-farmacia `problem`, «tenho tose» (no keyword) with a stub Qwen `{goal: problem, option: tosse, answer_word: "tosse", answer_word_misspelled: true}` → stop with «قصدك tosse؟». With `answer_word_misspelled: false` and `has_error: true` → advance + card.
- **R4-8 · Context check:** a stub `answer_word: "café"` at water_type (not an option word there) → ignored, so there's no stop.
- The café's G1–G18 still pass (update the G1 «grande» line to the new temperature line).

## Live check (real Qwen, not CI)

Play these and print bubble + correction + any Arabic-help answer per turn:
- **cena-restaurante:** «mesa pra dois» → «agua» → «nao como porco» → «frango» → «a sopa tem porco?» → «ازاي اقول الحساب؟» → «sim muito bom» → «a conta» → «cartao» → «obrigado».
- **cena-farmacia:** «tenho tose» → «desde onten» → «nao» → «nao tenho alergia» → «quantas vez por dia?» → «cartão» → «obrigado».
- **cena-telefone:** «ola tiago e o omar» → «tudo bem e tu» → «vamos o cinema?» → «hoje» → «sim amanha» → «as nove» → «na porta» → «xau».

Report anything that gives «Desculpe?» to an answer a human would understand. Those are content fixes for Omar and Claude, not code fixes.

## Done when

- All 15 scenes appear in path order behind the one button, and each finishes with its end card.
- R4-1 to R4-4 pass, and so do the café tests.
- The 3 live runs are printed.
