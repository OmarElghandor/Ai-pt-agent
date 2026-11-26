# 16 · Practice engine: daily flashcards + daily review, time-budgeted, review first

Status: plan, 2026-11-21. Decided the same day:
- flashcards stay their own module;
- review size comes from coverage;
- no new screens;
- a 30-minute daily session where review takes the biggest share, with extra weight on grammar and sentence building, and the budget configurable per user later.

**Added 2026-11-22:** a footer tab "مراجعة" that builds and saves the day's practice on tap, and an answer log that links every answer to its question for level tracking (§8, §9).

App: **az-talkie** (A-Z Talkie). Author: Omar + Claude. Implementation: Cursor.

Read first: `00-decisions.md` (§4 vocab_flow micro checks and "لاقي الصورة", §5, §7, §8, §8b), `11-profile-progress.md` (§4, §5, §7), `13-step-progress.md`, `AGENTS.md`. Where this doc disagrees with `00` §5 or `11` §5 about the daily deck, **this doc wins**, and task E0 writes the change into `00` (including the 2026-11-22 footer tab and answer-log bullets in §5c).

No code in this document by design.

---

## 1. The feature in one paragraph

The learner's day is a **30-minute budget**. In it, **review is the priority and takes the largest share**, then the new lesson, then flashcards.

- **"مراجعة النهارده"** asks questions on the last 3 completed lessons. It is sized to cover every item × skill, with **extra weight on grammar and sentence building**, and weak points come first.
- **"كروت النهارده"** is the flashcards module, a shorter warm-up.

Both draw from a **sliding window of the last 3 completed lessons**, newest first (day 4 → 3 · 2 · 1; day 5 → 4 · 3 · 2). Both feed the same mastery stages: اتعرّفت → راجعتها → افتكرتها → اتحفظت.

- The review opens from its own **footer tab**. The first tap of the day builds the session and saves it.
- **Every answer is saved and linked to its question**, so the learner's level can be tracked per skill, per pattern and per lesson.
- Home shows "اتحفظت ٤٢ كلمة" **(replaced by `17` §9.1: "بتقولها N · بتفهمها M")**.

Every step renders with a screen the lessons already have (§2.1). The engine is logic plus a session wrapper.

Naming: "اتمرّن على الدرس" stays the conversation / role-play step on the home hero (`13` §5).

---

## 2. What changes and what is reused

- **Flashcards module:** stays its own module and session (`v2_card_decks`). The window mix in §4 replaces the 9 / 4 / 2 split of `00` §5 and `11` §5.1.
- **Review:** its own session (`v2_review_sessions`, §7), opened from the new footer tab (§8).
- **Reused, unchanged:**
  - the day question sets (`00` §7, `use: practice | both`);
  - `/api/v2/answers` as the only writer of item state (and now of the answer log, §9);
  - `/api/v2/progress/events` as the only writer of sessions and activity;
  - weak spots by problem (`11` §4);
  - essential items first (`00` §5).
- **Out of scope:** custom and official themed decks keep their own sessions (`12` §2.6) and are not in the home mastery count.

### 2.1 Screens: reuse only

> **(changed 2026-11-24)** The daily review UI is a coach chat — see `18-review-chat-ui.md`. That doc wins over this §2.1 for the review session only. Lessons, cards, and other modules keep the reuse-only screens below.

| Step | Existing component |
|---|---|
| card | the flashcards deck card |
| any day-question type (`listen_*`, `dictation`, `translate_write`, `fill_blank_*`, `build_sentence`, `say_it`, `reply_*`, `situation_choice`, `read_meaning`) | the day-questions renderer and its feedback |
| `pick_meaning`, `pick_tl`, `choose_article`, `complete_phrase` | the vocab_flow micro-check components |
| `listen_pick_image` | the **"لاقي الصورة"** step (`FindImageStep`), grouped into blocks of up to 6 rounds |
| progress / end / empty state | the lesson progress bar (counts), the day-questions end screen fed with session data, and the existing empty-state card |
| footer tab | the existing tab-bar item component and the existing outline icon set |

