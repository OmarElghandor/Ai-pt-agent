# 16 · Practice engine: daily flashcards + daily review, time-budgeted, review first

Status: plan, 2026-11-21. Decided the same day:
- flashcards stay their own module;
- review size comes from coverage;
- no new screens;
- **30-minute daily session where review takes the biggest share, with extra weight on grammar and sentence building, and the budget configurable per user later.**

App: **az-talkie** (A-Z Talkie). Author: Omar + Claude. Implementation: Cursor.

Read first: `00-decisions.md` (§4 vocab_flow micro checks and "لاقي الصورة", §5, §7, §8, §8b), `11-profile-progress.md` (§4, §5, §7), `13-step-progress.md`, `AGENTS.md`. Where this doc disagrees with `00` §5 or `11` §5 about the daily deck, **this doc wins**, and task E0 writes the change into `00`.

No code in this document by design.

---

## 1. The feature in one paragraph

The learner's day is a **30-minute budget**. In it, **review is the priority and takes the largest share**, then the new lesson, then flashcards.

- **"مراجعة النهارده"** asks questions on the last 3 completed lessons. It is sized to cover every item × skill, with **extra weight on grammar and sentence building**, and weak points come first.
- **"كروت النهارده"** is the flashcards module, a shorter warm-up.

Both draw from a **sliding window of the last 3 completed lessons**, newest first (day 4 → 3 · 2 · 1; day 5 → 4 · 3 · 2). Both feed the same mastery stages: اتعرّفت → راجعتها → افتكرتها → اتحفظت. Home shows "اتحفظت ٤٢ كلمة".

Every step renders with a screen the lessons already have (§2.1). The engine is logic plus a session wrapper.

Naming: "اتمرّن على الدرس" stays the conversation / role-play step on the home hero (`13` §5).

---

## 2. What changes and what is reused

- **Flashcards module:** stays its own module and session (`v2_card_decks`). The window mix in §4 replaces the 9 / 4 / 2 split of `00` §5 and `11` §5.1.
- **Review:** its own session (`v2_review_sessions`, §7).
- **Reused, unchanged:**
  - the day question sets (`00` §7, `use: practice | both`);
  - `/api/v2/answers` as the only writer of item state;
  - `/api/v2/progress/events` as the only writer of sessions and activity;
  - weak spots by problem (`11` §4);
  - essential items first (`00` §5).
- **Out of scope:** custom and official themed decks keep their own sessions (`12` §2.6) and are not in the home mastery count.

### 2.1 Screens: reuse only

| Step | Existing component |
|---|---|
| card | the flashcards deck card |
| any day-question type (`listen_*`, `dictation`, `translate_write`, `fill_blank_*`, `build_sentence`, `say_it`, `reply_*`, `situation_choice`, `read_meaning`) | the day-questions renderer and its feedback |
| `pick_meaning`, `pick_tl`, `choose_article`, `complete_phrase` | the vocab_flow micro-check components |
| `listen_pick_image` | the **"لاقي الصورة"** step (`FindImageStep`), grouped into blocks of up to 6 rounds |
| progress / end | the lesson progress bar (counts) and the day-questions end screen fed with session data |

- No new screen, layout or component.
- A type that can't render in an existing component is never picked.
- Micro checks and "لاقي الصورة" rounds count as recognition (stage 2).

### 2.2 The daily time budget (decided 2026-11-21)

The builders fill **time**, not a fixed count. Each step has an estimated time, and a session is filled until its budget is used.

**Estimated time per step** (tuned later from real timings, logged per type):

| Step | Seconds |
|---|---|
| card | 18 |
| micro check, choice, listening choice | 18 |
| "لاقي الصورة" round | 15 |
| `fill_blank_choice` | 20 |
| `build_sentence` | 35 |
| `dictation`, `fill_blank_write` | 35 |
| `translate_write`, `reply_write` | 45 |
| `say_it`, `reply_speak` | 30 |

**Default split of a 30-minute day:**

