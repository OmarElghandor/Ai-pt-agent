# Role-play v1 · The engine and 15 base situations, ordered by difficulty

Decided by Omar on 2026-11-14:
- **Ordering:** a ladder of situations in 5 levels. Each situation is played at 3 tiers.
- **Access:** every situation is open and shown in order. A situation above the learner's level shows a «صعب عليك دلوقتي» badge but can still be played (the same as the Library).

This replaces the role-play side of batch v3 (the day-33 Module A pack in the role-play list). Free talk (batch v4) is not touched.

## What role-play is

- **A real situation with a task.** For example: order at the café and pay; get a NIF at Finanças.
- **The character's lines are authored.** The learner's moves are checked by code. There's no model call on the normal path, so it's fast, cheap and doesn't drift.
- **Free talk** is where the model talks freely. **Role-play** is where the learner rehearses the exact situations of life in Lisbon.

## Content (authored, on this branch)

**`content/v2/roleplay/pt-PT.index.json`** has:
- the 3 tiers (names and descriptions in Egyptian Arabic);
- the 5 levels, with the situations of each level in order. Every situation entry includes its step count per tier.

**`content/v2/roleplay/pt-PT.rp.<id>.json`**: one file per situation, 15 in total:

| Level | Situations (in order) | Recommended day |
|---|---|---|
| 1 · أول خطوات | café · market stall · supermarket | 9 |
| 2 · الناس اللي حواليك | parcel at the door · restaurant (no pork) · the neighbour | 11, 16, 20 |
| 3 · تتحرك في المدينة | phone a friend · train ticket to Sintra · lost in the Baixa | 30, 32, 34 |
| 4 · مواعيد وصحة وتسوّق | book a doctor (phone) · pharmacy · clothes shop | 38, 40, 46 |
| 5 · الحياة هنا | see a room to rent · call the landlord (broken machine) · NIF at Finanças | 49, 52, 54 |

### Situation file

**Header:**
- `id`, `level`, `order`, `recommended_day`, `emoji`, `title_tl`, `title_ar`;
- `place_eg`, `task_eg`, `learner_role_eg`;
- `character`: a cast id from `characters.json`, or an inline `{name, gender, role_eg}` for one-off people (cashier, delivery man). A one-off person gets a voice by gender;
- optional `cast[]` when 2 people speak; then each step has a `speaker`;
- `address` (o senhor / a senhora / tu);
- `item_ids`: the core items the situation uses, filled by a script;
- `new_tl`: phrases outside the curriculum that the scene teaches;
- `key_phrases[]` (tl, ar, optional tl_f);
- `steps[]`, `closing`, `summary_eg`.

**Each step has:**
- `id` and `min_tier` (1, 2 or 3). A step only plays at that tier or higher;
- optional `if_slot` {slot: value}: the step only plays when an earlier answer set that slot to that value (e.g. «cash only» plays only if the learner chose to pay by card);
- `says` {tl, ar, tl_f?, ar_f?}: the character's line. It can be **null**, meaning the previous step's reply is the prompt;
- optional `says_alt[]`: a faster or more natural variant, used at tier 2 and above;
- optional `speaker`;
- `coach_eg`: a one-line meaning or culture note, shown at tier 1;
- `expects`:
  - `intent_eg`, `examples_tl[]` (+ `examples_tl_f[]`), `keywords[]`;
  - optional `free_answer` (any real answer counts: numbers, spelling, an address);
  - optional `slot` + `options[]`. Each option has {value, keywords, reply?, stay?}. Options are checked in order and the first match wins. `stay` means reply but keep the step open (e.g. «Pode repetir?»);
- `help` {frame_tl, eg, chips[], chips_f[]?};
- `reply` {tl, ar}: the character's reaction once the step is done. An option's reply wins over it.

**Text rules:**
- `{name}` is the learner's name. When the name is unknown, drop it with its comma.
- When the learner is female, use `tl_f` / `ar_f` / `chips_f` / `examples_tl_f`.
- No «/» in any line.

## The tiers

| | 1 · خطوة بخطوة | 2 · لوحدك | 3 · زي الحقيقة |
|---|---|---|---|
| **Before the scene** | key phrase cards (hear each one) | key phrase cards, optional | no cards, just the task |
| **The character's lines** | `says`, slow audio | `says_alt` when present, normal audio | `says_alt`, normal audio |
| **Arabic translation** | shown under every line | hidden, tap to show | hidden, tap to show (costs the star) |
| **`coach_eg`** | shown | only after a miss | only after a miss |
| **Chips** | visible from the start | after 1 miss | only via «ساعدني» |
| **Steps** | `min_tier` 1 | ≤ 2 | all (the surprises) |
| **Off-script answer** | coach: «قصدك…؟» + chips | the character's confusion line + `says` repeated | same as tier 2; optional model reaction (flag) |

- **Stars:** finishing a tier gives its star. Stars are 3 per situation.
- **All tiers are open.** The tier picker recommends the next tier after the one finished.

## The engine (per learner message)

1. **Side channel first.** This reuses the existing modules.
   - An Arabic or English language question («يعني إيه caução؟») gets a coach answer from the current step's lines and the scenario's `key_phrases`, before any model call.
   - The character waits.
   - «مش عارف» / «ساعدني» goes to the help ladder.
2. **Match the current step:**
   - normalize the message (case, accents, punctuation);
   - the step is done if it contains one of its keywords, fuzzy-matches an example of at least 2 words, or (with `free_answer`) is a non-empty real answer;
   - if the step has options, the first matching option sets the slot.
   - **Look-ahead:** one message can also complete the next step(s) when they match (e.g. «Bom dia! Queria um galão. Só isto, obrigado.»). A completed step that the learner answered ahead plays its reply but not its `says`.
