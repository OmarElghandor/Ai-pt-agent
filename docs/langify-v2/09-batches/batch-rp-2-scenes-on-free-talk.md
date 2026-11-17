# Role-play v2 · Scenes run on the free-talk engine

Decided by Omar on 2026-11-16: role-play uses **the same method as the free-talk module**. A scene is a list of goals, code goes through the goals one by one, and the AI writes the replies in the context of the current goal.

**This replaces batch-rp-1** (the separate role-play engine). One engine to maintain: every fix to free talk also fixes role-play.

## What a scene is

A scene is a normal goal bank (`ConvoGoalBank`) with a few extra fields. The 15 scenes are authored and given as files:

- `content/v2/convo/scenes/pt-PT.index.json`: `path[]`, the order of the scenes (n, id, round, emoji, titles, recommended_day).
- `content/v2/convo/scenes/pt-PT.cena-<id>.json`: one bank per scene.

**Bank fields used as they are today:** `source: "topic"`, `authored`, `topic_id`, `title_tl`, `title_ar`, `scene` (character_id, place, time_of_day, address), `scene_eg`, `intro_eg`, `opening`, `closing`, `goals[]`, `required_items`, `new_items_tl`.

**New fields:**

| Field | Where | Meaning |
|---|---|---|
| `kind: "scene"` | bank | This bank is a role-play scene, not a free-talk topic |
| `emoji`, `recommended_day` | bank | For the entry card |
| `facts_tl[]` | goal | Facts the character must use and must not invent (prices, times, places, what's included) |
| `cue_eg` | goal | One short Egyptian line shown under the character bubble, only on goals where the learner must start («اسأله بكام.») |
| `farewell: true` | goal | The last goal: the goodbye |
| `label_eg` | goal | 2–4 Egyptian words for the mission checklist («اطلب مشروب») |
| `help.chips_f[]` | goal | Chips for a female learner |

Every goal has `ask_tl` / `ask_ar`: the character's line that opens the goal. **Every `ask_tl` already ends with a question or an invitation**, and facts like prices are inside it («São dois euros e sessenta. Cartão ou dinheiro?»).

`scene.place` is an English sentence that gives the character's role in the scene («Manuel works behind the counter of a small neighbourhood café»).

## What changes in the free-talk engine when `kind` is "scene"

1. **Entry: one button.**
   - The role-play screen shows one card for the next scene in `path` order (emoji, titles, `scene_eg`) and «ابدأ المكالمة» (or «كمّل المكالمة» for an unfinished one). A small «المكالمات اللي فاتت» list allows replays.
   - Pressing the button starts a free-talk session **directly on this bank**: no router, no «what do you want to talk about», no topic chips. The character's first bubble is `opening`.
2. **Goals run in file order.** The current goal is the first open one. One learner message can complete several goals (as today).
3. **The CURRENT GOAL prompt part** gets, for a scene:
   - `intent_en`;
   - the suggested line: «say this, or something very close: `ask_tl`»;
   - `facts_tl`: «use these facts exactly; never invent a price, a time or a place».
4. **Guidance is light:**
   - no intro card, no teaching beats, no instructions by default;
   - a goal with `cue_eg` shows that one small 💡 line under the character bubble;
   - the existing help ladder runs only when the learner is stuck or presses «ساعدني» (hint `help.eg` + chips, then the full sentence, goal assisted).
5. **Every character turn ends open:** a question or an answerable invitation. A model turn that ends on a bare statement, or that fails the existing guards, is replaced by the goal's `ask_tl` (which already ends open). No generic tail is ever glued on.
6. **Answers are judged by meaning,** as in free talk: any message that does what the goal asks completes it, mistakes included. The correction card shows the better form.
7. **The end:**
   - the `farewell` goal is last; when the learner says goodbye (or all goals are done), the character says `closing`;
   - then the end card: «خلصت ✓» + the phrases said + the corrections + «المكالمة الجاية»;
   - **no extended goals, no refill, no free flow after the scene.**
8. **Scenes stay out of free talk:** they never appear in the router catalog, the opening chips, or the allowed-topics list.
9. **The level guard** treats the scene's `ask_tl`, `examples_tl`, `facts_tl` and `new_items_tl` words as allowed.
10. **Path progress:** the next scene is the first one in `path` without a finished session.

## The mission strip (Omar, 2026-11-17: «مفيش أي guide بيقول لليوزر محتاج يتكلم عن إيه»)

The learner must always know what this scene is about, without long instructions.

- **Under the header, pinned, one line:** 🎯 + the bank's `intro_eg` («اطلب مشروب وحاجة تاكلها، اسأل الحساب كام، وادفع.»). It never scrolls away.
- **Tap it** → it expands into the goal checklist: one row per goal with its new `label_eg` («اطلب مشروب», «اطلب حاجة تاكلها», «اسأل الحساب كام», «ادفع»…). Done goals get ✓, the current goal is bold. Tap again to collapse.
- When a goal completes, its row ticks with a small animation, and the strip shows «2 من 7» next to the mission.
- **No other guidance by default.** `cue_eg` (under the bubble) and the help ladder stay as they are.
- **Remove the free-talk topic chip** («الموضوع: …») in scenes; the strip replaces it.

## Bugs seen in the 2026-11-17 café run

1. **The character is Inês in the café; the bank says `manuel`.** In a scene, the name, avatar and voice come from `scene.character_id`. Add a test for every scene.
2. **The first answer was ignored.** «quria um cafe por favor» → the character repeated «Bom dia! Diga.»; the same message the second time completed the goal. The first learner message must go straight to the scene's goal check: no greeting pre-filter, no router, no topic logic in scenes. Test: the first message «quria um cafe por favor» completes `cafe.order_drink`.

## Prompt to paste into Cursor

Read this file. The scene banks are in `content/v2/convo/scenes/`. Don't edit their Portuguese or Arabic; report validation problems to me.

First give me a short plan and wait for my approval. Then implement S1–S5 in order, with tests after each step.

- **S1 · Load scenes.** A loader for `content/v2/convo/scenes/` (index + banks) using the existing bank parser, extended for the new fields. Validate:
  - every goal has `ask_tl`, `ask_ar`, examples, keywords and help;
  - every `ask_tl` ends with a question or an invitation;
  - the last goal has `farewell`.
  - Test: all 15 load, and no scene id appears in the free-talk topic catalog.
- **S2 · Engine switches for `kind: "scene"`:** direct start on the bank, goals in file order, the prompt additions (suggested line + facts), `cue_eg`, the end at farewell with no refill, and the `ask_tl` fallback.
- **S3 · Entry and progress:** the one-card screen, «ابدأ / كمّل المكالمة», the past-scenes list, and path progress.
- **S4 · Remove the old role-play engine:** `lib/v2/roleplay` engine, matcher, actor and their API routes, `content/v2/roleplay/`, and batch-rp-1's tests. Keep only what S3 reuses.
- **S5 · Goldens (stub model) + live transcript.**
  1. **cena-cafe:** «quero um cafe» → the order goal is done, and the reply moves to «Mais alguma coisa?»; a correction card appears.
  2. **cena-cafe:** «Quanto é?» → the reply contains «dois euros e sessenta» and ends with a question.
  3. **cena-mercado:** «quria frutas» → the order goal stays open, and the reply ends with a question about which fruit.
  4. **A stub turn that ends on a statement** → replaced by `ask_tl`.
  5. **The farewell goal:** «Obrigado! Até amanhã!» → `closing`, the end card, and no character turn after it.
  6. **`cue_eg`** shows at `cafe.ask_price` and not at `cafe.order_drink`.
  7. **Live (not CI):** play cena-cafe with «quero um cafe» → «Um pastel de nata, por favor.» → «Para aqui» → «Quanto é?» → «Con cartão» → «Nao perciso» → «Obrigado!» on the current model and on Haiku, and print both transcripts.

## Done when

- One button opens the next scene and the character speaks first.
- The scene moves goal by goal, every character turn ends open, and prices and times match the file.
- The scene ends at the goodbye with the end card, and «المكالمة الجاية» opens the next scene.
- There is one conversation engine in the repo.
