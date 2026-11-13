# 11 · Learner profile and progress

Status: plan, 2026-11-12 (decisions taken the same day, §9; weak spots by problem with a Qwen classifier; two grace days per week for the streak). Author: Omar + Claude. Implementation: Cursor.

Read first: `AGENTS.md`, `00-decisions.md` (§0b, §5, §6, §7, §8), `09-conversations.md`, `10-auth.md`. Where this document disagrees with `00` about lesson progress, weak spots, error classification, the daily card deck, practice history or the streak, **this document wins**, and task P0 writes the changes into `00`.

No code in this document by design.

---

## 1. What already exists, and what is missing

Already decided:

- `v2_users` with the signed-in learner (§0b). Every learner document is keyed by the v2 user id, which always comes from the session helper.
- `v2_item_state`: one document per user × item, with `introducedDay`, `usedCorrectlyIn`, the four levels (heard, understood, said, used), SRS per skill and the card SRS (§8).
- `v2_errors`: append-only, two-level taxonomy (§8).
- `v2_convo_sessions`: one document per user × conversation (`09` §10).
- `POST /api/v2/answers`: the only writer of item state and errors.

Missing, and covered here:

1. **Lesson progress:** which days are completed, where the learner stopped inside a day, and what unlocks next.
2. **Weak spots by problem:** every mistake is classified by an LLM (Qwen) into a **problem** from a fixed list (e.g. "ser vs estar", "adjective agreement", "a + o = ao"), so review targets the problem, not the word or the question.
3. **Flashcard progress:** the day's 15-card deck as a stable object (same cards all day, resumable), plus graduated counts.
4. **Practice history:** which lessons the learner practised in conversation, how many times, and with what result.
5. **Activity and streak:** which days the learner showed up, and the streak.
6. **One profile summary** that the home screen, the path and settings all read.

---

## 2. Principles

- **Two writers, never more.**
  - `POST /api/v2/answers` stays the only writer of item state and errors. The error classifier (§4) runs after it, in the background, and only adds a label to the error and updates weak spots.
  - A new `POST /api/v2/progress/events` is the only writer of lesson progress, deck progress and activity days. It accepts small events ("step finished", "card rated", "lesson finished"), each with a client-made `event_id` for idempotency. Replaying an event writes nothing.
  - Conversation routes keep writing their own session document; they report results through the two routes above, never by writing progress directly.
- **The user id comes from the session only.** No route in this document reads a user id from the body, query or headers.
- **Derived numbers are computed, not stored**, unless reading them would scan too much (then they are a small cached document rebuilt by code, never edited by hand).
- **Content regeneration never breaks progress.** Progress points at the lesson by language × day and stores the lesson version it was played on. A regenerated lesson keeps "completed"; a new item added by regeneration simply appears as new.
- **No percentages, no backlog counts** (§5). Progress is shown as counts.
- **One local date for everything.** `v2_users.timezone`, taken from the browser at sign-in (default Europe/Lisbon), decides "today" for unlocking, the card deck, activity days and the streak.
- **Words and problems are reviewed in different places.** A forgotten or confused word is reviewed by its card (item SRS). A problem (a rule, a pattern, a habit) is reviewed in "نواقصك" through questions about that problem. One mistake can feed both.
- **Every new collection joins the user-keyed list** used by account deletion (A5), so its test keeps passing.

---

## 3. Lesson progress

### 3.1 Storage

New collection `v2_lesson_progress`, one document per user × language × day:

- `status`: locked | scheduled | available | in_progress | completed. (`scheduled` = unlocked, opens on the next local day.)
- `opens_on`: the local date a `scheduled` day becomes `available`.
- `lesson_version` played on.
- `steps`: one entry per step of the day, in the day's order (story, vocab_flow, real_world, grammar pages, find_image, story_test, day_questions). Each step has `status` (not_started | done | skipped) and `done_at`. Steps the day doesn't have (no story, real-world page hidden, find_image skipped) are set to `skipped` by code when the lesson opens.
- `resume`: the step id and the page or item index inside it where the learner left.
- `story_test`: score on the after-story questions (first tries only).
- `day_questions`: total, answered count, first-try correct count, per-skill first-try counts.
- `started_at`, `completed_at`, `last_opened_at`, `times_completed` (replays add to it).
- `minutes`: active time, summed from events, capped per event so an open tab doesn't count.

