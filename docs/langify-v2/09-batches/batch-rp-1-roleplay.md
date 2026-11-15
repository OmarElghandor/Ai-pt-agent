# Role-play v1 · One button, one conversation

Decided by Omar on 2026-11-15:
- the UX stays simple: the learner presses one button and goes into the call / conversation;
- **no tiers, no stars, no level picker, no cards before the scene.**

Difficulty comes from **coming back to the same situation, deeper, later on the path**: café 1 now, then a harder café after about 15 more conversations, then a third one later still.

This replaces the role-play side of batch v3 (the day-33 Module A pack in the role-play list). Free talk (batch v4) is not touched.

## What the learner sees

1. **«رول بلاي» shows one big card:** the next scene's emoji, `title_tl` and `title_ar`, the place in one line, and one button «ابدأ المكالمة».
   - Under it, a small «المكالمات اللي فاتت» link opens finished scenes to replay. It's secondary.
2. **Press the button.** The call screen opens and the character speaks first (voice-first, with the text toggle, the same as the free-talk call UI). There's no picker and nothing to read first.
3. **During the conversation:**
   - every character line shows the Portuguese; a tap shows the Arabic;
   - the learner answers by voice or text;
   - a correction card appears under the learner's message when there's a mistake (async, batch-corrections);
   - when the learner is stuck: see «Help» below;
   - the «ساعدني» button is always there.
4. **The end:**
   - the closing line;
   - a short card: «خلصت ✓» + `summary_eg` + the phrases the learner said + the corrections;
   - one button «المكالمة الجاية».

The path goes in order, scene after scene. A scene is never locked.

## Content (authored, given as files)

- **`content/v2/roleplay/pt-PT.index.json`:** `path[]`, the order of the scenes. Each entry has: n, id, round, emoji, titles, recommended_day and step count. **Round 1 = scenes 1–15.** Rounds 2 and 3 (deeper versions of the same situations) will be added to the same path later, as new files. The engine just follows the path.
- **`content/v2/roleplay/pt-PT.rp.<id>.json`:** one file per scene.

| # | Scene |
|---|---|
| 1–3 | café · market stall · supermarket |
| 4–6 | parcel at the door · restaurant (no pork) · the neighbour |
| 7–9 | phone a friend · train ticket to Sintra · lost in the Baixa |
| 10–12 | book a doctor (phone) · pharmacy · clothes shop |
| 13–15 | see a room to rent · call the landlord · NIF at Finanças |

### Scene file

**Header:**
- `id`, `round`, `recommended_day`, `emoji`, `title_tl`, `title_ar`;
- `place_eg`, `task_eg`, `learner_role_eg`;
- `character`: a cast id from `characters.json`, or an inline `{name, gender, role_eg}` for one-off people. A one-off person gets a voice by gender;
- optional `cast[]` when 2 people speak; then each step has a `speaker`;
- `address`, `item_ids`, `new_tl`;
- `key_phrases[]`: used for the side channel and the end card, not shown before the scene;
- `steps[]`, `closing`, `summary_eg`.

**Each step has:**
- `id`;
- optional `if_slot` {slot: value}: the step plays only when an earlier answer set that slot;
- `says` {tl, ar, tl_f?, ar_f?}: the character's line. When it's **null**, the previous reply is the prompt;
- optional `speaker`;
- optional `hint_eg`: a one-line meaning or culture note, shown only when the learner is stuck;
- `expects`:
  - `intent_eg`, `examples_tl[]` (+ `_f`), `keywords[]`;
  - optional `free_answer`;
  - optional `slot` + `options[]` {value, keywords, reply?, stay?}. Options are checked in order and the first match wins. `stay` means reply but keep the step open;
- `help` {frame_tl, eg, chips[], chips_f[]?};
- `reply` {tl, ar}: an option's reply wins over it.

**Text rules:**
- `{name}` is the learner's name; drop it with its comma when the name is unknown.
- When the learner is female, use the `_f` fields.

## The engine (per learner message)

1. **Side channel first** (existing modules).
   - An Arabic or English language question gets a coach answer from the current step's lines and `key_phrases`. The character waits.
   - «مش عارف» or «ساعدني» → help.
