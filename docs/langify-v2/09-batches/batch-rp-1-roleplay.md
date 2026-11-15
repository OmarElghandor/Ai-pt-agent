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
   - when the learner is stuck: a small 💡 hint (see «Light guidance» below);
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
- `do_eg`: **what the learner must do now**, in Egyptian, 2nd person («Manuel بيقولك «اؤمر». اطلب مشروب ☕»). It's **always shown** (see «Always show what to do» below);
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

## The scene file is a guide, the model is the actor (Omar, 2026-11-15). This section wins over anything below

The conversation should feel like the first call we designed: a real person who reacts to what the learner actually said, while the scene moves forward. **The file is the script outline, not a fixed text.**
- The steps give the order of the beats, what each beat is about (`intent_eg`), a suggested line (`says`), typical answers (`examples_tl`, `options`) and help.
- **The character's words are written live by the model,** guided by the current beat. The model may reword, react, joke a little, answer a side question, and then move on.
- **Code still owns the state:** which beat we are on, when a beat is done, slots, hints and the end. The model never decides the order.

**Guidance: hints only.**
- No intro card, no «دورك» strip, no instructions by default. The header (character name + scene title) is enough.
- When the learner is stuck («مش عارف», «ساعدني», or 2 turns on the same beat without progress): one 💡 hint line (`hint_eg`, or else `do_eg`) + 2 chips from `help`. On the next miss, the full sentence as a chip; the beat is marked assisted.
- The character's name, avatar and voice come from `character` / `speaker`. The resume note is for resume only.

**Answers: there is no model answer.**
- Anything that does what the beat asks counts, with mistakes, other words, or an English or Arabic word inside («quero um coffee» = an order for a café).
- The character answers naturally, with a short recast when there's a mistake («Um café? Claro!»). The correction card shows the better form under the learner's message.

## The engine (per learner message)

1. **Side channel first** (existing modules). An Arabic or English language question gets a coach answer from the current beat and `key_phrases`, and the character waits. «مش عارف» / «ساعدني» → the hint.
2. **Code check (fast).** The existing matcher (normalize, keywords, fuzzy examples, `free_answer`, options in order, look-ahead) marks the beat done when it's sure, and sets the slot.
3. **One model call writes the character's turn (streamed).** The prompt has a constant size, made of labelled parts:
   - **CHARACTER:** name, role in this scene, address (o senhor / tu), style: «short, natural pt-PT, at most 2 short sentences, simple words».
   - **SCENE:** `place_eg` in English, the task.
   - **CURRENT BEAT:** `intent_eg` (in English), the suggested line, the option values. If code already marked it done: «done, slot = galão».
   - **NEXT BEAT:** its suggested line, or «end: say goodbye» when it's the last.
   - **LAST 3 EXCHANGES.**
   - **LEARNER JUST SAID.**

   **Output contract:**
   - the Portuguese turn: a reaction to what the learner said (+ a recast if there was a mistake), then, if the beat is done, the next beat's question (reworded or not); if not, a natural re-ask;
   - then the `AR:` line;
   - then a hidden line `BEAT: done <option>` or `BEAT: open`.
4. **Code decides the state:**
   - the beat is done if code said so, or if the model says done and the message is a real attempt (not empty, not only «sim/não» unless the beat's options are yes/no);
   - a slot from the model must be one of the option values.
   - If the beat is done but the model's turn didn't move on, code appends the next beat's `says`.
5. **Guards, then fallback to the file.** Reject the model's turn if it:
   - is empty or uses a wrong script;
   - is longer than 2 sentences;
   - has more than 2 content words outside (scene items + `new_tl` + the common-words list);
   - asks about something outside the scene.

   On reject or timeout (4 s): use the file's lines (option / step reply + next `says`). The learner never waits on a dead end.
6. **The end:** after the last beat, the model says goodbye in character (or the file's `closing` as fallback), then the end card.
7. **Model:** `V2_CONVO_MODEL` (the same switch as free talk; A/B Qwen vs Haiku in the dev menu). One call per learner turn. Log cost and latency.
8. **Pacing and resume:** as before (the typing indicator; on resume, replay the last character bubble).

**Chat structure:** one character bubble per turn (one audio, Arabic on tap). Never an empty coach bubble.

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
  6. **rp.cafe with a stub model:** «quero um coffee» → the stub returns «Um café? Claro! Mais alguma coisa?» + `BEAT: done café` → one bubble, slot = café, a correction card, no hint.
  7. **Fallback:** the stub returns an empty turn / Chinese text / 4 sentences / a timeout → the file's lines are used, and the scene continues.
  8. **State:** the stub says `BEAT: done` for «sim» at `order_drink` → rejected (not a real attempt); for a slot that isn't an option value → rejected.
  9. **Live eval script (not CI):** play rp.cafe, rp.restaurante and rp.direcoes with scripted learner turns against Qwen and Haiku, and print the transcripts side by side for Omar.

## Done when

- One button opens the next scene's call and the character speaks first.
- Every scene can be finished using only the chips.
- After a scene, «المكالمة الجاية» opens the next one in path order.
- Goldens 1–6 pass.
