# 19 · لقطات (Micro clips): short daily "tools" in themed series

Status: plan, 2026-11-26. **Revised the same day** after the first Stitch pass (`stitch_bilingual_grammar_notebook_app_18`) looked like a copy of the lesson vocab_flow: a clip is now **one connected sheet** (not a feed of separate beats), in three layouts: list, pairs and scene (§3.2); a fourth, `rule` (conjugation by induction), and series 13–16 were added later the same day. Design approved from `stitch_bilingual_grammar_notebook_app_19`, with two changes: Portuguese is always heard and seen first and a reveal shows only the translation (§3.3), and everything must be buildable in React Native (§3.3b). Author: Omar + Claude. Implementation: Cursor.

App: **az-talkie**. Source module: Langify **Micro Learn / Daily Word Check** (`docs/micro-learn-feature-report.md`, `docs/micro-learn-practice-generator.md`, `backend/src/data/dailyWordCheckReference.json` in the old repo, 153 topics).

Read first: `AGENTS.md`, `00-decisions.md` (§2, §5, §10), `12-custom-decks.md` (§2.1 item pool, §2.4 checks, §2.6 deck sessions, §6 official decks), `16-practice-engine.md` (§1, §2). Where this doc disagrees with `12` about where official themed decks come from, **this doc wins**, and task M0 writes the change into `12` and `00`.

No code in this document by design.

---

## 1. The feature in one paragraph

Lessons teach **situations**, the library gives **real exposure**, and لقطات gives the **tools you need every day**: daily verbs, demonstratives (este · esse · aquele), question words, "I didn't understand", time, numbers, quick replies, linking words. Content is grouped in **series** (سلاسل), and each series is a short ordered list of **clips** (لقطات). A clip is **one screen with 6–10 connected lines on one idea**, like the reel posters people save ("KOCHEN A1": ten numbered sentences about cooking, each with a small picture). Each line's Portuguese plays as it becomes active; the learner taps to reveal its **Arabic translation**, then the highlight **moves to the next line by itself**. One tap per line, the whole set stays visible, so the lines read as one connected thing. A clip comes in one of four **layouts**: a numbered **list** of sentences, **pairs** in two columns (Arabic beside Portuguese), a **scene** (one main picture where each word lights up the part of the picture it names), or a **rule** (a conjugation rule on top, with examples from different verbs so the learner works the rule out). Home shows **"لقطة النهارده"**. Each series is also an **official themed deck** in the flashcards "مواضيع" tab. The same clip data renders the **TikTok / Instagram reels**, so one piece of content feeds both the app and marketing.

---

## 2. What we keep from Micro Learn, and what we change

### 2.1 Keep

- **Reveal one line at a time, with TTS, then move on automatically.** This rhythm is what made Micro Learn useful.
- **The whole set on one screen** (the old player was a vertical list of 10 rows too).
- **Item kinds:** words, fixed phrases and pattern sentences; patterns are taught inductively (a template plus examples, no grammar lecture).
- A replay and self-test mode, now **listening mode** (Portuguese audio only, text hidden; §3.3). The old Arabic-first reverse mode is dropped.
- **The topic briefs** (`promptGuidance` of the 153 topics) as the generation brief, re-sorted into series (§4).
- **pt-PT rules** from the old system prompt (Brazilian blacklist, postverbal clitics, `estar a + infinitivo`).
- **Completion → items enter SRS.**

### 2.2 Change

| Micro Learn (old) | لقطات (v2) | Why |
|---|---|---|
| Generated per user on first open (sync, up to 120 s) | Generated **once per language** in admin, reviewed by Omar, then published | Same content for everyone; no wait; "review once, generate once" |
| A flat list of 10 rows, one emoji each | Four layouts: **list**, **pairs**, **scene**, **rule** (§3.2), with a header picture and a small icon per row | Looks like the reels people save; the lines read as one connected set |
| Topic = a whole theme (80+ topics flat) | **Series → clips**, one idea per clip | The learner grabs exactly the tool they need |
| Own card deck `srs-user-*` | Items are **shared item ids** (official lesson items or the `12` pool) in `v2_item_state` | One word = one SRS state everywhere |
| Practice bank of 12 LLM questions, LLM grading | **No quiz inside the clip.** Hearing the Portuguese before revealing its meaning is the recall; listening mode is the self-test; review happens in the series deck session | It must not feel like a lesson; no grading model |
| Day only steered the "recommended" badge | "لقطة النهارده" picked by **overlap with the current and next lessons** (§6) | The clip supports what the learner studies now |
| Verb forms written by the model | Verb forms only from the **verified conjugation table** (`00` §2) | Same rule as lessons and custom decks |
| XP stored on the check only | No XP. Progress through `/api/v2/progress/events` | One progress system |