### 3.2 Rules (decided 2026-11-12)

- **Completed = the day's questions are finished.** The day is completed the moment every question in أسئلة اليوم has been answered once, right or wrong. Earlier steps don't have to be marked done, and no score is required. Misses go to cards and the classifier, never block the path. On weekly story days (no day questions), completed = the reading's questions are answered.
- **One new day per local day.** When day N is completed, day N+1 becomes `scheduled` with `opens_on` = the learner's next local date, and turns `available` on that date. It never opens the same day, even if day N was finished in the morning. This applies to every day, story days included.
  - The path shows a scheduled day as "بكرة" with its title visible.
  - Replays of completed days, cards, "نواقصك" practice, conversations on completed lessons and free chat are never limited.
  - A learner who misses days just finds the next day waiting; nothing piles up.
- **Day 1** is `available` right after onboarding.
- **Resume:** opening an `in_progress` day goes straight to `resume`. Replaying a completed day starts from the story and doesn't change `completed_at`.
- **The Library (المكتبة)** reads unlocks from this collection: a Library page is open when the day that teaches it is `in_progress` or `completed`.
- **Item introduction stays in the answers route:** when a learner first sees an item card in the vocab flow, that view goes through `/api/v2/answers` as a "seen" event, which sets `introducedDay` and the "heard" level. Lesson progress only records steps.

### 3.3 Path screen

The path reads, per day: status, the Portuguese title and Arabic subtitle from the plan, and a small mark for "practised in conversation" (§6). The current day is the first `available` or `in_progress` day; if none, the `scheduled` one with "بكرة".

---

## 4. Weak spots by problem (Qwen classifier)

### 4.1 The problem list

A content file `content/v2/problems.<lang>.json` holds a **closed list of problems**, written by Omar + Claude and versioned like other content. It replaces the second level of the §8 taxonomy; the top level (grammar, vocabulary, spelling, pronunciation) stays.

Each problem has:

- `id`, stable forever, e.g. `grammar.ser_estar`, `grammar.adjective_agreement`, `grammar.article_gender`, `grammar.contraction_a_o` (ao / à / aos), `grammar.contraction_em` (no / na / num), `grammar.present_ar_ending`, `grammar.reflexive_placement` (me / se), `grammar.word_order_question`, `vocabulary.brazilian`, `vocabulary.false_friend`, `vocabulary.formality` (você face to face), `spelling.accent`, `spelling.nasal` (ão / am), `pronunciation.final_e`…
- `top`: grammar | vocabulary | spelling | pronunciation.
- `title_tl`, `title_ar` and one `explain_eg` line (shown in "نواقصك").
- `taught_on`: the day(s) and Library page that teach it.
- `patterns`: the lesson pattern ids and common-mistake pairs (`00` §4 "Common mistakes") that test it. This is how code knows which questions are about this problem.
- `available_from`: the first day it can be assigned. A problem is never assigned to a learner who hasn't reached that day; the error goes to the nearest taught problem or to `unsure`.