- No new screen, layout or component.
- A type that can't render in an existing component is never picked.
- Micro checks and "لاقي الصورة" rounds count as recognition (stage 2).

### 2.2 The daily time budget (decided 2026-11-21)

The builders fill **time**, not a fixed count. Each step has an estimated time, and a session is filled until its budget is used.

**Estimated time per step** (tuned later from real timings in the answer log, §9.3):

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
- **Order the app suggests:** cards first as a short warm-up, then the lesson, then the review. On a "بكرة" day the review is the first suggestion.
- **Rounds:** the review is split into rounds of about **5 minutes**. The last round takes whatever is left.
  - Round 1 counts for the streak.
  - Finishing every round = "خلصت مراجعة النهارده".
  - Rounds not done wait for tomorrow (§5.3).
- **Per-user config (later):** `v2_users.practice` holds `daily_minutes` (default 30, from env `PRACTICE_DAILY_MINUTES`) and an optional `split` override.
  - For now only the default and an admin edit exist.
  - The builders already read the user's value, so a settings choice later is settings UI only.
  - The split rule holds at any size: review is always the largest share, and cards stay at least 3 minutes.
- **Time is planned, not enforced.** There's no timer on screen and nothing is cut mid-round. Progress shows counts ("جولة ٢ من ٣ · ٤ من ١٠").

---

## 3. The window (shared by both sessions)

- **Current day** = the first day that isn't `completed`.
- **Window** = the **3 most recent completed lessons before the current day**, newest first.
  - Only lessons with core items count. Weekly story days are skipped, and the window reaches one lesson further back.
  - Day 1 → empty. Day 2 → [1] · day 3 → [2, 1] · day 4 → [3, 2, 1] · day 5 → [4, 3, 2].
- **Positions:** each lesson spends 3 days in the window, as position 1 (newest), then 2, then 3 (oldest).
- **Lessons, not the calendar.** A week away gives the same window.
- **Built once a day,** at the first open of either session (the review tab tap or the cards entry), and stored for both. The lesson / no-lesson split of §2.2 is decided at that moment.
- **Cards weight:** 50 / 30 / 20 by position. Review uses coverage (§5).

### 3.1 Items that leave the window

- **At افتكرتها+:** the item keeps its SRS ladder in a small **"تثبيت"** share when due.
- **Below افتكرتها:** it comes back only as weak.
- **Uncovered review pairs** go to weak (§5.5).
- **اتحفظت items** leave regular review, with an occasional maintenance check (about every 60 days, at most 1 per session).
- **Grammar never fully leaves** (cumulative grammar, §5.4).

---

## 4. "كروت النهارده" (flashcards, warm-up)

- **Size:** as many cards as the cards budget allows (≈ 20 on a lesson day, ≈ 30 on a no-lesson day). At most 10 new to review. "صعب" repeats are outside the count.
- **Shares:**

| Share | Of the cards | Source |
|---|---|---|
| Weak | up to 25% | first-try miss or "صعب" in the last 7 days; window first, at most 2 from outside |
| Window | the rest | due or not-yet-reviewed window items, 50 / 30 / 20 |
| تثبيت | up to 15% | due items outside the window at افتكرتها+, plus at most 1 اتحفظت check |

- **Ranking** (code only): **(replaced 2026-11-23 by `17` §7)** priority score (item weight × learner need), highest first; ties → most overdue, then newest lesson. Shares above stay; inside each share, pick by score. The older essential → weak → due → new → overdue → newest → lower-stage list is retired.
- **Order:** newest lesson → oldest. Weak cards spread through the run; تثبيت cards last.
- **Word reading:** a card rated right is the reading check for a word, so the review doesn't spend a question on it.
- **Extras:** an optional extra round of ~3 minutes is offered once. End uses the existing deck end with the stage-up list.
- **Answer log:** card ratings are logged too (§9.2).