| Day | Lesson | Review | Cards |
|---|---|---|---|
| a new lesson today | 10 | **14** (~28–30 steps) | 6 (~20 cards) |
| no new lesson ("بكرة", or today's lesson already done before the review was built) | 0 | **21** | 9 |

- **Review always gets the largest share.** Of the time freed when there's no lesson, review takes 70% and cards 30%.
- **Order the app suggests:** cards first as a short warm-up, then the lesson, then the review. The review is never skipped in suggestions, and on a "بكرة" day it's the first suggestion.
- **Rounds:** the review is split into rounds of about **5 minutes**. The last round takes whatever is left.
  - Round 1 counts for the streak.
  - Finishing every round = "خلصت مراجعة النهارده".
  - Rounds the learner doesn't do wait for tomorrow (§5.3).
- **Per-user config (later):** `v2_users.practice` holds `daily_minutes` (default 30, from env `PRACTICE_DAILY_MINUTES`) and an optional `split` override.
  - For now only the default and an admin edit exist.
  - A settings choice (for example 15 / 20 / 30 / 45 minutes) comes later. The builders already read the user's value, so adding it is settings UI only.
  - The split rule stays the same at any size: review is always the largest share, and cards stay at least 3 minutes.
- **Time is planned, not enforced.** There's no timer on screen and nothing is cut mid-round. Progress shows counts ("جولة ٢ من ٣ · ٤ من ١٠") and minutes left only as a quiet estimate ("حوالي ٥ دقايق").

---

## 3. The window (shared by both sessions)

- **Current day** = the first day that isn't `completed`.
- **Window** = the **3 most recent completed lessons before the current day**, newest first.
  - Only lessons with core items count. Weekly story days are skipped, and the window reaches one lesson further back.
  - Day 1 → empty. Day 2 → [1] · day 3 → [2, 1] · day 4 → [3, 2, 1] · day 5 → [4, 3, 2].
- **Positions:** each lesson spends 3 days in the window, as position 1 (newest), then 2, then 3 (oldest).
- **Lessons, not the calendar.** A week away gives the same window.
- **Built once a day,** at the first open of either session, and stored for both. The lesson / no-lesson split of §2.2 is decided at that moment.
- **Cards weight:** 50 / 30 / 20 by position. Review uses coverage (§5).

### 3.1 Items that leave the window

- **At افتكرتها+:** the item keeps its SRS ladder in a small **"تثبيت"** share when due.
- **Below افتكرتها:** it comes back only as weak.
- **Uncovered review pairs** go to weak (§5.5).
- **اتحفظت items** leave regular review, with an occasional maintenance check (about every 60 days, at most 1 per session).
- **Grammar never fully leaves.** See the cumulative grammar share in §5.4.

---

## 4. "كروت النهارده" (flashcards, warm-up)

- **Size:** as many cards as the cards budget allows (≈ 20 on a lesson day, ≈ 30 on a no-lesson day). At most 10 new to review. "صعب" repeats are outside the count.
- **Shares:**

| Share | Of the cards | Source |
|---|---|---|
| Weak | up to 25% | first-try miss or "صعب" in the last 7 days; window first, at most 2 from outside |
| Window | the rest | due or not-yet-reviewed window items, 50 / 30 / 20 |
| تثبيت | up to 15% | due items outside the window at افتكرتها+, plus at most 1 اتحفظت check |

- **Ranking** (code only):
  1. essential first;
  2. weak, then due, then new;
  3. most overdue;
  4. newest lesson;
  5. lower stage.
- **Order:** newest lesson → oldest. Weak cards spread through the run; تثبيت cards last.
- **Word reading:** a card rated right is the reading check for a word, so the review doesn't spend a question on it.
- **Extras:** an optional extra round of ~3 minutes is offered once. End uses the existing deck end with the stage-up list.

---

## 5. "مراجعة النهارده" (the priority session)

### 5.1 The coverage plan of a lesson

Built once when a lesson enters the window:

| Item kind | Pairs to cover |
|---|---|
| word | listening, writing (reading comes from its card) |
| verb | listening, writing of **each form the day taught** (for example preciso / precisa) |
| phrase | listening, **sentence building** (`build_sentence` from its tiles), writing, speaking |
| grammar pattern | **4 checks** across the 3 days: recognition (`fill_blank_choice`), building (`build_sentence`), writing (`fill_blank_write` or `translate_write` of a full sentence), use (`reply_write` or `reply_speak` that needs the pattern) |
| real-world phrase | listening only |

- **Removed from the plan:** pairs already passed first try in the lesson (day questions, grammar checks, "لاقي الصورة", role-play).
- **Combined answers:**
  - a correct phrase `dictation` covers listening + writing;
  - a correct full-sentence production covers the writing of its core words and the "use" check of the pattern it contains.
- **Speaking until STT is live:** a self-rated answer covers the plan pair only, not SRS. At most 4 a day.

### 5.2 Skills follow the position

- **Position 1:** listening and recognition (`listen_*`, a "لاقي الصورة" block, micro checks, `fill_blank_choice`).
- **Position 2:** building and writing (`build_sentence`, `dictation`, `fill_blank_write`, `translate_write`).
- **Position 3:** use (`reply_write`, `reply_speak`, `say_it`), plus every pair still uncovered ("last chance").
- A weak pair, or a pair with no question at its position, moves earlier.

### 5.3 What fills the review budget (in priority order)

1. **Last chance:** uncovered pairs of the lesson at position 3.
2. **Weak:** items with a recent first-try miss, in the skill they missed, plus open-problem questions (§5.5).
3. **Grammar and sentence building:** the grammar share (§5.4).
4. **Today's plan pairs** for the 3 window lessons.
5. **Due retests** (item × skill SRS due again).
6. **تثبيت:** at most 2 steps.

- Steps are added in this order until the budget is full. Anything left waits for tomorrow, and tomorrow's last-chance pairs come first.
- On a typical lesson day the 14 minutes hold about 28 steps, which covers the ~20 coverage steps of the window with room for grammar and weak points. On a no-lesson day the 21 minutes also let the learner catch up.

### 5.4 Grammar and sentence-building focus

- **At least 40% of the review time** goes to grammar and sentence building:
  - `fill_blank_choice`, `fill_blank_write`, `build_sentence`;
  - full-sentence `translate_write`;
  - `reply_*` that need a pattern;
  - questions on open grammar problems.
- **Sentence building on phrases:** every phrase gets a `build_sentence` pair (§5.1). Code builds the tiles from the phrase itself and adds 1–2 distractor tiles (for example a wrongly placed `me`, a missing `de`, a Brazilian form).
- **Cumulative grammar:** grammar builds on itself, so the share also includes **1–3 steps a day on patterns from lessons before the window**:
  - patterns the learner got wrong first;
  - then patterns not tested for the longest time;
  - only patterns already taught.
  These use the same pattern SRS as everything else. They're the one thing that keeps coming back after a lesson leaves the window, even below stage 3.
- **Mixed-pattern sentences:** once at least 2 patterns are taught, at least 1 step a day asks for a sentence that combines today's window pattern with an older one (for example ser + a contraction). It's taken from the day sets or story lines when one exists, never invented.
- **Grammar feedback** uses the existing one-line why. On a known common-mistake pair, it shows the wrong → right pair from the grammar page.

### 5.5 Weak points

- Up to 25% of the review time: items with a recent first-try miss, in the skill they missed, and **at least 2 steps on every open problem** (`11` §4) when its patterns appear in any bank up to the current day.
- At least 2 weak steps are in round 1.
- Uncovered pairs from lessons that left the window: at most 2 a day, oldest first.

### 5.6 The question pool

- **Crafted:** the day sets (`use: practice | both`) are preferred.
- **Code-built:** when a pair has no crafted question, code builds one from the item bank with the existing templates, with no model call: `listen_*`, `dictation`, `translate_write` from `ar`, `fill_blank_*` and `build_sentence` from pattern examples, phrases and story lines, `say_it`, micro-check types, and "لاقي الصورة" rounds. Distractors follow `00` §7 and the "لاقي الصورة" rules.
- **Only types the existing components render.**
- **No repeats:** never the exact question answered in the last 3 days. Prefer a type not used on that pair recently.
- **Items in today's cards** get a production or building question, never a meaning question.
- **"لاقي الصورة" blocks** only with at least 4 carded items that have images; otherwise the fallback type.

### 5.7 Order inside a round

- Each round opens easy (a "لاقي الصورة" block or choice types), moves to building and writing, and ends with one use step.
- Lessons and skills are mixed, never more than 3 of the same type in a row.
- Every round has at least one grammar step.

### 5.8 Round and session end

- The existing day-questions end screen, fed with the round count and the stage-up list.
- At the session end it also shows: for each window lesson "اتراجع كله ✓" or "فاضل N", one grammar focus line (the weakest pattern or open problem), and the next-round button.

---

## 6. Mastery stages (fed by both sessions)

Each stage needs evidence on **a different local day from the stage before it**.

| Stage | Name | Reached when |
|---|---|---|
| 1 | **اتعرّفت** | seen in the lesson (`introducedDay`) |
| 2 | **راجعتها** | on a later day, a correct first-try recognition: a card rated متوسط / سهل without a hint, a micro check, `listen_meaning`, `read_meaning`, `listen_pick_*`, or a "لاقي الصورة" round |
| 3 | **افتكرتها** | on a later day than stage 2, a correct first-try production: `translate_write`, `fill_blank_write`, `dictation`, `build_sentence`, graded `say_it` / `reply_*`, or a correct use in a conversation or role-play |
| 4 | **اتحفظت ✓** | card interval ≥ 21 days **and** correct use in 2 situations (3 for essential) |

- **Situations:** a review question counts as the situation of its lesson. Cards never count.
- **Going down:** a miss at 3 → 2 and the item is marked weak. A miss at 2 → it stays at 2, marked weak. A miss on an اتحفظت check → back to 3. Nothing goes below 1.
- **"عارفها"** → stage 3, never 4.
- **Patterns** have the same stages. They're shown only inside grammar focus lines, not in the home word count.
- **Storage:** `v2_item_state` gets `stage`, `stage_at` and the first recognition and recall dates. Only `/api/v2/answers` writes them.

---

## 7. Sessions, progress, streak

- **`v2_card_decks`** (existing) adds `window`, `budget_minutes`, a slot reason per card, and `round`. Built once, resumable.
- **`v2_review_sessions`** (new, one per user × local date) holds:
  - `window`, `budget_minutes`, `has_lesson_today`;
  - the ordered steps (question / micro_check / find_image block), each with its lesson, the pairs it covers, slot reason (last_chance | weak | grammar | cumulative_grammar | plan | retest | maint), estimated seconds, round and result;
  - `rounds_total`, `rounds_done`, `status`.
  It's built once and resumable. User-keyed, so it joins the A5 list.
- **`v2_coverage_plans`** (new, one per user × lesson): pairs with status (open | covered | carried_to_weak). User-keyed, so it joins the A5 list.
- **`v2_users.practice`:** `daily_minutes`, optional `split`.
- **Real time per step** is logged (from the existing active-minutes events) so the estimates in §2.2 can be tuned.
- **Writes:** every result goes to `/api/v2/answers` **and** `/api/v2/progress/events` (same `event_id`). Only the events route updates coverage plans.
- **Streak:** round 1 of the review **or** finishing the cards counts (replaces "finished the daily deck" in `11` §7.2).
- **Cache:** the summary cache is invalidated on a stage change.

---

## 8. Home (inside existing home components)

- Two entries of the existing deck-entry component:
  - "مراجعة النهارده · ١٤ دقيقة · ٣ جولات", listed first;
  - "كروت النهارده · ٦ دقايق".
- Each shows ✓ when done and "جولة ٢ من ٣" while in progress.
- On a "بكرة" day the hero suggestion line is the review first.
- **Mastery count** in an existing summary card:
  - "اتحفظت ٤٢ كلمة · و ١٢ جملة" (summary block `mastery`: `mastered_words`, `mastered_phrases`, `recalled`, `reviewing`, `mastered_today`);
  - before the first graduation: "افتكرت N كلمة";
  - the count can go down silently; custom-deck words aren't counted.
- **"كلماتي"** is deferred. It can later reuse the deck-detail list with a stage filter.

---

## 9. Tasks for Cursor

One task per session, in order, tests included, stop at "Done when". Prompt:

> Read docs/az-talkie-v2/16-practice-engine.md (whole), 00-decisions.md §4 §5 §7 §8b, 11-profile-progress.md §4 §5 §7, 13-step-progress.md and AGENTS.md. Implement task **E-x only**. Do not start the next task. The user id always comes from the session helper. Only `/api/v2/answers` writes item state and stages; only `/api/v2/progress/events` writes session documents, coverage plans and activity. No model calls in the builders. Do not create new screens or components: render every step with the existing card, day-question, micro-check and FindImageStep components. Never write Portuguese or Arabic content yourself. No percentages and no on-screen timer. Write the tests the task asks for. Stop when "Done when" is met and list the files you changed.

**E0 · Write the decisions**
- Do: copy this doc into `docs/`; add a §5c line to `00` (30-minute budget, review first, grammar focus, cards warm-up, window of 3 lessons, stages, reuse-only screens); mark `11` §5.1 as replaced; link from the README.
- Done when: docs updated, nothing else changed.

**E1 · Stages in the answers route**
- Do: §6 stage function and fields, for items and patterns; backfill (dry run first).
- Tests:
  - same-day recognition + production → 2 only;
  - next-day production → 3;
  - cards and micro checks alone never pass 2;
  - a miss at 3 → 2;
  - cards never count as a situation;
  - essential needs 3 situations;
  - "عارفها" stops at 3.
- Done when: tests pass.

**E2 · Budget, window and shared queue (pure)**
- Do:
  - §2.2: the step-time table, the lesson / no-lesson split, the 70 / 30 rule for freed time, `v2_users.practice` with the env default, rounds of ~5 minutes;
  - §3 and §3.1: window, positions, ranking with the budget passed in.
- Tests:
  - 30 minutes with a lesson → review 14, cards 6;
  - without a lesson → review 21, cards 9;
  - a user value of 15 keeps review the largest share and cards at least 3;
  - day 4 → [3, 2, 1]; day 5 → [4, 3, 2]; story days skipped;
  - a 7-day absence gives the same window.
- Done when: tests pass.

**E3 · "كروت النهارده"**
- Do: §4 filled to the cards budget, into `v2_card_decks`, resumable, with the existing deck card.
- Tests:
  - a lesson day gives ~20 cards and a no-lesson day ~30;
  - at most 10 new;
  - weak at most 25% (at most 2 from outside the window);
  - repeats outside the count;
  - same cards on two opens.
- Done when: on day 5 Omar's cards come from days 4, 3, 2 only (plus allowed weak / تثبيت) and take about 6 minutes.

**E4 · Coverage plans**
- Do: §5.1 plans (phrase building pairs, 4 pattern checks, verb forms), create on window entry, close on exit, uncovered → weak.
- Tests:
  - phrase = 4 pairs, word = 2, pattern = 4;
  - pairs passed in the lesson are removed;
  - dictation covers 2 pairs;
  - a full-sentence production covers its words' writing and the pattern's use check;
  - self-rated speaking covers the plan pair only.
- Done when: tests pass and Omar's day 3 plan looks right to him.

**E5 · Code-built steps**
- Do: §5.6 templates for every type in §2.1, `build_sentence` tiles with 1–2 distractor tiles from known common mistakes, grouped "لاقي الصورة" blocks.
- Tests:
  - every pair kind in days 1, 3 and 22 gets a step;
  - tiles always rebuild the exact sentence;
  - distractor tiles come only from known mistake pairs or taught items;
  - no future-day distractors;
  - "لاقي الصورة" only with at least 4 carded items.
- Done when: tests pass.

**E6 · "مراجعة النهارده" session**
- Do:
  - §5.2–5.8: the priority fill order, the grammar share of at least 40% time, cumulative grammar 1–3 a day, a mixed-pattern step once 2 patterns are taught, weak up to 25% with 2 per open problem, positions → skills, last chance, rounds of ~5 minutes, order inside a round, no repeats, existing end screen;
  - `v2_review_sessions`;
  - the session wrapper;
  - coverage updates through the events route.
- Tests:
  - grammar steps take at least 40% of planned time;
  - every round has a grammar step;
  - cumulative grammar picks only taught patterns, wrong ones first;
  - the last chance comes first the next day;
  - budget respected within one step;
  - `use: lesson` never picked;
  - window shared with the cards.
- Done when: on day 5 Omar's review fills ~14 minutes in ~3 rounds, covers days 4, 3, 2 plus older grammar and weak points, every step looks like its lesson version, and the end screen shows "Dia 2 · اتراجع كله ✓".

**E7 · Home entries and mastery count**
- Do: §8 with existing components; the `mastery` summary block.
- Tests: counts match a seeded user; no query on `v2_errors`; custom-only items not counted.
- Done when: Omar's home shows the review first, the cards second, and the mastery line.

---

## 10. Decisions and defaults

Decided (Omar, 2026-11-21):

1. **The daily session is 30 minutes.** Review is the priority and takes the largest share: 14 minutes on a lesson day, 21 without one.
2. **Extra focus on grammar and sentence building:** at least 40% of review time, `build_sentence` for every phrase, 4 checks per pattern, cumulative grammar from older lessons.
3. **Per-user config later:** `daily_minutes` per user, default 30; the settings UI comes later.
4. **No new screens:** cards, day questions, micro checks and "لاقي الصورة" are reused.

Defaults (Omar can change them):

5. The window is 3 **lessons**; story days are skipped.
6. Cards are a 6-minute warm-up (9 without a lesson); either the cards or review round 1 keeps the streak.
7. Uncovered pairs get a last chance, then go to weak; items that leave the window keep a small تثبيت share.
8. The home count can go down silently; before the first graduation it shows "افتكرت N".