---

## 3. Decisions

### 3.1 Where it lives (footer tab — changed 2026-11-26)

- **Footer tab «لقطات»:** topics list at `/micro` (series from the outline). Tap a series → **ensure** missing clips + images (shared once per language) with a loader, then open the player.
- **Home:** a "لقطة النهارده" card under the lesson hero (one clip, one tap to open).
- **Flashcards → "مواضيع" tab** still lists series with **"اتفرج"** / **"راجع"** (deck session, `12` §2.6).
- **Inside a lesson:** when a lesson step uses a tool that has a clip, a small chip "شوف لقطة: este · esse · aquele" opens it and returns to the lesson.
- Between clips of a series: swipe up for the next clip (one sheet per screen).
- Player is full-screen (no footer) under the flow layout.

### 3.2 A clip = one connected sheet

Every clip has:

- a **header band**: the title in Portuguese, big (like "KOCHEN"), the Arabic title under it, and a calm level label (سهل جداً … صعب, no CEFR);
- a **main picture** (watercolour, a real Lisbon scene with people in action);
- **6–10 lines** on one idea, in a fixed order that tells a small sequence where possible (go into the kitchen → wash hands → cut → …);
- an optional **one-line note** pinned under the lines, in Egyptian (the micro-grammar "why"): «este للي جنبك، aquele للي بعيد».

**Four layouts** (the author picks one per clip):

1. **`list` (numbered sentences).** Like the KOCHEN poster: a numbered circle, a small icon of the action or object, then the line. Best for daily verbs, routines, quick replies, "لما متفهمش", polite requests.
2. **`pairs` (two columns).** Arabic chips on one side, Portuguese chips on the other, one pair per row, the rows stacked tightly so they read as one block (like the "I have / Tengo" reel). Best for short chunks: verb forms (eu tenho · eu quero · eu preciso…), question words, time words, numbers, connectors.
3. **`scene` (one picture, lit-up parts).** The main picture is large and each line is tied to a **region** of it. When a line becomes active, that region gets a soft ring and the rest of the picture dims slightly; when the line is revealed, a small label appears on the region. Best for demonstratives (the woman points at the cake in the display), "فين الحاجة" (em cima da mesa, ao lado da janela), rooms, the body, a shop counter.
4. **`rule` (a rule on top, examples from different verbs) — added 2026-11-26.** For learning conjugation **by induction**. A rule card is pinned under the header: the pattern in one short line plus a tiny ending table (e.g. «-ar ← eu ‎-o» with fal**ar** → fal**o**). Under it, 6–8 numbered sentences, **each with a different everyday verb** that follows the rule, and in every sentence the **ending is highlighted** (teal, bold) so the learner sees the same change repeat across verbs: «Eu fal**o** português.», «Eu trabalh**o** em Lisboa.», «Eu mor**o** perto do metro.». The last 1–2 lines may show a short contrast («ele fal**a**») only if the rule is about that contrast. Same interaction as the other layouts: the Portuguese plays first, the tap reveals the Arabic. The rule card has no long explanation; the learner works the rule out from the examples, and the one-line Egyptian note sums it up at the end.

### 3.3 Interaction (all layouts) — Portuguese first, always (decided 2026-11-26)

**Rule:** the learner always **hears and sees the Portuguese first**; a reveal only ever shows the **Arabic translation**. Nothing in the module hides Portuguese behind Arabic.