---

## 5. "مراجعة النهارده" (the priority session)

### 5.1 The coverage plan of a lesson

Built once when a lesson enters the window:

| Item kind | Pairs to cover |
|---|---|
| word | listening, writing; plus recognition + speaking when it has its own ready picture (image_pick_tl / image_write / image_say) |
| verb | listening, writing of **each form the day taught** |
| phrase | listening, **sentence building** (`build_sentence`), writing, speaking |
| grammar pattern | **4 checks** across the 3 days: recognition (`fill_blank_choice`), building (`build_sentence`), writing (`fill_blank_write` or a full-sentence `translate_write`), use (`reply_write` or `reply_speak` that needs the pattern) |
| real-world phrase | listening only |

- **Removed from the plan:** pairs already passed first try in the lesson (day questions, grammar checks, "لاقي الصورة", role-play). The answer log (§9) is where that's read from.
- **Combined answers:**
  - a correct phrase `dictation` covers listening + writing;
  - a correct full-sentence production covers the writing of its core words and the pattern's "use" check.
- **Speaking until STT is live:** a self-rated answer covers the plan pair only, not SRS. At most 4 a day.

### 5.2 Skills follow the position

- **Position 1:** listening and recognition (`listen_*`, a "لاقي الصورة" block, micro checks, `fill_blank_choice`).
- **Position 2:** building and writing (`build_sentence`, `dictation`, `fill_blank_write`, `translate_write`).
- **Position 3:** use (`reply_write`, `reply_speak`, `say_it`), plus every pair still uncovered ("last chance").
- A weak pair, or a pair with no question at its position, moves earlier.

### 5.3 What fills the review budget (in priority order)

1. **Last chance:** uncovered pairs of the lesson at position 3.
2. **Weak:** items with a recent first-try miss, in the skill they missed, plus open-problem questions (§5.5).
3. **Grammar and sentence building** (§5.4).
4. **Today's plan pairs** for the 3 window lessons.
5. **Due retests** (item × skill SRS due again).
6. **تثبيت:** at most 2 steps.

- Steps are added in this order until the budget is full. Anything left waits for tomorrow, and tomorrow's last-chance pairs come first.
- **Weakest skill boost:** the skill with the lowest first-try correct count ratio over the last 14 days (from the level view, §9.3) gets about 10% more of the plan and retest time. This happens only once the learner has at least 40 logged answers.

### 5.4 Grammar and sentence-building focus

- **At least 40% of the review time** goes to grammar and sentence building: `fill_blank_choice`, `fill_blank_write`, `build_sentence`, full-sentence `translate_write`, `reply_*` that need a pattern, and questions on open grammar problems.
- **Sentence building on phrases:** every phrase gets a `build_sentence` pair. Code builds the tiles from the phrase and adds 1–2 distractor tiles from known common mistakes (a wrongly placed `me`, a missing `de`, a Brazilian form).
- **Cumulative grammar:** 1–3 steps a day on patterns from lessons before the window, using the pattern SRS and only patterns already taught. Wrong patterns come first, then the ones not tested for the longest time.
- **Mixed-pattern sentences:** once at least 2 patterns are taught, at least 1 step a day combines a window pattern with an older one. It's taken from the day sets or story lines, never invented.
- **Grammar feedback** uses the existing one-line why. On a known common-mistake pair it shows the wrong → right pair from the grammar page.

### 5.5 Weak points

- **Up to 25% of the review time:**
  - items with a recent first-try miss, in the skill they missed;
  - **at least 2 steps on every open problem** (`11` §4) whose patterns appear in any bank up to the current day.
- At least 2 weak steps are in round 1.
- Uncovered pairs from lessons that left the window: at most 2 a day, oldest first.

### 5.6 The question pool

