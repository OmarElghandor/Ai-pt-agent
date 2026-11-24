# 17 · Item weights: importance of every word and phrase in core-items

Status: plan, 2026-11-23. App: **az-talkie** (A-Z Talkie). Author: Omar + Claude. Implementation: Cursor.

Read first: `00-decisions.md` §4 (essential items, 2026-11-19) and §5, `16-practice-engine.md` (whole), `12-custom-decks.md` (custom items), `15-admin-dashboard.md` (admin surfaces), `AGENTS.md`.

No code in this document by design.

---

## 1. Why

The long-term goal is about **3,000 words and phrases in ~10 months** (about 10 new items a day, with review). At that pace, the daily review load grows to roughly 10× the new items. The 30-minute budget can't review every item in all four skills.

So every item needs a weight that says **how much review time it deserves** and **what "learned" means for it**:

- some items the learner must **say** from memory (Diga, Queria…, Quanto é?, precisar);
- some items it's enough to **understand** when heard or read (o galão, a avaria, a word that appears once in a library episode).

**The weight drives both sessions: the review and the flashcards.** In both, the highest-weight items are reviewed first (decided 2026-11-23).

Promise for marketing and the home screen (decided 2026-11-23): "the 3,000 most used words in 10 months, enough to understand most everyday talk". **Never promise B2.** Vocabulary alone puts the learner around B1+; B2 also needs listening hours and speaking (library, role-play, free talk).

---

## 2. What already exists (keep it)

`00` §4 (2026-11-19) already gives every core item `priority`: `essential` · `useful` · `situational`, with essential items carded, recycled into the next 3 lessons, reviewed first, and needing 3 situations to graduate.

**This doc does not replace `priority`.** It adds three authored fields and one computed weight on top of it.

**Gap (2026-11-19, closes in W4):** cards and review must treat `priority === 'essential'` as essential. Today the cards builder hardcodes `essential: false` (`lib/v2/progress/cards.ts`). W4 closes this when ranking switches to the priority score (essential items already start at weight ≥ 60).

---

## 3. New fields on each core item

| Field | Who sets it | Values | Meaning |
|---|---|---|---|
| `priority` | authored (exists) | essential · useful · situational | how central the item is to everyday talk |
| `target` | authored (LLM suggests on backfill; Omar approves; new days authored in JSON) | **produce** · **understand** | what the learner must be able to do with it |
| `survival` | authored, Omar mostly | true / false (default false) | the learner gets stuck without it, even if it's not very frequent: Não percebi, Pode repetir?, Fala mais devagar, Onde fica…? |
| `freq_rank` | **code**, from the frequency list | a number, or empty | position in the pt-PT frequency list. **The LLM never writes it.** An item not found in the list stays empty and is flagged for review. |
| `reuse_count` | **code**, from the curriculum | a number | how many later lessons use the item (recycle_ids, stories, examples, role-play goals) |
| `weight` | **code**, computed | 0–100 | the single number both sessions read |
| `weight_why` | **code** | short list | the parts that made the weight, for the admin view ("essential + top-500 + used in 9 lessons") |

Phrases and sentences get `freq_rank` from their **main word** (the head verb or noun) only as a hint; for chunks, `priority` and `survival` matter more than frequency.

Authored fields live on the core-items JSON. Computed fields (`freq_rank`, `reuse_count`, `weight`, `weight_why`) live in Mongo (`v2_item_weights`), never on the answer path.

---

## 4. The weight (computed by code, never by the model)

Points, summed and capped at 100:

| Part | Points |
|---|---|
| priority essential / useful / situational | 60 / 35 / 15 |
| frequency: top 500 / 501–1,500 / 1,501–3,000 / not in list or beyond | +20 / +12 / +6 / 0 |
| reuse: each later lesson that uses it | +2, at most +10 |
| survival | +10 |
| phrase or fixed chunk (not a single word) | +5 |