- **Start state:** the header, the picture and every row are visible. Each row shows its number, its icon and its **Portuguese line**; the **Arabic is hidden** (a placeholder bar). Rows after the active one are dimmed. The first row is **active** (teal outline).
- **A row becomes active → its Portuguese audio plays by itself** (and in a scene its region gets the ring).
- **Tap the active row (or anywhere on the sheet) → the Arabic translation appears** under the Portuguese (in a scene, the region label appears too).
- **Then the highlight moves to the next row automatically** (about 1.5 s after the reveal), which plays the next Portuguese line. A tap on the next row moves on at once. Tapping any earlier row replays its audio.
- **Pairs layout:** the Portuguese column is the visible, playing column; the Arabic column is the hidden one that a tap reveals (the first Stitch pass had it the other way round).
- **Listening mode** «وضع السمع» (replaces the earlier reverse mode; a toggle in the header, and the default when replaying a finished clip): the Portuguese **text** is hidden too, so the learner only hears the line; a tap shows the Portuguese and its Arabic together. Still Portuguese first, never Arabic first.
- **Auto-play** (a play button in the header): plays and reveals the rows one after the other with no taps, like watching the reel. Pause on tap.
- **No self-rating buttons** («عرفتها / محتاج مراجعة») inside the clip; rating happens in the series deck session.
- **End:** when the last row is revealed, a bottom sheet slides up: «اتضافوا لكروتك ✓ · ٨ جمل», with "اللقطة اللي بعدها" and "تاني بوضع السمع". No score, no quiz.
- **Save a single line:** a long press (or the ♡ on a revealed row) sends just that line to the learner's private deck, even if the clip isn't finished.
- Audio: the same TTS route and voices as lesson items (Azure for pt-PT, lazy and cached). Not ElevenLabs.

### 3.3b React Native rule for the sheet and the scene (decided 2026-11-26)

The same player will be rebuilt in React Native, so the web version uses **only things that map one-to-one to RN primitives**. Nothing in this module may depend on a web-only feature.