3. **Done:**
   - emit the option or step reply;
   - then the next playable step's `says`, skipping steps excluded by `min_tier` or `if_slot`;
   - the correction card runs async on every Portuguese message (batch-corrections);
   - credit the step's matched core items through the existing answers progress writer.
4. **Not matched:** the help ladder for this step.
   - **Miss 1:** a re-ask. At tier 1 the coach shows a frame and chips. At tier 2–3 the character says a short confusion line («Desculpe?» / «Como?») and then `says` again.
   - **Miss 2:** the frame and chips.
   - **Miss 3:** the coach gives the full sentence. The learner repeats it, and the step is marked assisted.
   - **Never «مش واضح» for typed text.**
5. **The end:** `closing`, then the result card:
   - the tier star;
   - steps done alone vs assisted;
   - the key phrases the learner said;
   - the corrections;
   - `summary_eg`;
   - «جرّب الدرجة الجاية».
6. **Model use:**
   - none on the normal path;
   - `V2_ROLEPLAY_MODEL_REACTIONS` (off by default) allows one short in-character model reaction for off-script answers at tier 3, using the V7 character model;
   - the prompt is constant-size: the character, the current step, and the last 2 exchanges.
7. **Pacing:** the typing indicator and bubble delays from the free-talk pacing fix. Delays are 0 in tests.
8. **Resume:** the session stores the step pointer, slots, misses per step and the tier. Reopening resumes at the current step with a «كنا فين» line.

## UI (new colours from the project's theme doc)

- **«رول بلاي» list** (replaces the current role-play list at `/talk/learn`):
  - 5 level headers with their Egyptian names;
  - each situation card shows: emoji, `title_tl`, `title_ar`, 3 star slots, and the «صعب عليك دلوقتي» badge when the learner's level < `recommended_day`;
  - order comes from the index.
- **Intro sheet:**
  - place and task;
  - your role;
  - the 3-segment tier picker with descriptions;
  - «ابدأ».
  - At tier 1, the key phrase cards play first (carousel, audio).
- **Play screen:**
  - the same chat UI as free talk (voice-first, text toggle);
  - the header shows the situation title and a step progress bar for the playable steps of the chosen tier;
  - a «ساعدني» button is always there.
- **Result card**, as in step 5.

## Prompt to paste into Cursor

Read this file. Implement R1–R8 in order on a new branch off main. Commit each as "role-play v1: R<n> <title>", with tests, and push after each step. Don't edit the scenario Portuguese. New code goes under `lib/v2/roleplay`, `app/api/v2/roleplay`, `app/(v2)/(flow)/roleplay` and `components/v2/roleplay`. Mongo collections are `v2_roleplay_sessions` and `v2_roleplay_stars`.

- **R1 · Loader + validator for the index and situation files.**
  - Every `if_slot` refers to an earlier slot and a real option value.
  - Every example and chip matches its step's keywords or an option.
  - No «/», and no empty `ar`.
  - The first step has a `says`.
  - Tests: all 15 load.
- **R2 · Matcher:** normalization, keywords, fuzzy examples, `free_answer`, options in order, `stay`, look-ahead.
  - Tests:
    - «Bom dia! Queria um galão, por favor.» → `order_drink` with drink = galão;
    - «Ida e volta» → trip «ida e volta», not «só ida»;
    - «Pode repetir?» in rp.direcoes keeps `confirm` open;
    - «sim» doesn't complete `order_drink`.
- **R3 · The session engine:** tier filtering, `if_slot` skipping, replies, the help ladder per step, side-channel hook, correction card, progress credit, resume.
- **R4 · API routes** (start, turn as an event stream like the convo turn, end) and the stars store.
- **R5 · The list screen + intro sheet + tier picker**, plus the level badge from the learner's level. Remove day 33 from the role-play list (`ROLE_PLAY_DAYS`). The day-33 learn pack stays reachable from admin only.
- **R6 · The play screen and result card.** Reuse the free-talk chat components and the pacing. Include the tier rules for the Arabic line, `coach_eg` and chips.
- **R7 · Optional model reaction** behind `V2_ROLEPLAY_MODEL_REACTIONS` (tier 3 only, constant-size prompt). Tests use a stub.
- **R8 · Goldens** (scripted learner turns, delays at 0):
  1. **rp.cafe, tier 1:** «Bom dia! Queria um galão, por favor.» → «Um pastel de nata, por favor.» → «Quanto é?» → «Aceita cartão?» → «Obrigado! Até amanhã!» → closing, star 1. No tier-2 or tier-3 step plays.
  2. **rp.cafe, tier 3:** galão → `no_galao` plays → «Pode ser.» sets drink = café; `here_or_go` and `contribuinte` play.
  3. **rp.mercado, tier 1:** pay with «Aceita cartão?» → `cash_only` plays → «Está bem. Aqui tem.»
  4. **rp.restaurante, tier 2:** «Não como carne de porco.» → `choose` plays → «O frango.» → the soup step → «Isto tem porco?» → the chouriço reply.
  5. **rp.encomenda, tier 1:** «مش فاهم» at `sign` → the help ladder, then «Desculpe, pode repetir?» → the slower reply.
  6. **Any situation:** 3 wrong answers on one step → the step is assisted and the flow moves on. No dead end.

## Done when

- The role-play list shows 5 levels and 15 situations in order, with badges and stars.
- Every situation can be finished at all 3 tiers by following its chips alone.
- Goldens 1–6 pass.
- The normal path makes zero model calls (asserted in the tests).