- **Crafted:** the day sets (`use: practice | both`) are preferred.
- **Code-built:** when a pair has no crafted question, code builds one with the existing templates and no model call. The question is **saved once in the shared question store** (§9.1) and reused by every learner.
- **Only types the existing components render.**
- **No repeats:** never the exact question (same question id) answered in the last 3 days, checked against the answer log. Prefer a type not used on that pair recently.
- **Items in today's cards** get a production or building question, never a meaning question.
- **"لاقي الصورة" blocks** only with at least 4 carded items that have images; otherwise the fallback type.
- **Flagged questions** (§9.3) are never picked.

### 5.7 Order inside a round

- Each round opens easy (a "لاقي الصورة" block or choice types), moves to building and writing, and ends with one use step.
- Lessons and skills are mixed, never more than 3 of the same type in a row.
- Every round has at least one grammar step.

### 5.8 Round and session end

- The existing day-questions end screen, fed with the round count and the stage-up list.
- At the session end it also shows:
  - for each window lesson, "اتراجع كله ✓" or "فاضل N";
  - one grammar focus line;
  - the extra-round button.

---

## 6. Mastery stages (fed by both sessions)

Each stage needs evidence on **a different local day from the stage before it**.

| Stage | Name | Reached when |
|---|---|---|
| 1 | **اتعرّفت** | seen in the lesson (`introducedDay`) |
| 2 | **راجعتها** | on a later day, a correct first-try recognition: a card rated متوسط / سهل without a hint, a micro check, `listen_meaning`, `read_meaning`, `listen_pick_*`, or a "لاقي الصورة" round |
| 3 | **افتكرتها** | on a later day than stage 2, a correct first-try production: `translate_write`, `fill_blank_write`, `dictation`, `build_sentence`, graded `say_it` / `reply_*`, or a correct use in a conversation or role-play |
| 4 | **اتحفظت ✓** | card interval ≥ 21 days **and** correct use in 2 situations (3 for essential) |

- **(extended 2026-11-23 by `17` §8.3)** "Learned" depends on authored `target`: **produce** items keep stage 4 اتحفظت as above; **understand** items count as learned at stage 2 **راجعتها** held over an interval ≥ 21 days (no production). Detail: `17`.
- **Situations:** a review question counts as the situation of its lesson. Cards never count.
- **Going down:** a miss at 3 → 2 and the item is marked weak. A miss at 2 → it stays at 2, marked weak. A miss on an اتحفظت check → back to 3. Nothing goes below 1.
- **"عارفها"** → stage 3, never 4.
- **Patterns** have the same stages. They're shown only inside grammar focus lines and the level view, not in the home word count.
- **Storage:** `v2_item_state` gets `stage`, `stage_at` and the first recognition and recall dates. Only `/api/v2/answers` writes them. Each stage move also records the answer id that caused it (§9.2).

---

## 7. Sessions, progress, streak

- **`v2_card_decks`** (existing) adds `window`, `budget_minutes`, a slot reason per card, and `round`. Built once, resumable.
- **`v2_review_sessions`** (new, one per user × local date, unique) holds:
  - `window`, `budget_minutes`, `has_lesson_today`, `builder_version`;
  - the ordered steps (question / micro_check / find_image block). Each step has:
    - its **question id and version** (§9.1) and a **frozen copy** of what was shown;
    - lesson, pairs covered, slot reason (last_chance | weak | grammar | cumulative_grammar | plan | retest | maint);
    - estimated seconds, round;
    - the **answer id** of its first try once answered.
  - `rounds_total`, `rounds_done`, `status` (open | done), `resume` (round + step), `built_at`, `done_at`.
  - It's built once and resumable. User-keyed, so it joins the A5 list.