Two special ids are not problems: `slip` (a typo or a one-off with no pattern) and `unsure` (the classifier can't tell). Neither ever opens a weak spot.

Starting size: about 30–40 problems for phase 1. New ones come from the "other" log (§4.2).

### 4.2 Classifying each mistake

- **When:** after `/api/v2/answers` has saved a wrong or near-miss answer (first try only). The answer response never waits for it. A background job takes the error, classifies it, and writes the label.
- **Code first, free and instant:**
  - the difference is only accents → `spelling.accent`;
  - the answer matches a known common-mistake pair → that pair's problem;
  - the answer is a known Brazilian form from the existing list → `vocabulary.brazilian`;
  - the answer is another taught item of the same kind with no shared pattern (e.g. "farmácia" for "estação") → **no problem**: it's a word mix-up, and it goes to cards only.
- **Everything else goes to Qwen**, one small non-streamed JSON call:
  - **Model:** Qwen, chosen by env (`CLASSIFIER_MODEL`, `CLASSIFIER_BASE_URL`, `CLASSIFIER_API_KEY`), through an OpenAI-compatible endpoint, so it can be self-hosted (vLLM) or a provider. Server only.
  - **Input:** the question type and its prompt, the expected answer, the learner's answer, the item ids and the pattern the question tests, the lesson's grammar focus, the grader's `main_error` when there was one (as a hint), and **only the problems available at the learner's day** (id + one-line description). No user data beyond that.
  - **Output:** `problem_id` (must be one from the given list, or `slip`, `unsure`, or `other`), `confidence` (low | medium | high), and a short `note_tl` with the corrected form if it differs from the expected answer.
  - **Fixed, small prompt** with a few examples per top level; cacheable like `09` §5.1.
  - **Checks in code:** an id not in the list → `unsure`; `other` → stored as `unsure` and logged in `v2_problem_requests` with the answer pair, so Omar can add new problems later.
  - **Timeout 8 s, one retry.** On failure the error gets `unsure` and is retried by a nightly batch; it never counts until it has a real label.
- **Storage:** the label is written once onto the error as `problem` = { id, by: code | qwen, model, confidence, at }. `v2_errors` stays append-only for everything else; the label is the only field added later, and only once (a nightly retry may replace `unsure`).
- **Cost and logs:** tokens and latency per call in the dev panel and admin; a daily count of calls per user is capped (e.g. 60), after which code-only labels are used.

### 4.3 Weak spot storage

New collection `v2_weak_spots`, one document per user × **problem id**, updated by the classifier job after it writes a label:

- `problem`: the problem id.
- `status`: open | improving | resolved.
- `evidence`: the last few error ids for this problem (max 5) and the last few correct answers on questions testing it (max 5).
- `examples`: up to 3 of the learner's own wrong → right pairs (answer and expected or `note_tl`), newest first. These are what the learner sees.
- `items_seen`: the item ids the mistakes happened on (just for picking review questions, not for display).
- `opened_at`, `last_error_at`, `resolved_at`.

### 4.4 Rules (code only)

- **Opens** when the same problem gets 3 labels of medium or high confidence within the last 14 days, from at least 2 different questions (so one hard question repeated doesn't open it). Low-confidence labels are stored but only count as half.
- **Correct answers count for a problem** when the question tests one of its `patterns` (from §4.1), wherever it's answered: day questions, grammar checks, "نواقصك" practice, conversations.
- **Improving** after 2 correct first tries in a row on questions testing the problem.
- **Resolved** after 3 correct first tries on at least 2 different days. Resolved spots stay for history and reopen if they fire again.
- **Never counted:** `slip`, `unsure`, word mix-ups (cards only), `unclear` verdicts, `arabic_only`, speaking self-ratings before STT is live, micro checks, and assisted answers.
- **Cap:** at most 5 open problems shown at once, most recent error first; the rest wait.

### 4.5 Reviewing a problem

- **"نواقصك" screen:** one card per open or improving problem: `title_ar` + `title_tl`, the `explain_eg` line, one of the learner's own wrong → right examples, a link to the Library page that teaches it, and "اتمرّن عليها".
- **"اتمرّن عليها" builds a short session (6–8 questions) on the problem, by code:**
  - grammar types that test its patterns (`fill_blank_choice`, `build_sentence`) from the day question banks of every day up to the learner's current day;
  - when the problem has common-mistake pairs, at least one question where the wrong form is a distractor;
  - preferably on items the learner already knows, so the question is about the rule, not the word;
  - no model call; the same `/api/v2/answers` route grades and counts.
- **Elsewhere:**
  - the question session mix: the 30% "weak" share picks questions testing open problems;
  - conversations (`09` §4.3): the candidate ranking prefers questions whose items or patterns touch an open problem; free chat may pick an angle that needs it;
  - home: one suggestion, either a 🟡 topic or the newest open problem ("ser و estar لسه بيلخبطوك، ٥ دقايق؟"), never both.
- **Cards don't read problems.** The 4 "weak" card slots come from items with recent misses in `v2_item_state` (§5).

---

## 5. Flashcard progress

Card SRS per item stays in `v2_item_state` (unchanged). New:

### 5.1 The daily deck

New collection `v2_card_decks`, one document per user × local date:

- `cards`: the item ids chosen for today, in order, each with its slot (recent | weak | older) and its rating once given (again | hard | easy | know, with the hint flag).
- `status`: open | done.
- `built_at`, `done_at`.

Rules:

- The deck is **built once**, the first time the learner opens cards that day, with the §5 mix (9 recent, 4 weak, 2 older; empty slots go to recent). **Weak** here means items with a first-try miss or an "again" rating in the last 7 days, from `v2_item_state`; it's about words, not problems.
- It doesn't change during the day, so leaving and returning continues the same deck.
- A "صعب" card comes back later in the same session, as now; it isn't added to the deck twice.
- Each rating is sent to `/api/v2/answers` (which updates the card SRS) **and** recorded on the deck through `/api/v2/progress/events`, with the same `event_id`.
- Missed days build nothing; there's no backlog (§5).
- **(changed 2026-11-12, from `12`)** Custom items and custom / official themed deck sessions **never** enter the daily 15. The daily deck stays curriculum-only (lesson flashcards + opt-in lesson cards). Per-deck review for learner and themed decks is separate (`12` §2.6).

### 5.2 Deck listing numbers

Computed from `v2_item_state` on read: graduated count ("اتخرّجت ✓ N"), cards per situation deck, the "اللي بتغلط فيه" row (items with recent misses). Nothing new stored.

---

## 6. Practice (conversations)

- `v2_convo_sessions` stays the source for each conversation.
- New small fields on `v2_lesson_progress`, written when a lesson conversation ends (result card shown): `practice.times`, `practice.last_at`, `practice.said` and `practice.understood` counts from the last run, and `practice.best_said`.
- Free chat doesn't belong to a day, so it writes only to activity days (§7) and, through the answers route, to item state. Its mistakes go through the classifier like any other.
- The topics list (`09` §8) keeps computing 🟢/🟡/⚪ from `v2_item_state`; it adds "آخر مرة" from `practice.last_at`.
- The old beat-based `/practice/[day]` writes nothing new; it's superseded (`09` T9.2).

---

## 7. Activity, streak and the profile summary

### 7.1 Activity days

New collection `v2_activity_days`, one document per user × local date: minutes, lesson steps done, cards rated, conversation turns, questions answered, and `counts_for_streak` (true/false). Written by the events route and by the answers route (counts only). Also used for the coach moment "returned after a break" (`09` §7), the evening check-in of the daily loop, and the admin view.

### 7.2 Streak (decided 2026-11-12: shown, two grace days per week)

- **A day counts** when the learner did at least one real piece of learning that local day: completed a lesson step, **or** finished the daily deck, **or** finished a "نواقصك" session, **or** finished a conversation (lesson or free chat, at least 5 learner turns), **or** finished a custom / official themed deck review session with at least 10 cards rated (`12` §2.6). Opening the app alone doesn't count. Replays count.
- **Because new lessons open once a day, the streak must be reachable without a new lesson**: on a "بكرة" day, the daily deck, "نواقصك", a conversation, or a custom / themed deck session keeps the streak.
- **Two grace days per week:** in any rolling 7-day window, up to **2** missed days don't break the streak. A third missed day inside the same window breaks it. Grace days are automatic; there's nothing to buy, earn or tap.
- **What the number counts:** active days only. A grace day keeps the streak alive but doesn't add 1 to it. Example: active Mon–Thu, nothing Fri–Sat, active Sun → the streak is 5, not 7.
- **Stored on `v2_users`:** `streak.current`, `streak.best`, `streak.last_active_day`, and `streak.missed_days` (the local dates missed inside the current 7-day window, max 2). Code updates them when an activity day first becomes `counts_for_streak`, and checks the gap since `last_active_day` at that moment: if the missed days in the last 7 would be more than 2, `current` restarts at 1.
- **Look:** Calm Kit, sage, a plain count "٥ أيام ورا بعض" with a small mark; no flame, no red, and never a guilt message when it breaks. When a grace day was used, a quiet line under the count: "فوّت يوم، والسلسلة لسه ماشية". After a break, the coach greets the return ("رجعت، يلا نكمّل") and shows `best`, not what was lost.
- **Where:** home header and settings/profile. Not on lesson or question screens.

### 7.3 The summary

One server function, and one route `GET /api/v2/me/summary`, used by home, path and settings. It returns:

- name, gender, onboarded, target language;
- current day and its title, and whether it's open now or "بكرة";
- completed days count;
- streak current and best, whether today already counts, and how many grace days are left in the window;
- "بتفهم N · بتقول M" from item levels;
- today's deck: cards left or done;
- up to 3 open problems (title and one example);
- last conversation: lesson or topic, and when;
- one home suggestion (a 🟡 topic or an open problem). On a "بكرة" day with the streak not yet counted, the suggestion is the deck, a problem or a conversation.

It reads indexed documents only (no scan of `v2_errors`). If it's slow, it's cached per user for 60 seconds and invalidated by both write routes and the classifier job.

---

## 8. Old Langify progress (decided 2026-11-12: no import)

Old Langify progress is **not imported**. Every learner starts v2 at day 1, including linked users (`langify_user_id` stays only as a link). v2's curriculum, items and SRS don't map to Langify's `UserProgress`, and a wrong import would put the learner on the wrong day. Revisit only if pilot learners ask.

---

## 9. Decisions (Omar, 2026-11-12)

1. **Unlocking:** one new day per local day (§3.2).
2. **Completion:** a day is completed when its questions are finished, right or wrong (§3.2).
3. **Langify progress:** no import (§8).
4. **Streak:** shown, with **two grace days** in any 7-day window; the count is active days only (§7.2).
5. **Weak spots are problems, not words or questions.** Every mistake is labelled with a problem from a closed list, by code where obvious and by a Qwen call otherwise; review in "نواقصك" targets the problem (§4).

---

## 10. Tasks for Cursor

Same rules as `09a` and `10`: one task per session, in order, tests included, stop at "Done when". Prompt:

> Read docs/langify-v2/11-profile-progress.md (whole), AGENTS.md, 00-decisions.md and 10-auth.md. Implement task **P-x only**. Do not start the next task. The user id always comes from the session helper. Only `/api/v2/answers` writes item state and errors; only the classifier job adds the problem label and updates weak spots; only `/api/v2/progress/events` writes lesson, deck and activity progress. Write the tests the task asks for. Stop when "Done when" is met and list the files you changed.

**P0 · Write the decisions**
- Do: add "§8b Learner progress" to `00-decisions.md` summarising §2–§9 (including the five decisions), and update §8's taxonomy line to point at the problem list; link this doc from the README.
- Done when: docs updated, nothing else changed.

**P1 · Collections, indexes and the deletion list**
- Where: `lib/v2/progress`.
- Do: models for `v2_lesson_progress`, `v2_weak_spots`, `v2_card_decks`, `v2_activity_days`, `v2_problem_requests`; unique indexes on their user keys; the `problem` label field on `v2_errors`; `timezone` and `streak` fields on `v2_users`; one shared "local date for user" helper; add the user-keyed collections to the account-deletion list.
- Tests: unique keys hold; the local date flips at midnight in the user's timezone; the A5 deletion test passes with the new collections.
- Done when: tests pass.

**P2 · Progress events route**
- Where: `app/api/v2/progress/events`, logic in `lib/v2/progress/events`.
- Do: accept events (lesson_opened, step_done with resume point, day_question_answered, lesson_finished, card_rated, deck_opened, problem_session_finished, convo_finished, active_minutes) with `event_id` idempotency; write lesson progress, deck and activity days; apply the completion rule and the one-day-per-local-day unlock of §3.2.
- Tests: replayed event writes once; answering the last day question completes the day even with steps not marked; completing day N in the morning makes N+1 `scheduled`, and it becomes `available` only on the next local date; replays are never blocked; minutes are capped.
- Done when: tests pass.

**P3 · Lesson flow wiring and resume**
- Do: the lesson player sends events at each step end, each day answer, and on leave; opening an in-progress day jumps to `resume`; skipped steps are set when the lesson opens.
- Done when: Omar leaves day 3 in the grammar page, reopens, and lands there; finishing day 3's questions shows day 4 as "بكرة", and day 4 opens the next day.

**P4 · Path and Library read progress**
- Do: the path shows statuses, "بكرة" for a scheduled day, and the current day; the Library unlocks from `v2_lesson_progress`.
- Done when: a fresh user sees day 1 open and the rest locked; completed days show as done.

**P5 · Problem list (content)**
- Where: `content/v2/problems.pt-PT.json`, validator in `lib/v2/progress/problems`.
- Do: Omar + Claude write the phase 1 list (30–40 problems) with `taught_on`, `patterns` and `available_from`; Cursor writes only the zod validator and the loader, and links each problem's patterns to existing lesson pattern ids and common-mistake pairs. Cursor never writes the problems' Arabic or Portuguese.
- Tests: every `patterns` id exists in a lesson; every `taught_on` day exists; ids are unique.
- Done when: the validator passes on the list.

**P6 · Classifier job (code first, then Qwen)**
- Where: `lib/v2/progress/classify`, a background job kind in the existing job runner.
- Do: after a wrong or near-miss first try is saved, queue a classification; run the code rules of §4.2; otherwise call Qwen from env with the fixed prompt and only the problems available at the learner's day; validate the output; write the label once; log tokens and latency; per-user daily cap; nightly retry of `unsure` labels from failures; `other` goes to `v2_problem_requests`.
- Tests: accent-only, known common-mistake and Brazilian cases are labelled by code with no call; a word mix-up gets no problem; a stub model returning an unknown id becomes `unsure`; a timeout leaves the answer route unaffected; a problem with `available_from` after the learner's day is never offered.
- Done when: tests pass, and 20 real mistakes from Omar's day 3 and day 22 runs get sensible labels (Omar reviews them).

**P7 · Weak spots by problem**
- Where: `lib/v2/progress/weak`.
- Do: after each label, update `v2_weak_spots` with the open / improving / resolved rules of §4.4; count correct answers on questions testing the problem's patterns from every source; keep the learner's own examples.
- Tests: scripted sequences for each transition; 3 labels on the same question open nothing; low confidence counts half; `slip`, `unsure`, mix-ups, micro checks and assisted answers never open a spot.
- Done when: tests pass.

**P8 · "نواقصك" screen and problem practice**
- Do: the screen per §4.5; "اتمرّن عليها" builds a 6–8 question session from the day banks by code; answers go through `/api/v2/answers`; the session end sends `problem_session_finished`; the 30% weak share in sessions reads open problems.
- Done when: after Omar makes three ser/estar mistakes on two questions, "ser و estar" appears with his own example, and its practice session asks only ser/estar questions.

**P9 · Daily deck**
- Do: build-once deck with the §5 mix (weak = items with recent misses); resume the same deck all day; ratings go to both routes with one `event_id`; deck listing numbers from item state.
- Tests: two opens on the same day return the same cards; a new local date builds a new deck; missed days build nothing.
- Done when: Omar rates 7 cards, closes the app, and continues at card 8.

**P10 · Practice results**
- Do: the conversation result card sends `convo_finished`; lesson progress gets the practice fields; the topics list shows "آخر مرة"; conversation candidate ranking reads open problems.
- Done when: after a day 18 conversation, its path tile shows practised, and its mistakes appear labelled in admin.

**P11 · Streak**
- Where: `lib/v2/progress/streak`.
- Do: mark `counts_for_streak` per §7.2; update current, best, last active day and missed days; apply two grace days per rolling 7-day window; the quiet grace line; the return greeting through the coach moment.
- Tests: a lesson step, a finished deck, a "نواقصك" session or a 5-turn conversation each count; opening the app alone doesn't; a "بكرة" day kept by the deck counts; 1 or 2 missed days in 7 keep the streak and don't add to the count (Mon–Thu active, Fri–Sat missed, Sun active → 5); a third missed day in the same window restarts at 1; missed days older than 7 days free a grace day again; timezone edges around midnight.
- Done when: tests pass.

**P12 · Profile summary and home**
- Do: `GET /api/v2/me/summary` per §7.3 with the 60-second cache; home header shows the streak; home and settings read the summary.
- Tests: summary numbers match a seeded user; no query touches `v2_errors` directly.
- Done when: home shows the current day (or "بكرة"), the streak, today's deck, "بتفهم N · بتقول M", the top open problem and one suggestion for Omar's account.
