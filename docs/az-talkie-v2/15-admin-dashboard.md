# 15 · Admin dashboard (lessons, cards, bulk images)

Status: plan, 2026-11-21. Author: Omar + Claude. Implementation: Cursor.

Read first: `AGENTS.md`, `00-decisions.md` (§0b admin role, §3 generation stages, §5 / §5b decks, §10 image pipeline), `12-custom-decks.md` (§2.3–§2.4 generation and checks, §2.10 images, §6 promotion), `14d-library-admin.md` (§2.6 jobs, §2.5 cost). Where this doc disagrees with the per-lesson admin pages or with `12` about who may generate decks, **this doc wins**, and task D0 writes the changes into `00`.

No code in this document by design.

---

## 1. What the dashboard is for

One full-screen admin app where Omar:

1. **Generates lessons** (one day or a range) and watches every stage live, step by step, with cost, warnings and the reason of any failure, and can rerun one stage without rerunning the day.
2. **Generates flashcards without waiting for the lesson:** the **standard** cards of a day straight from core-items, and **custom / themed** decks from a topic.
3. **Bulk-generates images** for many lessons and decks at once, seeing the count and the cost first, with pause, resume and a daily cap.

Same rules as the library admin: nothing paid runs without his click, every paid step shows its estimate first, an unchanged input is never paid for twice, and changing an earlier stage marks later ones **stale** (amber, never rebuilt automatically).

---

## 2. Layout (full screen, responsive, RTL)

The dashboard does **not** use the 390px learner frame. It lives under `/v2-admin` with its own full-width shell, the existing admin guard (`denyUnlessV2Admin`), the mint tokens from the theme doc, Egyptian UI text, content shown as it is.

### 2.1 Shell

- **Side rail (right side, RTL):** الرئيسية · الدروس · الكروت · الصور · الشغل (jobs) · التكلفة · المكتبة (link to `14d`) · الشخصيات.
- **Top bar:** search (day number, title, item id, deck title), language switch (`pt-PT` now, later others), a running-jobs pill ("٣ شغالين") that opens the jobs drawer, and the image-cap bar for today.
- **Detail drawer:** clicking a row opens its details in a drawer on the left side of the screen, so the list stays visible. A "افتحها في صفحة" link opens the same view as a full page (sharable URL).

### 2.2 Breakpoints

| Width | Rail | Lists | Detail |
|---|---|---|---|
| ≥ 1280px | expanded (icons + labels) | full tables | drawer at ~40% width beside the table |
| 768–1279px | icons only, expands on hover/tap | tables with fewer columns (stage chips collapse to one "x/y" chip) | drawer covers ~70%, list dimmed behind |
| < 768px | bottom bar with 5 tabs (الرئيسية، الدروس، الكروت، الصور، الشغل), the rest under "المزيد" | each row becomes a card (title, status chip, one primary action) | full-screen page with a back arrow |

- Bulk actions on mobile use a sticky bottom action bar ("٨ متحددين · ولّد").
- All long actions keep working after the tab closes (jobs, §6). The page only shows them.
- Tables: sticky header, sticky first column (day / title), virtualised rows (114 days + decks), keyboard: `/` focuses search, `j/k` moves between rows, `Enter` opens the drawer.

### 2.3 Home (الرئيسية)

Four cards at the top, counts only (no percentages):

- **الدروس:** published · ready for review · failed · not generated.
- **الكروت:** days with standard cards ready · themed decks · learner decks waiting for moderation.
- **الصور:** ready · missing · flagged · blocked (no sheet).
- **النهارده:** cost today (Claude, images, TTS) and the image cap left.

Under them: **"محتاج منك"** — one list of everything waiting on Omar (lessons in review, flagged images, reported decks, failed jobs), each with its action button. Then the last 10 finished jobs.

---

## 3. Lessons (الدروس)

### 3.1 Lessons table — `/v2-admin/lessons`