- **`v2_coverage_plans`** (new, one per user × lesson): pairs with status (open | covered | carried_to_weak) and the answer id that covered each. User-keyed, so it joins the A5 list.
- **`v2_users.practice`:** `daily_minutes`, optional `split`.
- **Writes:** every result goes to `/api/v2/answers` (grading, answer log, item state, stages) **and** to `/api/v2/progress/events` (session step, coverage, activity), with the same `event_id`. Only the events route updates sessions and coverage plans.
- **Streak:** round 1 of the review **or** finishing the cards counts (replaces "finished the daily deck" in `11` §7.2).
- **Cache:** the summary cache is invalidated on a stage change.

---

## 8. Footer tab "مراجعة" (new 2026-11-22)

### 8.1 The tab

- The bottom tab bar gets a fifth tab, in this order: **المسار · مراجعة · الكروت · اتكلّم · المكتبة**.
- It uses the existing tab-bar item component and an outline icon from the existing icon set (a circular-arrows "repeat" icon). Active / inactive colours follow the tab-bar rules (`ink` filled when active, `chrome-muted` when not).
- **A small dot** on the icon while today's review isn't finished. There's no number on it, and no dot on day 1 or when the window is empty.
- At 390px five tabs fit with short labels. If a label doesn't fit, the label shortens; the icon stays.

### 8.2 What a tap does

The tab opens the review page (inside the `(v2)` group). On the server, in this order:

1. **Look for today's session** (`v2_review_sessions`, user × local date).
2. **It exists:** open it at `resume` (round + step).
   - If it's `done`, open its end screen with the extra-round button.
3. **It doesn't exist:** build it now and save it, then open step 1.
   - The builder is code only, with no model call. Target build time is under 1 second.
   - The build writes the session, creates any missing coverage plans for window lessons, and saves any new code-built questions to the shared store (§9.1).
4. **The window is empty** (day 1, or no completed lesson): show the existing empty-state card "خلّص أول درس ونبدأ نراجع سوا" with a button to the current lesson. **Nothing is saved.**

Rules for the build:

- **Idempotent:** the unique key user × local date, plus a short build lock. Two quick taps, two tabs or two devices get the same session, built once.
- **Only on the learner's tap** (or the home entry, which opens the same page). There's no nightly pre-build, so inactive learners cost nothing.
- **The extra round** (from the end screen) is built the same way and **appended to the same session** as round N+1. It's never a second session.
- **Lesson regeneration doesn't change a saved session:** steps keep their frozen copy and question version. Tomorrow's session uses the new lesson.
- **The home entry** "مراجعة النهارده" and the tab open the **same** session.

---

## 9. Saving the practice and linking every answer (new 2026-11-22)

### 9.1 Every question has a stable id

- **Crafted questions** keep their lesson question id, plus the lesson version they came from.
- **Code-built questions** are saved in a **shared store**, `v2_practice_questions` (shared content, **not** user-keyed).
  - The id is **deterministic**, built from: language, type, the tested item / pattern ids, the source sentence or template id, and `builder_version`. The same question for any learner gets the same id, so it's built once and reused.
  - Each entry holds the full renderable content (prompt `rt`, options, tiles, accepted answers, near misses, image refs, audio keys), plus skill, `tests` (item ids, pattern ids, problem ids), lesson day, and status (active | flagged | retired).
  - A new `builder_version` makes new ids. Old entries stay, so old answers still point at what was shown.
- **Sessions store a frozen copy** of each shown step, so grading and replays always match what the learner saw.

### 9.2 The answer log: `v2_answers`