- **Scene picture:** one image inside a container with a **fixed aspect ratio** (4:3; the main picture is generated at exactly that ratio). The image fills it with no cropping, so a box stored as fractions maps to the same spot on any screen. No `cover` cropping, no pinch-zoom, no pan in v1.
- **Region ring and label:** plain absolutely positioned boxes placed by **percent of the container** (left, top, width, height from the stored fractions); in RN the same values are multiplied by the size from `onLayout`. The ring is a bordered rounded box; the label is a small pill anchored to the box's top edge, flipped inward when it would leave the picture.
- **Dimming the rest of the picture:** a single semi-transparent layer over the whole image, with the ring and label drawn above it. **No SVG masks, no CSS `clip-path`, no cut-outs, no `mix-blend-mode`.**
- **Hidden text:** a solid **placeholder bar** with the approximate width of the text. **No CSS blur or `backdrop-filter`**, and the real hidden text is not rendered underneath (it isn't sent to the screen until revealed).
- **Animation:** only opacity, scale and translate (Animated / Reanimated in RN, CSS transitions on web). No layout-property animation, no Lottie needed.
- **Taps:** tap and long press only (`Pressable` in RN). No hover states that carry meaning, no right-click, no drag for the learner (dragging boxes is admin-only and web-only).
- **Audio:** one queue that plays a line and reports "ended" (expo-av / expo-audio in RN), used to time the auto-advance. No Web Audio API features.
- **Vertical paging between clips:** a vertically paging list (`FlatList` with paging in RN), not scroll-snap tricks.
- **Icons and images:** plain PNG/WebP URLs from Cloudinary; no inline SVG illustrations, no emoji-as-icons (emoji render differently on Android).
- **Fonts:** the same Lumina fonts bundled in the app; Arabic and Portuguese never in the same text run inside a row (two separate text elements), so RTL/LTR behaves the same on both platforms.

### 3.4 Items and SRS

- Every line resolves to an **item id** with the lookup of `12` §2.1: an official lesson item if it exists, otherwise a pool item with `status: official`. Sentences are items of `pos: phrase`; pairs and scene labels are usually words or short chunks.
- Finishing a clip marks its items as **seen** (`اتعرّفت`) and adds them to the series deck. The series deck session shows due cards first, then **at most 10 new a day per series** (`12` §2.6).
- **Not in the daily curriculum deck** and **not in the 3-lesson review window** of `16`. A clip item that's also a lesson item has the same id, so lesson review benefits anyway.
- Graduation: as `12` §2.6 for clip-only items (interval ≥ 21 days).
- Streak: a finished series deck session (≥ 10 cards rated) counts. Clips alone don't count in v1.

### 3.5 Not locked, but ordered

- Every series and clip is open to everyone; level labels only.
- Inside a series, clips keep Omar's order. The series list has a "مكمّل فيها" section on top.

---

## 4. Starter series (Portuguese)

Mapped to the old topic ids so the briefs are reused. The suggested layout is in brackets.

1. **أدوات الإشارة · este, esse, aquele** (5): este/esta at the pastry counter [scene] · esse/essa [scene] · aquele/aquela [scene] · isto/isso/aquilo [pairs] · aqui/aí/ali/lá [scene].
2. **الأفعال اليومية** (12, one verb per clip): ser · estar · ter · ir · fazer · querer (and «queria») · poder · precisar de · gostar de · saber · ver · dar. Each clip: a [pairs] block of forms from the verified table, or a [list] of 6–8 everyday sentences with the verb. TC_PT_003, 004, 011, 017, 020, 030, 034, 035.
3. **أدوات السؤال** (4): onde · o que / quem · quando / a que horas · quanto / qual [pairs + list]. TC_PT_005, 006.
4. **لما متفهمش** (2): «Não percebi» · «Pode repetir / mais devagar?» · «Como se diz …?» [list]. TC_PT_072, 093.
5. **ردود سريعة** (3): pois / claro / exato · está bem / combinado · obrigado / de nada / desculpe [pairs]. TC_PT_054, 092.
6. **الوقت والمواعيد** (4): a hora · hoje / amanhã / ontem · os dias · de manhã / à tarde / à noite [pairs]. TC_PT_007, 008, 063, 067.
7. **الأرقام والفلوس** (3): 1–20 · prices · «Quanto é?» / quantities [pairs + list]. TC_PT_042, 056.
8. **فين الحاجة** (3): a room [scene] · a table and a shelf [scene] · on the street [scene]. TC_PT_021, 022, 053.
9. **يومك** (4): de manhã · no trabalho · em casa à noite · cozinhar [list, a short sequence each]. TC_PT_024, 027.
10. **حالك وإحساسك** (2): estou cansado / feliz… · tenho fome / sede / frio, dói-me [pairs + scene of the body]. TC_PT_023, 065.
11. **اربط الكلام** (3): e / mas / ou · porque / por isso · primeiro / depois / no fim [list]. TC_PT_041, 057, 070, 099.
12. **اطلب بأدب** (2): «Queria…» · «Pode…? / Podia…? / Se faz favor» [list]. TC_PT_020, 040.
13. **بتاعي وبتاعك** (3): eu / tu / ele / ela / nós / eles [pairs] · o meu / a minha / os meus / as minhas [scene: things on a desk] · o teu / o seu / o nosso [list]. (Added 2026-11-26.)
14. **الصفات والألوان** (3): colours with gender agreement (vermelho / vermelha) [scene] · grande / pequeno, novo / velho, caro / barato [pairs] · «O carro é…», «A casa é…» agreement in sentences [rule]. TC_PT_010, 018, 077.
15. **النفي** (2): não before the verb, «Não sei / Não percebo / Não tenho» [list] · nunca / nada / ninguém / também não, with the double negative «Não tenho nada» [pairs + list]. (Added 2026-11-26.)
16. **التصريف بالاستنتاج** (10, all [rule]; added 2026-11-26): present eu ‎-ar → ‎-o · present ele/ela/você ‎-ar → ‎-a · present eu and ele for ‎-er / ‎-ir (como / come, parto / parte) · nós ‎-amos / ‎-emos / ‎-imos · eles ‎-am / ‎-em · past eu ‎-ar → ‎-ei (falei, trabalhei) · past eu ‎-er / ‎-ir → ‎-i (comi, parti) · past ele ‎-ou / ‎-eu / ‎-iu · future «vou / vais / vai + infinitivo» with different verbs · «estou a + infinitivo» (what I'm doing now). Irregular verbs stay in «الأفعال اليومية»; a rule clip uses **regular verbs only**, so the rule holds for every line. Ordered to follow the tense order of the curriculum (present → past → future), and each clip's level label follows where that tense appears in the lessons.

About 65 clips for launch. Situational topics of the old list (café, pharmacy, bank…) are **not** ported: lessons and the library cover situations. A `list` clip may still use a place as its frame (cooking, the morning routine) when the point is the verbs.

---

## 5. Generation and review (admin)

- **Outline** is authored data (a file per language: series, clip titles, layout, level, the old `TC_PT_xxx` ref, an optional extra brief). Nothing is generated for a line until Omar marks it ready.
- **Per clip, one model call** (Claude Sonnet from env, one JSON call, server only) with the outline line, the old `promptGuidance`, the rules (pt-PT, MSA meanings, Egyptian note, 6–10 lines, each line ≤ 8 words, lines in a natural order, no conjugated forms from the model) and the list of lesson items it should reuse where they fit.
- **Output:** title (pt + ar), note (optional), the main image spec, and the lines: tl, ar, pos, `concept_en`, `icon_spec` (one short object or action for the small row icon), and for `scene` clips `region_hint` (what in the picture the line points at, e.g. "the cake behind the glass, under the woman's finger").
- **Checks (code):** the `12` §2.4 checks, plus: 6–10 lines; ≤ 8 words a line; `pairs` lines ≤ 4 words; for verb clips every form is replaced from the verified table (a verb missing from the table can't have a clip yet); every `scene` line has a region hint; for `rule` clips: every verb is different, every verb is regular and present in the verified table, every form is replaced from the table, and **code** marks the highlighted ending by comparing the form with the table's stem (the model never marks it); a line whose verb breaks the rule is dropped. A failing line is dropped; under 6 → one top-up call; still under 6 → the clip stays draft with the reason.
- **Pictures:**
  - the main picture: the lesson image pipeline (watercolour style anchor, generic places, no text in the image); for `scene` clips the spec lists every object the lines need, in clear separate spots;
  - row icons: small flat icons from the `12` §2.10 cheap pipeline, keyed `icon.<concept_en>` and reused across clips;
  - **scene regions:** after the main picture is ready, one vision call (Haiku) returns a box for each region hint, stored as fractions of the image (x, y, w, h). The admin sees the boxes drawn on the picture and can **drag or resize** any box. A line whose region isn't found is flagged, and the clip can't be published until the admin places it.
- **Admin screen:** series → clips, each clip shown as it will play (with audio and the scene boxes), "ولّد", "ولّد تاني", remove or edit a line, fix boxes, **publish**. Bulk "ولّد كل السلسلة". Cost and tokens logged.
- **Authored override:** an outline line may carry the full lines (and boxes); then no model call.

---

## 6. "لقطة النهارده"

Code picks one clip per user per local date (no model), stored so it doesn't change during the day:

1. A published clip, not yet finished, whose items overlap the **current lesson or the next 2 lessons** the most.
2. Otherwise the next unfinished clip in a series the learner started.
3. Otherwise the next clip in the default series order (أدوات الإشارة → لما متفهمش → الأفعال اليومية → …).

No unlocks, no backlog, no "you missed yesterday's clip".

---

## 7. Marketing reels from the same data

- The four layouts **are** the reel formats: `list` = the numbered poster (KOCHEN), `pairs` = the two-column chips (I have / Tengo), `scene` = one picture with parts lighting up, `rule` = the rule poster with highlighted endings. A "quiz" reel is the listening mode (the Portuguese plays, the meaning appears after a pause).
- Admin action **"صدّر كريل"** on a published clip exports its title, layout, lines (TL, Arabic, audio URLs, icon URLs, scene boxes) and timings from the audio lengths, in the shape the Remotion templates expect (one template per layout, 9:16, app name at the end).
- No face, no character, no lip-sync. The Remotion project is outside this repo; this task only exports the data.

---

## 8. Data

New collections (prefix `v2_`):

- `v2_micro_series`: language, slug, `title_ar`, `title_tl`, order, `status` (draft | published), the linked official deck id.
- `v2_micro_clips`: series id, order, layout (list | pairs | scene | rule), the rule card for `rule` clips (pattern line, ending table), level 1–5, `title_ar`, `title_tl`, note, main image key, ordered lines (item id, icon key, for scenes a box as fractions), `legacy_ref`, status (draft | ready | published), generation cost, timestamps.
- `v2_micro_progress`: one per user × clip: started_at, finished_at, replays, revealed count (to resume). **User-keyed** (A5 list).
- Main pictures are stored with their aspect ratio (4:3 for scenes); scene boxes are fractions of that image (§3.3b).
- `v2_micro_daily`: one per user × local date: the chosen clip id. **User-keyed** (A5 list).
- Reused: `v2_custom_items`, `v2_official_decks` (one per series, `source: micro`), `v2_item_state`, `v2_images` (main pictures and `icon.*` keys), TTS cache.

---

## 9. Open points (decide later, not blocking)

- Should clip items with misses in the series deck feed the practice engine's weak points (`16`)? Default no in v1.
- Should 3 clips in a day count for the streak? Default no in v1.
- A "follow series" switch that makes "لقطة النهارده" stick to one series.

---

## 10. Tasks for Cursor

Same rules as `12`: one task per session, in order, tests included, stop at "Done when". Prompt:

> Read docs/az-talkie-v2/19-micro-clips.md (whole), AGENTS.md, 00-decisions.md, 12-custom-decks.md §2.1, §2.4, §2.6, §2.10, §6 and 16-practice-engine.md §2. Implement task **M-x only**. Do not start the next task. The user id always comes from the session helper. Only `/api/v2/answers` writes item state. Never write Portuguese or Arabic content yourself; it comes from the model or from Omar. Write the tests the task asks for. Stop when "Done when" is met and list the files you changed.

**M0 · Write the decisions**
- Do: add "§5d لقطات" to `00-decisions.md` summarising §1–§3; in `12` §6 note that official themed decks now come from micro series; link this doc from the README.
- Done when: docs updated, nothing else changed.

**M1 · Collections and outline file**
- Do: the models of §8 with indexes; the outline file format and a loader; the A5 additions; port the 16 starter series of §4 into the outline file with their layout, `legacy_ref` and the old briefs.
- Tests: the loader rejects a clip without layout or level; the A5 deletion test passes.
- Done when: tests pass and admin can list the outline (read-only).

**M2 · Clip generation and checks (no images, no UI)**
- Where: `lib/v2/micro/generate`.
- Do: the model call of §5 with lesson-item reuse, the checks, verb forms from the verified table, item resolution, top-up, cost logging, authored override.
- Tests (stub model): a Brazilian line is dropped; a line over 8 words is dropped; a `rule` clip drops an irregular verb and a repeated verb, and its highlighted endings come from the table; a verb clip never keeps model-written forms; a scene line without a region hint is dropped; an item that exists in a lesson resolves to the lesson id; 5 good lines trigger exactly one top-up; an authored clip makes no model call.
- Done when: tests pass and the 5 clips of «أدوات الإشارة» generate for Omar to review.

**M3 · Pictures, icons and scene regions**
- Where: `lib/v2/micro/images`.
- Do: main picture per clip; `icon.<concept_en>` row icons with reuse; the vision pass that returns a box per region hint; flags for lines with no box.
- Tests (stub models): an icon key already ready is reused at no cost; a missing box flags its line and blocks publish; boxes are stored as fractions between 0 and 1.
- Done when: the «este / esta» scene shows its boxes in admin on the real picture.

**M4 · Admin review and publish**
- Do: series → clips screen with play-as-learner preview, generate / regenerate / bulk generate, remove or edit a line, **drag and resize scene boxes**, publish clip and series; publishing a series creates or updates its official deck (`source: micro`).
- Done when: Omar publishes «أدوات الإشارة» and it appears as a deck in "مواضيع".

**M5 · Clip sheet player**
- Do: the sheet of §3.2–§3.3 for the four layouts (the `rule` highlight is nested text spans, which RN supports), following the React Native rule of §3.3b: active row plays its Portuguese, tap reveals the Arabic (+ region ring and label in scenes), auto-move to the next row, replay a row, listening mode, auto-play, the end sheet, ♡ / long press to save one line, resume from the revealed count, swipe up to the next clip. Progress events for start and finish; finishing marks items seen and adds them to the series deck.
- Tests: finishing writes one finish event and marks items seen once; reopening resumes at the next unrevealed row; the Arabic of an unrevealed row is not in the rendered output; listening mode never shows Arabic before the Portuguese; saving one line adds only that item; a scene box at the same fractions lands on the same spot at 360px and 430px widths.
- Also: a short `components/v2/micro/README` listing which web pieces map to which RN primitives, so the RN port is a translation, not a redesign.
- Done when: Omar plays one clip of each layout on his phone.

**M6 · Series list in "مواضيع"**
- Do: series tiles with "اتفرج" and "راجع", the "مكمّل فيها" section, level labels; "راجع" uses the deck session of `12` §2.6.
- Tests: a series deck session shows at most 10 new cards a day; a clip item that's also a lesson item has one SRS state.
- Done when: Omar reviews the demonstratives deck after watching its clips.

**M7 · "لقطة النهارده" and lesson chips**
- Do: the picker of §6 (stored per user × date), the home card, the in-lesson chip that opens a clip and returns to the same lesson step.
- Tests: with lesson N using «este», the picker chooses a demonstratives clip; the choice doesn't change on reload the same day; a finished clip is never picked again.
- Done when: the home card shows a clip that matches Omar's current lesson.

**M8 · Reel export**
- Do: the "صدّر كريل" admin action of §7.
- Done when: Omar renders one reel per layout in his Remotion project from exported clips.