- One row per plan day (1–114): day, `title_tl` + `title_ar`, phase, situation, **stage chips** (one per stage of §3.3, coloured by status), warnings count, cards status, images "x/y ready", cost, updated, published yes/no.
- Filters: phase, status ("ما اتولدش", "شغال", "فشل", "محتاج مراجعة", "منشور"), has stale stages, has missing images, story days only.
- **Select many → "ولّد الدروس"**: queues a generation run per selected day (§3.4). Also "ولّد من يوم … لـ يوم …".
- A day whose core-items are not approved shows a calm lock "الـ core-items لسه مش متراجعة" and can't be selected (lesson data is reviewed before generation, so nothing is generated twice).

### 3.2 Lesson page — drawer or `/v2-admin/lessons/<day>`

Tabs: **التوليد** (the stage timeline, default) · **المحتوى** (preview with the real learner renderer) · **الكروت** (§4.2) · **الصور** (the existing per-lesson image tab, moved here) · **التقرير** (review report) · **السجل** (runs, versions, audit).

### 3.3 Step-by-step progress (the التوليد tab)

A vertical timeline, one step per stage, in the pipeline order of `00` §3/§4:

**core-items check → brief → items → story → outline → pages → questions → real_world → micro / daily_use → critic → continuity → lang_check → assemble → publish gate**

Each step shows:

- status: waiting · running · done · warning · failed · skipped · stale;
- start time, duration, model, input/output tokens, cost;
- warnings count with the list on expand (each linking to the line, page or item it is about);
- for failures: the error in one Egyptian line, the fatal rule that tripped, the retry result, and the raw model output in a collapsed box;
- actions: **"شغّل الخطوة دي تاني"** (with estimate; asks once and lists which later steps will go stale) and, for soft jobs (story, real_world), **"كمّل من غيرها"**.

Inside steps that fan out, a sub-progress:

- **pages:** one row per page from the outline ("صفحة ٣ · grammar · شغالة"), so "٤ من ٧ صفحات" is visible while they run in parallel; a single failed page can be rerun alone;
- **questions:** slots planned vs filled by the model vs fell back to template;
- **continuity:** the flagged pages and which were regenerated.

Live updates: the page polls the run every 2 s while anything runs, every 30 s otherwise. A top line on the tab summarises: "شغال · الخطوة ٦ من ١٤ · بقالها ٤٢ ث · التكلفة لحد دلوقتي $0.18".

Rules:

- A run is **resumable**: a failed run restarts from the failed stage, never from the start. Done stages are reused unless their input changed.
- **Stale:** changing core-items, the brief or regenerating the story marks every later stage stale (amber "الستوري اتغيرت، الـ outline والصفحات محتاجين يتعملوا تاني"). Nothing reruns until Omar clicks. The stop rule of `00` §4 holds: one repair round, then published or flagged.
- One active run per day. A second click while one runs is refused with "فيه توليد شغال لليوم ده".
- The publish gate is the existing one (story doc + lesson); the timeline's last step lists each rule with ✓ or the missing item, and "انشر" lives there.

### 3.4 Bulk lesson generation