- The weight is **recomputed** whenever core-items change (a new lesson can raise an old item's reuse count). It's a background job / script (`v2:recompute-item-weights`), never on the answer path.
- The weight is a property of the **item**, the same for every learner. It is never mixed with the learner's weakness (§6).
- Admin can override `target`, `survival` and `priority`; the weight then recomputes. There is no manual override of the number itself.
- **Items with no weight** (custom-only items from learner decks, `12`): a fixed default weight of 30, so they never jump ahead of essential lesson items and are never starved either.
- Until a frequency list is imported, every `freq_rank` stays empty → 0 frequency points and flagged `needs_review`. Importing a list and re-running the job fills ranks and recomputes every weight with no other code change.

---

## 5. Rules for `target` (authoring guide + backfill)

These go into the **core-items authoring guide** so new days carry `target` / `survival` in the JSON directly. A one-time suggestion backfill job proposes values for existing days (dry run first); nothing is saved as approved until Omar approves in admin (W2 / W3).

1. **essential → always produce.**
2. **survival → always produce.**
3. **useful → produce** when it's a phrase or chunk, or its main word is in the top 1,500; otherwise **understand**.
4. **situational → understand**, unless the situation is the lesson's main task (e.g. ordering at the café: "um galão" is produce on the café day).
5. Grammar patterns are always produce (the practice engine already gives them 4 checks).
6. Library-only words and story extras are not core items; they never get a weight and are never tested (`00` §4 extras rule stays).

The backfill outputs `priority`, `target`, `survival` per item with a one-line Arabic reason. Omar reviews them in the admin (§9) before the day is generated, in the same step where he already reviews lesson data.

---

## 6. The priority score (shared by both sessions)

> **priority score = item weight × learner need**

- **learner need** comes from the learner's own item state, never stored on the item: higher for a recent first-try miss or "صعب", a lower stage, and more days overdue; lower for an item answered right many times in a row.
- The same function is used by the review builder and the cards builder, so an item's importance is the same everywhere.
- When a session's budget is full, **the lowest scores wait for tomorrow first**. A weak essential item is never the one left out.
- The existing "essential first" rule of `00` §5 and `16` §4 becomes a consequence of the weight (essential items start at 60+), not a separate rule — once W4 wires `priority` into ranking / priority score.

---

## 7. Flashcards: highest weight first (changes to `16` §4, decided 2026-11-23)

### 7.1 Ranking

The ranking list of `16` §4 (essential first → weak/due/new → overdue → newest lesson → lower stage) is **replaced** by:

1. **priority score** (§6), highest first;
2. ties: most overdue, then newest lesson.

The shares of `16` §4 stay (weak up to 25%, window 50 / 30 / 20 by position, تثبيت up to 15%). **Inside each share, cards are picked by priority score.**

### 7.2 New cards

- At most 10 new cards a day (unchanged). When there are more new window items than that, **the highest-weight ones are introduced first**; the rest wait for tomorrow.
- So on a heavy lesson day the learner meets Queria, precisar and Não percebi as cards before o galão.

### 7.3 When the cards budget is full

- Cards are dropped from the **bottom** of the ranking: low weight and low need first.
- A due card with weight ≥ 60 (essential range) that wasn't shown today gets a boost tomorrow, so essential cards never slip two days in a row.

### 7.4 Intervals follow the weight

- Essential items keep the extra early ladder step of `00` §5 (1 → 2 → 4 → 7 → 14 → 21).
- **understand items** with weight under 30 may skip one step (1 → 3 → 7 → 14 → 21), because they only need recognition.
- Everything else keeps the standard ladder.

### 7.5 Card direction

- Front stays `tl` + audio for every card.
- understand items never get the Arabic → Portuguese direction.
- For understand items the cards are the **main** review place, since the review session gives them listening and reading only (§8.1).

### 7.6 The cards end screen

The existing deck end shows the stage-up list. Items are listed **in weight order**, so the learner sees the important wins first ("Queria ✓ افتكرتها").

---

## 8. Review session (changes to `16` §5)

### 8.1 Coverage plan (`16` §5.1)

- **produce** items keep the current pairs (word: listening + writing; phrase: listening, building, writing, speaking).
- **understand** items get **listening + reading only** (a choice or "لاقي الصورة" step). No writing, no building, no speaking pairs.
- This is the main saving: situational vocabulary stops eating writing and speaking time.

### 8.2 Priority inside every slot (`16` §5.3)

The fill order of `16` §5.3 stays (last chance → weak → grammar → plan → retest → تثبيت). **Inside** each slot, steps are ranked by the priority score (§6). Overflow drops the lowest scores first.

### 8.3 What "learned" means (`16` §6)

| target | Counts as learned when |
|---|---|
| produce | stage 4 **اتحفظت** as today (interval ≥ 21 + 2 situations, 3 for essential) |
| understand | stage 2 **راجعتها** held over an interval ≥ 21 days (no production needed) |

- understand items that reach that point leave regular review, with the same rare maintenance check as اتحفظت items.
- A miss on an understand item moves it back like any other item.

---

## 9. Home and admin

### 9.1 Home and the 3,000-word goal

- The home mastery line becomes two counts: **"بتقولها N · بتفهمها M"** (produce learned · understand learned, phrases included). This replaces "اتحفظت ٤٢ كلمة" in `16` §10.
- A milestone line under it, counts only, no levels: "١٠٠٠ كلمة = تقدر تتعامل في مواقف الشارع", "٢٠٠٠ = تفهم معظم الكلام البسيط", "٣٠٠٠ = تفهم معظم الكلام اليومي".
- No CEFR label is ever shown to the learner from word counts.

### 9.2 Admin

Inside the existing admin dashboard (`15`), no new page:

- **Lessons table:** a chip per day, "الأوزان: جاهزة · محتاجة مراجعة (N)". N = items with no `freq_rank` or no approved `target`.
- **Day view:** the core items as a list with `tl`, meaning, priority, target, survival, weight and `weight_why`. Inline toggles for target and survival, a dropdown for priority. "وافق على الكل" approves the LLM suggestions in one tap.
- **Curriculum view:** all items across days sorted by weight, with filters (produce / understand, no freq_rank, survival). This is where Omar checks that the top of the list looks like real everyday Portuguese.
- **Coverage of the frequency list:** "من أول ١٠٠٠ كلمة: موجود في المنهج ٨٤٠ · ناقص ١٦٠", with the missing list. This drives the next lessons.
- **Per learner (existing admin learner view):** today's cards and review steps with each step's weight, need and score, so Omar can see why an item was picked or left out.

---

## 10. The frequency list

- Days 1–90 use "1000 Palavras Mais Comuns" (existing source, not yet imported).
- For words 1,001–3,000 a bigger **pt-PT** list is needed (European Portuguese, not Brazilian). Open question for Omar: which source. The list is imported once into `v2_frequency_words` (word, rank, part of speech) and only code reads it.
- Until a list lands: ship the job and formula with `freq_rank` empty → 0 frequency points, flagged for admin review. Import + recompute fills ranks with no other change.
- The same mechanism will later work for en-GB and de-DE with their own lists.

---

## 11. Tasks for Cursor

One task per session, in order, tests included, stop at "Done when". Prompt:

> Read docs/az-talkie-v2/17-item-weights.md (whole), 16-practice-engine.md, 00-decisions.md §4 §5 and AGENTS.md. Implement task **W-x only**. The weight is computed by code; no model call ever writes `freq_rank`, `reuse_count` or `weight`. The priority score function is shared by the cards and review builders; do not write two versions. Never write Portuguese or Arabic content yourself. No new screens: use the existing admin, cards and home components. Write the tests the task asks for. Stop when "Done when" is met and list the files you changed.

**W0 · Write the decisions**
- Copy this doc into `docs/az-talkie-v2/17-item-weights.md`; add a line to `00` §4 and §5 (target, survival, computed weight, cards ranked by weight); mark `16` §4 ranking, §6 and §10 as replaced or extended by this doc. Note the essential-from-priority gap closed in W4.
- Done when: docs updated, nothing else changed.

**W1 · Frequency list and computed fields**
- Import the frequency list into `v2_frequency_words` (empty until a file lands); the job that fills `freq_rank`, `reuse_count`, `weight`, `weight_why` for every core item into `v2_item_weights`; rerun on core-items change; default weight 30 for custom-only items.
- Tests: an item not in the list gets empty `freq_rank` and is flagged; adding a later lesson that recycles an item raises its weight; weight never above 100; the same input always gives the same weight.
- Done when: every item of days 1–90 has a weight and Omar can read the top 50.

**W2 · Authoring rules + backfill**
- Add the §5 rules to the **core-items authoring guide** so new days carry `target` / `survival` in the JSON; existing items get suggestions in one backfill run (dry run first). Nothing is saved as approved until Omar approves in admin.
- Tests: essential → produce; survival → produce; situational → understand unless main task; nothing is saved as approved until Omar approves.
- Done when: day 1–10 suggestions are visible for review.

**W3 · Admin review**
- §9.2 inside existing admin pages (`15`): chip, day list with toggles, curriculum view, frequency-list coverage, per-learner score view.
- Done when: Omar approves the weights of days 1–10 in under 10 minutes.

**W4 · Priority score + flashcards** (after `16` E4 polish)
- §6 shared score function; §7 in the cards builder: ranking by score inside each share, new cards by weight, drop from the bottom, the next-day boost for essential cards, the understand ladder, no Arabic → Portuguese direction for understand items, end screen in weight order. Wire `priority === 'essential'` so essential is never hardcoded false.
- Tests:
  - with 15 new window items, the 10 introduced are the 10 highest weights;
  - when the cards budget overflows, the dropped cards are the lowest scores;
  - a due card with weight ≥ 60 left out today is in tomorrow's deck;
  - two learners with different mistakes get different orders from the same weights;
  - custom-only items use weight 30;
  - an understand card never shows the Arabic → Portuguese direction.
- Done when: on day 5 Omar's cards start with essential and survival items, and situational words come last.

**W5 · Review session** (after `16` E7 polish)
- §8: coverage pairs by target, the shared score inside every slot, lowest scores wait first, the understand "learned" rule.
- Tests: an understand item never gets a writing or speaking pair; when the budget overflows, a weak essential item is always kept; an understand item counts as learned at stage 2 + 21 days.
- Done when: Omar's day-5 review has fewer steps on situational words and more on essential ones, and still fits the 14 minutes.

**W6 · Home**
- §9.1: "بتقولها N · بتفهمها M" and the milestone line.
- Done when: home shows both counts and never a level label.

---

## 12. Decisions and defaults

Decided (Omar, 2026-11-23):

1. Every core word and phrase gets an importance weight in core-items.
2. The pace goal is ~10 new items a day toward ~3,000 in 10 months; the app never promises a CEFR level from word count.
3. **Flashcards review the highest-weight items first**, the same as the review session.

Defaults (Omar can change them):

4. Keep the existing three `priority` values; add `target` (produce / understand) and `survival`.
5. The weight number is computed by code from priority, frequency, reuse, survival and chunk type; the LLM only suggests the authored fields.
6. Weight is per item; learner weakness stays in the learner's progress data; one shared function multiplies them for both sessions.
7. understand items are reviewed in listening and reading only and count as learned without production; their cards may skip one ladder step.
8. Custom-only items get a fixed weight of 30.
9. Until a frequency list is imported, `freq_rank` stays empty (0 frequency points, flagged); import + recompute fills ranks with no other change.

Open:

10. Which pt-PT frequency list to use for words 1,001–3,000.
11. The exact point values in §4 are a starting guess; tune them after Omar reviews the top of the curriculum view.