- **One document per attempt**, append-only, written **only by `/api/v2/answers`** (which already grades). It covers every source, so level tracking sees everything: review steps, day questions, grammar checks, micro checks, "لاقي الصورة" rounds, card ratings and role-play beats.
- **Each document holds:**
  - user, local date, created_at;
  - `question_id` + `question_version` (for cards: the item id with kind `card`);
  - `source`: review | lesson | grammar_check | micro | find_image | cards | roleplay | convo;
  - `session_id`, round and step index, when the source has a session;
  - `attempt` number and `first_try` (true / false);
  - the **answer given**: option id, typed text, tile order, card rating, or self-rating. Speaking keeps the transcript once STT is live, and never the audio;
  - `verdict`: correct | near_miss | wrong | unclear | self_rated, plus `hint_used`;
  - `skill`, `tests` (item ids, pattern ids), lesson day, window position (for review steps);
  - the `v2_errors` id when a mistake was logged, so the classifier's problem label can be joined later;
  - `time_ms` (from the step opening to the answer, capped at 3 minutes);
  - the stage moves it caused (item, from → to).
- **Indexes:** user × created_at; user × question_id (for the 3-day no-repeat check); user × skill × local date; user × lesson day; question_id × first_try (for question stats).
- **User-keyed**, so it joins the A5 deletion list. When an account is deleted, its answers go; question stats keep only the counts already aggregated, with no user ids.
- **The log is evidence; nothing reads it on the answer path.** Item state, stages, coverage and weak spots keep their own documents (fast reads). The log is what they can be rebuilt from, and what the level view reads.

### 9.3 Tracking the learner's level

- **A level view per user,** `v2_user_level` (one doc, rebuilt by a background job a few minutes after answers, debounced, and nightly). It holds:
  - **per skill** (listening, reading, writing, speaking, grammar): first-try correct and attempts in the last 14 days, the previous 14 days for the trend, and the average time per type;
  - **per pattern:** stage, last result, first-try correct / attempts;
  - **per lesson:** covered pairs / total pairs, and the date the lesson left the window;
  - **per problem:** links to `v2_weak_spots` (no copy).
- **Who uses it:**
  - **the review builder:** the weakest-skill boost (§5.3) and the cumulative grammar order (§5.4);
  - **the time estimates of §2.2:** the median `time_ms` per type replaces the default once there are enough answers (per user after 30 answers of that type, global otherwise);
  - **the learner, as counts only:** the existing "بتفهم N · بتقول M", and later a per-skill line in settings such as "استماع: ٤٢ صح من ٥٠ في آخر أسبوعين". Never a percentage, never a level label;
  - **admin**, who can see percentages and trends per learner, and **per-question stats** (attempts, first-try correct, average time, most common wrong answer). A question with at least 20 first tries and under 30% correct is **flagged** automatically; flagged questions are never picked (§5.6) until the admin reviews them.
- **The level view never changes the curriculum day.** It's still one new day per local day (`11` §3.2).

---

## 10. Home (inside existing home components)

- Two entries of the existing deck-entry component:
  - "مراجعة النهارده · ١٤ دقيقة · ٣ جولات", listed first. It opens the same page as the footer tab;
  - "كروت النهارده · ٦ دقايق".
- Each shows ✓ when done and "جولة ٢ من ٣" while in progress. Before today's review is built, it shows the planned minutes only.
- On a "بكرة" day the hero suggestion line is the review first.
- **Mastery count** in an existing summary card:
  - **(replaced 2026-11-23 by `17` §9.1)** "بتقولها N · بتفهمها M" (produce learned · understand learned, phrases included). Never a CEFR / level label from word counts. Milestone line under it (1000 / 2000 / 3000) — counts only.
  - Legacy lines until W6: "اتحفظت ٤٢ كلمة · و ١٢ جملة" (summary block `mastery`: `mastered_words`, `mastered_phrases`, `recalled`, `reviewing`, `mastered_today`); before the first graduation, "افتكرت N كلمة";
  - the count can go down silently, and custom-deck words aren't counted.
- **"كلماتي"** is deferred. It can later reuse the deck-detail list with a stage filter.

---

## 11. Tasks for Cursor

One task per session, in order, tests included, stop at "Done when". Prompt:

> Read docs/az-talkie-v2/16-practice-engine.md (whole), 00-decisions.md §4 §5 §7 §8b, 11-profile-progress.md §4 §5 §7, 13-step-progress.md and AGENTS.md. Implement task **E-x only**. Do not start the next task. The user id always comes from the session helper. Only `/api/v2/answers` writes item state, stages and the answer log; only `/api/v2/progress/events` writes session documents, coverage plans and activity. No model calls in the builders. Do not create new screens or components: render every step with the existing card, day-question, micro-check and FindImageStep components, and the footer tab with the existing tab-bar item. Never write Portuguese or Arabic content yourself. No percentages and no on-screen timer for learners. Write the tests the task asks for. Stop when "Done when" is met and list the files you changed.

**E0 · Write the decisions**
- Do:
  - copy this doc into `docs/az-talkie-v2/` as `16-practice-engine.md`;
  - add a §5c line to `00`: 30-minute budget, review first, grammar focus, cards warm-up, window of 3 lessons, stages, reuse-only screens, the footer tab, the answer log;
  - mark `11` §5.1 as replaced;
  - link from the README.
- Done when: docs updated, nothing else changed.

**E1 · Answer log and question ids**
- Where: `lib/v2/answers` (log) and `lib/v2/review/questions` (ids).
- Do:
  - `v2_answers` with the §9.2 fields and indexes;
  - `/api/v2/answers` writes one log entry per attempt from every existing source (day questions, grammar checks, micro checks, "لاقي الصورة", cards, role-play);
  - the deterministic id function and the `v2_practice_questions` model of §9.1;
  - add `v2_answers` to the A5 list.
- Tests:
  - every source writes exactly one entry per attempt, with the right `first_try`;
  - the same question built twice gets the same id;
  - a new `builder_version` gets a new id;
  - `time_ms` is capped;
  - an answer with a mistake carries its `v2_errors` id;
  - account deletion removes the user's answers.
- Done when: Omar plays day 3's questions and finds one log entry per answer in the DB, each with its question id.

**E2 · Stages in the answers route**
- Do: the §6 stage function and fields for items and patterns, with the answer id recorded on each move; backfill from the answer log where it exists (dry run first).
- Tests:
  - same-day recognition + production → stage 2 only;
  - next-day production → stage 3;
  - cards and micro checks alone never pass stage 2;
  - a miss at stage 3 → stage 2;
  - cards never count as a situation;
  - essential items need 3 situations;
  - "عارفها" stops at stage 3.
- Done when: tests pass.

**E3 · Budget, window and shared queue (pure)**
- Do: §2.2 (step times, lesson / no-lesson split, the 70 / 30 rule, `v2_users.practice`, rounds of ~5 minutes); §3 and §3.1 (window, positions, ranking with the budget passed in).
- Tests:
  - 30 minutes with a lesson → review 14, cards 6;
  - 30 minutes without a lesson → review 21, cards 9;
  - a user value of 15 keeps review the largest share and cards at least 3;
  - day 4 → [3, 2, 1]; day 5 → [4, 3, 2]; story days skipped;
  - a 7-day absence gives the same window.
- Done when: tests pass.

**E4 · "كروت النهارده"**
- Do: §4, filled to the cards budget, into `v2_card_decks`, resumable, with the existing deck card; ratings are logged through E1.
- Tests:
  - a lesson day gives ~20 cards, a no-lesson day ~30;
  - at most 10 new;
  - weak at most 25% (at most 2 from outside the window);
  - repeats outside the count;
  - same cards on two opens.
- Done when: on day 5 Omar's cards come from days 4, 3, 2 only (plus allowed weak / تثبيت) and take about 6 minutes.

**E5 · Coverage plans**
- Do: §5.1 plans (phrase building pairs, 4 pattern checks, verb forms), with pairs already passed read from the answer log; create on window entry, close on exit; uncovered pairs → weak.
- Tests:
  - phrase = 4 pairs, word = 2, pattern = 4;
  - pairs passed in the lesson are removed;
  - dictation covers 2 pairs;
  - a full-sentence production covers its words' writing and the pattern's use check;
  - self-rated speaking covers the plan pair only;
  - each covered pair stores its answer id.