- Runs go into a **queue** with a concurrency limit from env (`LESSON_GEN_CONCURRENCY`, start at 2), in day order.
- Before queuing: an estimate per day and the total (from the average cost of past runs per stage; "تقريبي" when there's no history).
- The queue is visible in الشغل (§6) as one batch: "ولّد الأيام ١٠–٢٠ · ٤ خلصوا · ١ شغال · ٦ مستنيين · ٠ فشل", with pause, resume and cancel (cancel stops queued days; a running stage finishes and the run is left resumable).
- A failed day never stops the batch; it's listed in "محتاج منك".
- Images are **never** part of a lesson run (`00` §10). After a batch, a button "ولّد صور الأيام دي" opens the bulk image screen pre-filtered to these days (§5).

---

## 4. Cards (الكروت)

### 4.1 Two kinds, one screen — `/v2-admin/cards`

Tabs: **كروت الدروس** (standard) · **مواضيع** (official themed decks) · **من المتعلمين** (moderation, the `12` C7 screens moved here).

### 4.2 Standard cards before the lesson

**Decision (2026-11-21, proposed):** a day's standard cards can be built **straight from core-items**, with no lesson run.

- **"ولّد الكروت"** on a day (or many days) runs a small **cards job**: input = the day's approved core-items (items, their `ar`, situation, priority, any authored fields) and the known items; output per carded item = the card fields that core-items don't already have (example sentence `example_tl` / `example_ar` of at most 8 words using only known items, an optional one-line `eg_note`). Code adds `has_card`, the verb poster link (only from the verified conjugation table), and `introducedDay`. Do not fill `say` (`00` §2).
- **Same ids, written once.** The result is written into the day's **item bank** under the stable item ids (`food.cheese`, `phrase.ask_price`). When the lesson is generated later, the `items` stage **reads** these items and fills only what's missing; it never rewrites a card field that exists. Card SRS (`v2_item_state`) is the same before and after, so learners lose nothing.
- Function words get no card (`00` §5). Checks are the same as custom decks (`12` §2.4: pt-PT only, no "/" in `tl`, article + gender, Arabic `ar`, example rules); a failing field is dropped, never fixed by hand, and the card shows without an example.
- **Learner side:** a situation deck appears on its day as today ("يفتح Dia N"), from the item bank, whether the lesson exists or not. An unpublished lesson still never unlocks early; only its cards are ready.
- Status per day: none · generating · ready · stale (core-items changed after the cards were made) · failed. Shown as the "الكروت" chip on the lessons table.
- The tab shows the day's cards as the learner sees them (front: `tl` + audio; back: meaning, say, picture or placeholder, example), with per-card "اكتب المثال تاني" and hide.
- Bulk: select days → "ولّد الكروت" (cheap model from env `CARDS_MODEL`, Haiku by default), estimate first, same queue as §3.4 but its own concurrency.

### 4.3 Themed decks (مواضيع) from a topic

- **"ديك جديد"**: a topic box, the target language, phase (A1 / A2), and a word count (20–30). It runs the **same generator and checks as `12` §2.3–§2.4** with two admin differences: no quota, and the result is saved as a **draft official deck** (`v2_official_decks`, `status: draft`), not as a public learner deck.
- The existing-deck search (`12` §2.5 step 2) runs first and shows matches from both official and learner decks ("فيه ديك متعلمين عن الطقس · ضافوه ٢٢ · حوّله لرسمي بدل ما تولّد جديد").
- Draft editor = the promotion draft of `12` §6: remove, reorder, add from lesson banks or the custom pool, edit a custom item's text (marks it `reviewed`), rename, then publish to "مواضيع".
- Words reuse official items when they exist (`12` §2.1), so a themed deck about the kitchen never duplicates lesson items.
- Bulk: paste a list of topics (one per line) → one draft per topic, queued; each finishes as "مسودة جاهزة" for review.

### 4.4 Learner decks (من المتعلمين)

The `12` C7 moderation list (popular, reported, image status, not promoted) with hide / delete / remove word / "حوّله لديك رسمي", now inside this tab. No new rules.

---

## 5. Bulk images (الصور)

### 5.1 One queue for every image — `/v2-admin/images`

All images live in `v2_images` already (lessons, stories, custom and official decks, library). This screen is a filtered view over it plus a bulk action.

- **Sources filter:** lessons (by day range), standard cards, themed decks, learner decks, library episodes.
- **Status filter:** missing · flagged · failed · blocked (no sheet) · stale spec · ready.
- **Type filter:** word 1:1 · phrase 4:3 · scene 16:9 · example 4:3 · cover.
- A grid of image cards (preview or placeholder, key, status reason, used-by count) with multi-select, or "حدد كل الناقص في الفلتر ده".

### 5.2 Before generating

**"ولّد المحدد"** opens a summary first:

- how many are selected, how many are **already ready under the same key** (reused, cost 0), how many are blocked and why ("٣ محتاجين شيت rita"), and how many will really be generated;
- split by pipeline: **lesson pipeline** (lesson model, medium quality, cast sheets) vs **deck pipeline** (cheap model, low quality, style anchor only, `12` §2.10), each with its estimated cost;
- today's cap left; if the batch goes over, the summary says how many will run today and how many tomorrow, and Omar can confirm once to go past the cap (same rule as `12` §2.10 admin action).

### 5.3 Specs come first

- Lesson images need the lesson's `image_specs` call (visual brief + shot plan, `00` §10). If a selected lesson has no specs yet, the batch runs that call first for that lesson (shown as its own step in the batch, with its cost).
- **Standard cards with no lesson yet:** `image_specs` may run from **core-items alone** (situation, items, day cast from the place rotation, no story lines). Those specs are stored with `source: pre_lesson`. When the lesson is later generated, those specs are **not** rewritten automatically; the image shows a quiet "اتعملت قبل الدرس" tag and the filter "stale spec" lists them, so Omar decides whether paying again is worth it. Default: keep them.
- Deck images use code templates (`12` §2.10), no spec call.

### 5.4 Running

- One **image batch** in الشغل: "صور الأيام ١–١٠ · ٤٢ من ٩٠ · ٣ اتعلّموا (flagged) · ٠ فشل · $1.40".
- Concurrency 2 (`00` §10), the Haiku QA + meaning check with one automatic retry, then flagged. Cloudinary upload, `image = { key, url }` written on every item, lesson, story and deck that uses the key.
- Pause, resume, cancel (a running image finishes; queued ones stay missing). At the daily cap, automatic continuation tomorrow, shown as "هيكمّل بكرة الساعة …".
- Order inside a batch: blocked are skipped, character sheets missing are listed with a link to الشخصيات, then scenes, then phrases, then words (scenes and phrases are what the learner sees first).
- After the batch: a review grid of the new images, flagged first, with approve / regenerate / edit spec / upload per image (the existing per-image actions).

---

## 6. Jobs (الشغل)

- Every paid action is a background job on the **existing job runner** (the same one `14d` §2.6 uses). New kinds: `lesson_run`, `lesson_stage`, `lesson_page`, `cards_day`, `deck_generate`, `image_specs`, `image_item`, plus a parent **batch** that groups many jobs.
- The jobs page: running · queued · finished · failed tabs, grouped by batch, each with progress, cost so far, started by (admin email), and actions (pause, resume, cancel, retry failed only).
- A failed job retries only on click (except the built-in one-retry rules of each job). "اعد الفاشل بس" on a batch retries just its failed children.
- Closing the tab never cancels anything. Two admins (later) see the same state.
- The top-bar pill and the home "محتاج منك" list read from here.

---

## 7. Cost (التكلفة)

- One page for the whole app (the library cost page from `14d` §2.5 becomes a filter here): per day and month, by kind (lesson stages, cards, decks, images by pipeline, library script / tokens / audio), per lesson and per deck totals, cap bars.
- Every job logs model, tokens, cost and latency; the page totals must match the job logs.
- Estimates use the rolling average of the last 20 jobs of the same kind and model, and fall back to the model price × expected tokens.

---

## 8. Data additions

- `v2_gen_runs`: one per lesson generation run — day, language, trigger (single | batch id), stages (status, started/finished, tokens, cost, warnings, error, attempts, `input_hash`, stale flag), sub-progress for pages and questions, prompt versions.
- `v2_batches`: kind (lessons | cards | decks | images), filter used, children job ids, counts per status, cost, paused flag, created by.
- Item bank: per card field `source` (cards_job | lesson | authored) so the lesson run knows what not to rewrite; per day `cards_status` and `cards_input_hash`.
- `v2_images`: `spec_source` (lesson | pre_lesson | deck_template), `batch_id`.
- `v2_official_decks`: `origin` (admin_topic | promoted).
- Audit: every publish, approve, hide, bulk start and cap override stores who and when.
- The `input_hash` on each stage and on cards is what makes "never pay twice" and "stale" work: same hash → reuse; different hash → stale.

---

## 9. Tasks for Cursor

One task per session, in order, tests included, stop at "Done when". Prompt:

> Read docs/az-talkie-v2/15-admin-dashboard.md (whole), AGENTS.md, 00-decisions.md §0b, §0c, §3, §4, §5, §5b and §10, 12-custom-decks.md §2 and §6, and 14d-library-admin.md §2.5–§2.6. Implement task **D-x only**. Do not start the next task. Admin pages and APIs live under `/v2-admin` and use the existing v2 admin guard. Reuse the existing job runner, image pipeline, deck generator and per-lesson admin pieces; don't write second copies. Never write Portuguese or Arabic content yourself. Write the tests the task asks for. Stop when "Done when" is met and list the files you changed.

**D0 · Decisions**
- Do: add "§0c Admin dashboard" to `00` (standard cards from core-items before the lesson, same item ids; admin themed decks from a topic as draft official decks; pre-lesson image specs kept by default; one bulk image queue); link this doc from the README.
- Done when: docs updated, nothing else changed.

**D1 · Shell and home**
- Do: the full-screen admin shell (§2.1), the three breakpoints (§2.2), search, the running-jobs pill, home cards and "محتاج منك" (§2.3); move the existing admin pages into the shell without changing them. List in the PR which existing admin pages, job runner pieces and lesson pipeline stages were found and reused.
- Tests: non-admins are refused on every dashboard route; home counts match seeded data.
- Done when: Omar opens `/v2-admin` on desktop, tablet width and his phone, and each layout follows §2.2.

**D2 · Runs and the lessons table**
- Do: `v2_gen_runs` with `input_hash` per stage; the lesson pipeline writes stage status, tokens, cost and warnings into it; the lessons table with stage chips and filters (§3.1).
- Tests: a finished run shows every stage done with cost; changing core-items marks later stages stale; a day with unapproved core-items can't be selected.
- Done when: the table shows days 1–3 with their real stage history.

**D3 · Step-by-step timeline**
- Do: the التوليد tab (§3.3): timeline, live polling, page and question sub-progress, failure box with raw output, rerun one stage with the stale list, resume from the failed stage, one run per day, the publish gate step.
- Tests (stub model): a page failure reruns only that page; resume skips done stages with the same hash; a second run on the same day is refused.
- Done when: Omar generates day 4 and watches it go stage by stage, reruns the story, and sees outline and pages turn stale.

**D4 · Batches and bulk lessons**
- Do: `v2_batches`, the queue with `LESSON_GEN_CONCURRENCY`, estimates, pause / resume / cancel, retry failed only; "ولّد من يوم … لـ يوم …"; the jobs page (§6).
- Tests: a failed day doesn't stop the batch; cancel leaves the running day resumable; concurrency never goes over the env value.
- Done when: Omar generates days 5–8 in one batch and follows it in الشغل.

**D5 · Standard cards from core-items**
- Do: the cards job (§4.2), writing into the item bank with field `source`, the checks, `cards_status` and stale; the lesson `items` stage reads and never overwrites existing card fields; the learner situation deck reads from the item bank whether or not the lesson exists; the الكروت tab on a day; bulk cards.
- Tests (stub model): cards for day 10 exist with no lesson; generating day 10's lesson afterwards keeps every card field and item id; a learner's item state is unchanged; function words get no card; an unpublished lesson stays locked while its deck shows on its day.
- Done when: Omar makes the cards for days 9–12 before their lessons and reviews them on his phone.

**D6 · Themed decks from a topic**
- Do: "ديك جديد" and the bulk topic list (§4.3) on the `12` generator with no quota, saved as draft official decks; existing-deck search first; the draft editor reused from `12` C9; the من المتعلمين tab (§4.4).
- Tests: admin generation doesn't touch learner quotas; a word that exists in a lesson bank reuses the official id; a draft never shows to learners until published.
- Done when: Omar creates and publishes "المطبخ" and "عند الدكتور" from topics.

**D7 · Bulk images**
- Do: the images screen (§5.1), the pre-run summary with reuse, blocked, the two pipelines and the cap (§5.2), the spec step and pre-lesson specs (§5.3), the batch run, ordering, pause / resume, continue tomorrow, and the review grid (§5.4).
- Tests (stub image model): a ready key is counted as reused and costs 0; a blocked image is skipped with its reason; pre-lesson specs are not rewritten when the lesson is generated; the cap stops the batch and it resumes the next day; deck images use the deck pipeline, lesson images the lesson pipeline.
- Done when: Omar selects all missing images for days 1–10 plus the "المطبخ" deck, sees the count and cost, runs it, and reviews the flagged ones.

**D8 · Cost page**
- Do: §7 for all kinds, with the library cost as a filter; estimates from the rolling average.
- Tests: totals match the job logs; an estimate with no history falls back to price × expected tokens.
- Done when: Omar sees today's and this month's cost split by lessons, cards, decks, images and library.