2. **Match the current step:**
   - normalize the message (case, accents, punctuation);
   - the step is done if the message contains a keyword, fuzzy-matches an example of at least 2 words, or (with `free_answer`) is a real non-empty answer;
   - the first matching option sets the slot.
   - **Look-ahead:** one message can also complete the next step(s).
3. **Done:**
   - the reply;
   - then the next step's `says`, skipping steps whose `if_slot` doesn't match;
   - the correction card (async);
   - progress credit for the matched items through the existing answers writer.
4. **Help (not matched, or «ساعدني»):**
   - **First time:** the character says a short «Desculpe?» and repeats `says`, and the coach shows `hint_eg` (if any) + `help.eg` + the 2 chips.
   - **Second time:** the coach gives the full sentence (`frame_tl` or the first chip). The learner says or sends it, and the step is marked assisted.
   - There's never a dead end, and never «مش واضح» for typed text.
5. **No model on this path.** `V2_ROLEPLAY_MODEL_REACTIONS` (off by default) may later allow one short in-character model reaction to off-script answers.
6. **Pacing:** the typing indicator and bubble delays from the free-talk pacing fix. Delays are 0 in tests.
7. **Resume:** if the learner leaves mid-scene, the same button says «كمّل المكالمة» and resumes at the current step.

## Prompt to paste into Cursor

Read this file. The content is already in `content/v2/roleplay/`. Don't edit any Portuguese or Arabic in it; report validation failures to me instead.
- New code only under `lib/v2/roleplay`, `app/api/v2/roleplay`, `app/(v2)/(flow)/roleplay` and `components/v2/roleplay`. Mongo: `v2_roleplay_sessions`.
- Reuse the side channel, the correction card, the free-talk call/chat components and pacing, TTS, and the answers progress writer.
- UI colours come from the current theme.

First, give me a short plan for R1–R5 and wait for my approval. Then implement them in order. After each step, the tests are green and you commit as "role-play v1: R<n> <title>".

- **R1 · Loader and validator** for the index and scene files.
  - Checks: `if_slot` points to an earlier slot and a real option value; every example and chip matches its step; no «/»; no empty `ar`; the first step has `says`.
  - Test: all 15 load.
- **R2 · Matcher and engine:** normalize, keywords, fuzzy examples, `free_answer`, options in order, `stay`, look-ahead, `if_slot` skipping, help (twice, then assisted), side-channel hook, correction card, progress credit, resume.
- **R3 · API** (start / turn as an event stream / end) and path progress (the next scene = the first unfinished scene in path order).
- **R4 · UI:**
  - the one-card entry with «ابدأ المكالمة» / «كمّل المكالمة»;
  - the call screen;
  - the end card with «المكالمة الجاية»;
  - the small «المكالمات اللي فاتت» list.
  - Remove day 33 from the role-play list (`ROLE_PLAY_DAYS`).
- **R5 · Goldens** (scripted, delays at 0):
  1. **rp.cafe:** «Bom dia! Queria um galão, por favor.» → «Um pastel de nata, por favor.» → «Para levar.» → «Quanto é?» → «Aceita cartão?» → «Não, obrigado.» → «Obrigado! Até amanhã!» → closing.
  2. **rp.cafe:** «sim» at `order_drink` → help with chips; «sim» again → the full sentence, assisted; the scene continues.
  3. **rp.mercado:** «Aceita cartão?» at `pay` → `cash_only` plays → «Está bem. Aqui tem.»
  4. **rp.restaurante:** «Não como carne de porco.» → `choose` plays → «O frango.» → the soup step → «Isto tem porco?» → the chouriço reply.
  5. **rp.direcoes:** «Pode repetir?» at `confirm` → the reply, and the step stays open → «Em frente e depois à esquerda?» → done.
  6. **Any scene:** zero model calls on the whole run (asserted).

## Done when

- One button opens the next scene's call and the character speaks first.
- Every scene can be finished using only the chips.
- After a scene, «المكالمة الجاية» opens the next one in path order.
- Goldens 1–6 pass.