- Done when: tests pass and Omar's day 3 plan looks right to him.

**E6 · Code-built steps**
- Do: §5.6 templates for every type in §2.1, saved once into `v2_practice_questions`; `build_sentence` tiles with 1–2 distractor tiles from known mistakes; grouped "لاقي الصورة" blocks.
- Tests:
  - every pair kind in days 1, 3 and 22 gets a step;
  - building the same step for two users creates one stored question;
  - tiles always rebuild the exact sentence;
  - distractor tiles come only from known mistake pairs or taught items;
  - no future-day distractors;
  - "لاقي الصورة" only with at least 4 carded items.
- Done when: tests pass.

**E7 · Footer tab, build on tap, review session**
- Do:
  - §8: the fifth tab with the existing tab item and icon, the dot rule, the review page;
  - on tap: find, resume, or build-and-save (idempotent with the unique key + build lock), the empty-window state, the extra round appended as round N+1;
  - §5.2–5.8 inside the builder (priority fill order, grammar ≥ 40% of time, cumulative grammar, mixed-pattern step, weak share, positions → skills, last chance, rounds, order, no repeats via the answer log, flagged questions skipped, weakest-skill boost);
  - the session wrapper rendering existing components, with frozen copies on every step;
  - session and coverage updates through the events route.
- Tests:
  - two taps at the same time create one session;
  - a second tap resumes at the saved step;
  - day 1 saves nothing and shows the empty state;
  - a regenerated lesson doesn't change today's saved steps;
  - grammar ≥ 40% of planned time, and every round has a grammar step;
  - the same question id isn't picked within 3 days;
  - a flagged question is never picked;
  - every answered step stores its answer id.
- Done when: on day 5 Omar taps "مراجعة", the session appears in the DB, he answers 6 steps, closes the app, taps again and continues at step 7, and each of the 6 answers in `v2_answers` points at its question id and session.

**E8 · Level view, question stats, home**
- Do:
  - §9.3: the `v2_user_level` job (debounced + nightly), per-question stats with auto-flag, the time-estimate feed for §2.2;
  - the admin view per learner and per question (in the existing admin dashboard pages);
  - §10 home entries and the `mastery` summary block.
- Tests:
  - the level view matches a seeded answer log;
  - a question with 20 first tries and 5 correct gets flagged;
  - learners never see a percentage;
  - the summary makes no query on `v2_errors` or `v2_answers`;
  - custom-only items are not counted.
- Done when: Omar opens admin, sees his own per-skill numbers and the stats of the questions he answered, and his home shows the review first with the mastery line.

---

## 12. Decisions and defaults

Decided (Omar):

1. **The daily session is 30 minutes** (2026-11-21). Review is the priority and takes the largest share: 14 minutes on a lesson day, 21 without one.
2. **Extra focus on grammar and sentence building** (2026-11-21): at least 40% of review time, `build_sentence` for every phrase, 4 checks per pattern, cumulative grammar.
3. **Per-user config later** (2026-11-21): `daily_minutes` per user, default 30.
4. **No new screens** (2026-11-21): cards, day questions, micro checks and "لاقي الصورة" are reused.
5. **Footer tab "مراجعة"** (2026-11-22): a tap builds today's practice and saves it in the DB.
6. **Every answer is linked to its question** (2026-11-22) in an answer log, to track the learner's level.

Defaults (Omar can change them):

7. The window is 3 **lessons**; story days are skipped.
8. The build happens only on the learner's tap (no nightly pre-build); the extra round is appended to the same session.
9. Code-built questions are shared across learners, with deterministic ids; this enables per-question stats and auto-flagging of bad questions.
10. The learner sees counts only; admin sees percentages and trends.
11. The home count can go down silently; before the first graduation it shows "افتكرت N".
