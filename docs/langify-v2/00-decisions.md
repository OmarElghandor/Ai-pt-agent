# 00 · Decisions (single source of truth)

If any other doc disagrees with this file, this file wins. Each line is a decision, not a suggestion. Decisions marked **(new)** came after the detailed Arabic docs were written and are not in them yet.

## 0. Platform (new, 2026-10-19)

- **Everything in v2 is built from scratch in one repo: `ai-agent-talk`** (folder `ai-pt-agent`). That covers content, renderer, cards, practice, the daily loop and generation.
  - Stack: Next.js 16 App Router, React 19, Tailwind 4, zod 4, Mongoose 9, the Anthropic SDK, plus the existing TTS and STT routes. Read the repo's `AGENTS.md` first, because this Next.js version differs from what models know.
- v2 is a **mobile-first web app (PWA)**, RTL, designed at 390px width and centered on wider screens. The Stitch designs are the visual target.
- The `langify` repo (Express backend plus the Expo app) is **legacy and frozen**. v2 reads only identity from it: Langify `users`, read-only, through `lib/langifyRead`, as today. v2 never writes Langify collections.
- All v2 data lives in this repo's own collections, prefixed `v2_`.
- The grader and the reactor are internal modules called by v2's own answer route. There is no cross-service HTTP and no shared secret.
- The old `/lessons` and `/chat` pages keep working until v2 replaces them; then they're removed.

## 1. Product shape

- Audience: Egyptian Arabic speakers living in Portugal, A0–A1. Target language: European Portuguese (pt-PT). Later: English and German on the same engine.
- **(changed 2026-11-01) Lesson size: at most 14 core items.** Bigger lessons are split into two lessons, one after the other. The plan is now **109 days**: phase 1 is days 1–49 (41 lessons, 7 stories, and the A1 test on day 49), and phases 2–3 are days 50–109. The old → new day mapping is in `04` ("تقسيم الدروس الكبيرة"). Day numbers elsewhere in the docs that were written before this date use the old numbering unless they've been updated; `04` and this file are current.
- **(changed 2026-10-25)** 90 days, ordered **grammar-first**. Each day is one grammar unit, following the unit order of Practice Portuguese A1: regular present -ar → -er → -ir, then ser/estar, then the irregulars, then the past. The unit is taught **inside a street situation** that needs it, and the situation supplies the phrases, the words and the character conversation.
  - Anything urgent for a resident (Queria…, O que é isto?, Fui ao…, Dói-me…) comes early as a **ready-made chunk**, and its rule comes later in its place in the order. Numbers are the one exception, with their own day (day 8).
  - Each week ends with a story day (days 7, 14, 21, 29, 37, 44, 48 in phase 1). Full plan: `04-curriculum.md`.
- **(new)** Lesson titles are the Portuguese unit titles (e.g. "Verbos -AR 1", "Possessivos"), shown with an Arabic translation and the situation under them.
  - When a day covers more than one of their units, the extra unit titles are listed on it.
  - Story days, the second parts of split lessons, and day 47 have our own titles.
  - We reuse only the topic order and names, never their content.
  - Plan fields: `title_tl`, `title_ar`, `situation_eg`, `example_tl`, `rule_eg`, `extra_units_tl`, `early_chunks_tl`.
- **(new)** Days 1–49 are labeled **A1**, and phase 2 (from day 50) starts **A2**. This is aligned with the CIPLE A2 exam that residents need.
- SER vs ESTAR is now days 19–23. `examples/day06-example.json` is the ESTAR day, which is **day 22** in the new order. The file keeps its name, but its `day` is 22.
- A normal day has these steps, about 10 minutes in all: see the place (words) → situation phrases → one small rule → self-test → conversation with a character → review. Each step is one or more **pages**.
- The "Library" (المكتبة) is the book in its original order: rules, tenses, verb cards, picture dictionary, stories. A page unlocks there when the learner reaches it on the path.

## 2. Language and text

- The target-language field is always `tl` (feminine variant `tl_f`). Never name a field `pt`. The lesson has `target_lang` (`pt-PT`, later `en-GB`, `de-DE`).
- Two Arabic registers:
  - Meanings (`ar`, `ar_f`) are in simple Modern Standard Arabic (فصحى بسيطة).
  - Explanations, tips, coach lines, captions (`eg`) are in Egyptian Arabic.
- Pronunciation (`say`) is written in Arabic letters with these fixed mappings: g=ج, j=چ, s/ch (sh sound)=ش, initial r=غ, v=ڤ, p=پ, lh=لي, nh=ني, nasal sounds with a light ن. IPA (`ipa`) is optional and hidden by default.
- Any text that mixes Arabic and the target language is **rich text** (`rt`): a list of segments, each `{text, lang: eg|ar|tl, bold?, group?}`. The app sets direction per segment. Never build mixed strings by concatenation.
- Conjugated verb forms are **never written by an LLM**. They come from a verified conjugation table and are referenced by id `verb.<lemma>:<tense>:<person>`. Tenses: `inf, pres, pret, imperf, fut, cond, imp`. Persons: `eu, tu, ele, nos, eles` (always 5 rows; no vós). `ele` displays as "ele / ela / você"; o senhor uses the `ele` form.

## 3. Content model

- Four layers: **lesson → page → block → item**. Full spec: `02-content-schema.md`, example: `examples/day06-example.json`.
- Items are written once in the lesson's item bank: `word`, `phrase`, `sentence`, `form`, `pattern`. Blocks only reference items by id. Item ids are semantic and stable forever (`food.cheese`, `phrase.ask_price`, `verb.falar`).
- Exactly **14 block types**, closed list: heading, cards, table, compare, vs_pairs, formula, examples, tip, rules_list, dialogue, scene, panel, timeline, practice. No new block types without updating this file. Blocks never nest.
- Colors are **meanings**, never hex values in JSON: `group` ∈ `a, b, c, m, f, verb, prep, pron, neg, neutral`. In a comparison, the sides are a, b, c in order.
- Page `mode`:
  - `sections` **(new 2026-10-31, replaces `guided` for every grammar page: compare, pattern, conjugation)**: three parts, explain → examples → check. No steps, no autoplay, no asks. See §4 "Grammar pages".
  - `guided`: **retired 2026-10-31.** No new page uses it. Old drafts with steps are converted to `sections` on regeneration.
  - `explore`: controls (`reveal_axis`, `swap`, `unlock`) with `locked_until`.
  - `static`: everything visible.
- Target addressing inside a page: `b2`, `b2/col:0`, `b2/row:3`, `b2/cell:r:c`, `b2/entry:col:i`, `b4/item:2`.
- `cover` (the "غطّي" self-test) hides one of `meaning | tl | endings`.
- Presets (block order per page type): phrases, compare, conjugation, pattern, dictionary, scene, story, free.

- **(new 2026-10-24)** Lesson generation runs in resumable stages, as a background job:
  1. **Outline:** item bank plus the page plan. This is the order contract: for each page, what it `introduces` and what it `assumes`, its purpose and its handoff.
  2. **Pages:** generated in parallel, each one aware of the full outline, and assembled by outline index.
  3. **Crafted questions.**
  4. **Continuity pass:** regenerates only the flagged pages.

  A page may never use an item before the page that introduces it. Generation is text only for now: `image_spec` is stored, but images and audio are deferred (audio plays on demand through `/api/tts`).

## 4. Page experience

- **(changed 2026-10-27)** The look is **Warm Editorial** (Stitch export v5): cream paper, deep-teal titles and headers, coral pill actions, mustard tip cards, Newsreader + Noto Sans Arabic + Inter. The visual reference for every content page is `design/reference/01-content-page-possessives.png`, and `02-conjugation-endings.png` for verb pages. Guided behaviour still follows `prototypes/ser-estar.html`. The v4 navy look is archived in `design/archive-v4/`. See `05-design-system.md`.
- **(changed 2026-10-31) Grammar pages have no autoplay.** The rest of this bullet describes the retired guided mode and is kept only for history. Guided pages autoplay: a deep-teal caption bar pinned at the bottom shows one Egyptian sentence per step, with the tutor's voice, chapter segments, pause and speed. The current block gets a pale-yellow highlight. Parts not revealed yet are shown faint at 20% opacity, not hidden, so the learner always sees the whole poster. Playback stops only at `ask` steps. "الصفحة كلها" reveals everything at once.
- Explore pages: the learner drives with controls (a person dial, verb swap chips). Each control has a short tip. Practice blocks unlock when all options of a control have been seen.
- Few taps. Never one tap per line.
- **(new 2026-10-29) Story first.** Every non-story day has this shape:
  1. **Story (intro):** page 0 is a `story` page with a `dialogue` block. It plays in the StoryPlayer and presents the day's situation with today's items in context.
     - **Changed 2026-10-29: no questions.** The learner only watches and tries to understand. Every line plays by itself, the learner's lines included.
     - The meaning is hidden. A tap on "فهمت؟ دوس تشوف المعنى" shows it for that line.
     - There are no turns, no asks and no tips.
     - Nothing is "taught" yet.
  2. **Detail pages:** the dictionary, phrases, grammar (compare / pattern / conjugation) pages break down what was said in the story. They may point back to a story line ("من القصة").
  3. **Story again (test), changed 2026-10-31:** the same dialogue plays again from start to end **without stopping**.
     - **Never ask the learner anything while the story is playing,** in either mode. A question in the middle breaks the listening.
     - In this replay the meaning is hidden by default, with no hint and no tips. Per-line reveal is off.
     - When the last line ends, the end screen shows **3–4 short questions about the story**, then the result. For example:
       - "إينيس سألتك إيه؟"
       - "إنت رديت بإيه لما سألتك Tudo bem?"
       - the meaning of one line.
     - It is not a separate generated page. The app reuses page 0 in test mode.
  4. Then questions, practice and micro as before.
  - **Weekly story days (7, 14, 21, 29, 37, 44, 48)** stay as they are: a full story, with no detail pages.
- **(new 2026-10-30) Story builder.** The story is generated by its own job, before the outline, and the rest of the day is built from it.
  - **Order:** brief → items → **story** → outline → pages / questions / micro / daily_use → critic → continuity → lang_check → assemble. The outline and the page jobs receive the story as input.
  - **Storage:** each day has one story document per language, in its own file or collection (for example `stories/pt-PT/day-03`), with its own version and status. The lesson does not copy the lines. Page 0 and the test replay point to it by `story_id`. The publish gate checks the story document together with the lesson.
  - **Speaker on every line.** The model writes the cast and the lines, and every line names its speaker:
    - **Cast:** exactly two people on normal days, the learner and one character from the plan. Each cast entry has an id, a display name and a role.
    - **(new 2026-11-02) Gender and voice:** every cast entry has `gender` (m | f) and a `voice`. They are used for TTS and for gendered forms (obrigado / obrigada, cansado / cansada).
      - **Recurring characters** (yassin, ines, rita, manuel, sofia, carlos) take gender and voice from one character registry in code. A model value that disagrees is overwritten.
      - **New characters:** the model returns their gender, and code assigns a voice for that gender that isn't already used in the story.
      - **The learner's gender** comes from the user profile, defaulting to m until it's set. Learner lines are stored with both forms when they differ (`tl` + `tl_f`), and the player picks one by the profile. The learner's voice follows the same gender.
      - **Narrator:** a fixed neutral voice.
      - Each line's audio cache key includes the voice, so changing a voice never plays stale audio.
    - **Narration:** if it is needed, it uses the speaker `narrator`.
    - **What the view takes from the speaker:** the bubble side (learner on the left, the character on the right), the voice, and which lines the after-story questions ask about.
  - **Line shape:** `speaker`, `tl` as a plain string, `ids` (the items the line uses), and `extra` (words or chunks that are not in the lesson). The story has 6–10 lines, and the learner speaks 2–4 of them. There are no tips and no asks.
  - **(changed 2026-11-01) The story never blocks the day.** It is a soft job. Only structure is fatal; everything about content is a warning in the review report.
    - **Fatal (structure only):**
      - the output doesn't parse;
      - there are fewer than 4 lines;
      - a line has an empty `tl`;
      - a speaker is not in the cast.
    - **Auto-fixed by code, silently:**
      - unknown ids dropped;
      - a `replies_to` that doesn't point at an earlier line from the other speaker dropped;
      - "/" removed from `tl`;
      - lines with two sentences split;
      - punctuation normalized.
    - **Warnings only, shown in the review report, never retried:**
      - a must-cover item is missing;
      - the grammar focus is used fewer than 2 times;
      - extras are over 15%;
      - two time-of-day greetings are used as hellos;
      - there is a bare-noun line;
      - a line is too long;
      - the line count is outside 6–10.
  - **What the story must cover** is one list that code builds and puts in the prompt as MUST_COVER:
    - today's phrases;
    - the grammar pattern;
    - **one** member of each `variant_group`, picked by code. The prompt never lists the other members.
    - Words are optional: the dictionary page owns them.
  - **Extra content is allowed** up to about 15% of the tokens: words outside today, recycle and earlier days. Each extra is listed in the line's `extra` field with an Arabic gloss. Extras are never tested and never get a card.
  - **Retry and fallback:**
    - One retry, and only when there's a structure fatal.
    - If the retry fails too, the day continues **without a story**: page 0 and the replay are skipped, the outline orders pages by core items, and the day is flagged "story missing".
    - Generating the story again later is a separate admin action that never reruns the rest of the day.
    - Nothing downstream may wait on a failed story.
  - **Code owns:**
    - the Arabic of each line, checked by lang_check;
    - the after-story questions (3–4), built from the lines: "what did <character> ask" and "what did you reply to <line>" (3 options: the right line plus 2 said phrases of the same role from today or recycle, never from a future day), and one line meaning;
    - the bubble sides;
    - the scene image prompt.
  - **The outline follows the story:**
    - Detail pages come in the order in which their items first appear in the story.
    - ItemViewer examples and page tips quote real story lines by index. A tip that quotes a line that doesn't exist is rejected.
    - The code that appends a story page at the end is removed.
  - **Audio is lazy:**
    - Nothing is generated at build time.
    - The first time a line plays, TTS runs with that speaker's voice. The audio key is saved on the line in the story document: `audio.normal`, and `audio.slow` on the first slow play.
    - Later plays read the saved key.
    - There is one in-flight lock per line, so two first plays don't generate twice.
    - If `tl` changes, the saved audio is cleared.
  - **Reading on weekly story days (new 2026-10-31):**
    - After the story there is one short reading text (60–120 words): a description of a person, a place or a day, written by code-checked generation from that week's items only.
    - It is followed by 3 questions (read_meaning / true-false).
    - It is stored in the story document as `reading`.
  - **Weekly story days** use the same builder and storage, but the story is longer:
    - 12–20 lines in 2–3 scenes, from recycle only, with `max_new_words` from the plan;
    - each scene gets its own image.

- **(new 2026-10-31) Greeting variant groups.** Core items that are alternatives of each other (bom dia / boa tarde / boa noite) share a `variant_group`.
  - The story must use at least one member of each group. The others appear on the phrases page.
  - Two different time-of-day greetings used as hellos in the same scene is a **warning** (changed 2026-11-01: not fatal). A greeting used as a farewell in the last two lines is fine.
  - A character asking for something the learner already said is a **warning** in the review report.
- **(new 2026-10-31) Stop rule.**
  - Only fatal issues block publishing.
  - Critic medium and low issues go to the review report and are not auto-fixed.
  - Each day gets one repair round. After it, the day is published or flagged.
  - No full-day regeneration unless the brief or the core items changed.
- **(new 2026-10-31) Grammar pages** (compare, pattern, conjugation) use mode `sections`. A page has three parts, top to bottom.
  1. **الشرح (explain):**
     - The rule's main block shows right away: the formula, the compare table or the conjugation table.
     - Under it, the explanation: 2–4 short Egyptian sentences, with the TL words highlighted.
     - The explanation is read by TTS once when the page opens. A small button pauses or replays it.
     - Nothing else plays by itself.
  2. **الأمثلة (examples):**
     - Under the explanation is one arrow button, "الأمثلة ⌄".
     - One tap shows **all** the examples at once. There is no one-by-one reveal.
     - Each example plays its audio on tap.
     - Pattern pages get 3–5 examples, from code (patternFill).
     - The conjugation person dial and verb swap chips, if the page has them, live inside this part.
  3. **فهمت؟ (check):**
     - Under the examples are 2–3 simple questions about the rule only: choose the form, choose the article, or what the sentence means.
     - Each answer shows right or wrong at once, with a one-line why. A wrong answer also highlights the example it relates to.
     - The answers go to `/api/v2/answers` like every other question. They do not block the next page.
     - The questions are the page's own questions from the questions job (`page_index` = this page). Code picks the 2–3 that test the rule.
  - **Common mistakes (new 2026-10-31):** the explain part ends with 1–2 wrong → right pairs, for example ❌ Sou cansado → ✓ Estou cansado.
    - The wrong form is a `wrong: true` segment, and the checker accepts it.
    - Each pair also becomes a known near_miss in the grader and in the error taxonomy, with the same why line.
    - Generation picks pairs typical of Arabic and English speakers.
  - **What generation writes for a grammar page:**
    - the main block;
    - `explain` (rt, 2–4 sentences);
    - the examples (from code where possible);
    - the check question ids.
  - There are no steps, chapters or asks. All step-order, ask-spacing and step-count checks are removed for these pages.
  - This section overrides the guided rules in `02-content-schema.md`.

- **(new 2026-10-31) Formality.** Never teach "when in doubt, use você". In Portugal, você face to face can sound rude.
  - The safe polite form is o senhor / a senhora, or the verb with no pronoun (Pode ajudar? / Como está?).
  - tu is for friends, family and people your age who offer it ("Podes tratar-me por tu").

- **(new 2026-11-02) "بيقولوها كده" — real-world phrases.** Every lesson gets one extra page with **4–5 phrases people really say** in that situation in Lisbon, beyond the core items. For example, at the café: Uma bica e um pastel de nata · Pode trazer um copo de água? · A conta, se faz favor · Tem leite sem lactose?
  - **Where it sits (changed 2026-11-03, Omar's override):** right after the dictionary page. On days without a dictionary page, it goes after the phrases page.
  - **Exposure, not teaching:**
    - They don't count toward the 14 core items.
    - They're not in the story's MUST_COVER.
    - They don't get cards by default; each has "ضيفها للكروت".
    - **(changed 2026-11-03) They're in the day's questions:** 2–3 extra slots, on top of the 12 core slots (so a day has up to 15). Types:
      - `listen_meaning`;
      - `situation_choice`, a new type: a short Egyptian situation, for example "الجرسون سألك عايز حاجة تانية، ترد إزاي؟", answered by picking one of 3 TL lines;
      - at most one `say_it`.
      Each real-world phrase is tested at most once. The answers count for SRS on item × skill like any other item, and a wrong answer offers "ضيفها للكروت".
  - **Generated by a small `real_world` job** (one call, non-fatal):
    - Input: the situation, the core items, the known items and the phase.
    - Output, for each phrase: `tl` (and `tl_f` when it changes by gender), `ar`, `eg_note` (when and why to say it, in one Egyptian line) and a short `tag` (أسلوب مهذب، نصيحة لشبونية، الحساب…). The page also gets one tip that compares a common mistake with the local habit (for example Quero → Queria).
    - Code adds `say`, the audio keys, the image (only if the item asks) and the category chips. The chips appear only when there are 2 or more categories.
  - **Checks:**
    - pt-PT only, with no "/" in `tl` (use `tl_f`);
    - at most phase max_words + 4;
    - at most 2 words that aren't known, each glossed;
    - no duplicate of a core item;
    - at least 2 of the phrases use today's grammar or core words.
    - A failing phrase is dropped. If fewer than 3 are left, the page is hidden for that day, and the day still ships.
  - **Authored override:** core-items may carry `real_world: [...]` for a day. It's used verbatim and the job is skipped, like authored image prompts.
  - **Look:** `design/reference/17-real-world-phrases.png`. Don't copy from the Stitch file:
    - "Lesson Active" and the streak flame in the header;
    - 8 phrases (we show 4–5);
    - "/" inside a phrase;
    - the broken image icon.

- **(new 2026-11-03) "لاقي الصورة" step.** A short listening game after the grammar page and before the story replay. The day order becomes: story → detail pages (dictionary, real-world phrases, phrases, grammar) → **لاقي الصورة** → the story again (test) → أسئلة اليوم.
  - **It never generates images.** It reuses lesson image links (`items[].image.url`, filled from ready `v2_images` on read), and never requests or queues generation.
  - **Built entirely by code, with no model call.** There are up to 6 rounds. Each round plays one of today's carded words or phrases (audio) and shows 4 picture slots, one right and three distractors, from today's (and recycled) carded items. A missing `url` shows the calm ImageSlot placeholder; once the link exists in the DB it appears on the next load. Items from the same `variant_group` can be distractors here, because the pictures differ by time of day.
  - **What it uses:** words (1:1 images) on vocabulary days, and phrases (4:3 conversation images) on phrase days. Day 1, for example, plays Bom dia / Boa tarde / Boa noite against the morning, afternoon and night scenes.
  - **After each answer:**
    - The right card shows "صح!" with `tl` · meaning, and a wrong pick shows "مش دي" with that item's `tl` · meaning struck through. The learner can tap again until they're right; only the first try counts.
    - A short note card is built by code from the item when there's a fact to show (for words: the article's gender, "o + مذكر · زي o queijo و o pão"); otherwise there's no note.
  - **Skipped when** fewer than 4 carded words/phrases exist on the lesson (same `has_card` rule as the image manifest). Missing ready urls do **not** hide the step — cards show placeholders until images are ready.
  - **Scoring:** first-try answers go to `/api/v2/answers` as listening for item × skill.
  - **No duplicates:** the day question planner doesn't add `listen_pick_image` for items already played here.
  - **Look:** `design/reference/18-find-image-step.png`. Don't copy from the Stitch file:
    - the mixed photo styles (all pictures are our lesson images);
    - the empty "اختيار" labels (unanswered cards show no label);
    - the duplicated "لاقي الصورة" header;
    - "سؤال معجمي".
    The transliteration comes from code `say` (queijo is كَيجو, not كايچو).

## 5. Flashcards

- Cards exist for words, phrases and verbs. Function words get no cards.
- A card enters on the day its item is introduced (`introducedDay`).
- **Daily cap: 15 cards**, about 3 minutes, made of 9 from the last 7 days, 4 from weak items and 2 older ones. If a slot can't be filled, it goes to recent items. Missed days never pile up into a backlog, and backlog counts are never shown.
- A correct use of the item inside a lesson or practice counts as an implicit review.
- **(changed 2026-10-28)** Buttons: **صعب** (= again: the card comes back later in this session and its interval resets) / **متوسط** (= hard) / **سهل** (= easy). The API values stay again | hard | easy | know; only the labels change. There is also a "عارفها" option that skips an item the learner already knows. After a hint, only صعب and متوسط are enabled.
- Graduation: interval ≥ 21 days **and** correct use in 2 different situations (`usedCorrectlyIn`). Graduation maps to `masteryLevel: mastered`, and graduated cards leave review.
- **(new) Retrieval first.** The front shows only the target word plus audio: a speaker button and a slow (turtle) button. Audio does not autoplay on the front. "محتاج تلميح" shows the word inside a sentence with no Arabic, and using it forces the rating to صعبة. Flipping plays the word once. The back shows the answer first (meaning, pronunciation, picture), then details.
- **(new) Verb card back** is a conjugation poster, 5 rows. Endings are colored by class: -ar orange, -er blue, -ir green. Irregular forms are purple with ⚡ (in pt-PT usually just `eu`, like DURMO). Regular forms are marked "عادي". Then examples and one tip.
- **(new) Deck listing:**
  - Hero card "مراجعة النهارده": 15 cards · 3 minutes, a breakdown line and an "ابدأ" button.
  - A "اللي بتغلط فيه" row.
  - Tabs: المواقف (situation decks, auto-built per day, newest first, future ones locked with "يفتح Dia N") and الأفعال (verb tiles colored by class, ⚡ for irregular).
  - A collapsed "اتخرّجت ✓ N" row.
  - Progress is shown as a count of graduated cards, never a percentage.
  - Deck detail lists items with no Arabic meanings, so the list itself works as a self-test.
  - Users don't create decks.

## 6. Daily loop and gaps

- 3 micro units a day:
  - Morning: a phrase plus a mission.
  - Midday: the next tool in a series.
  - Evening: a check-in plus due cards.
- Series are linked units. Example: "اطلب أي حاجة" goes Queria + noun → quantity → verb → Podia → Pode. Series listed in `03` and `04`.
- Four levels per item: سمعها (heard), فهمها (understood), قالها (said), استخدمها (used in a real exchange). The home screen shows "بتفهم N · بتقول M".
- «احكي يومك»: a daily speaking task that reuses recent items.
- Weekly situation test.
- A "نواقصك" (gaps) screen.

## 7. Question bank and SRS

- SRS is scheduled per **item × skill**, not per question. Skills: listening, reading, speaking, writing.
- Code generates mechanical questions from the item bank. Claude writes 10–15 crafted questions per day.
- Session mix: 40% due, 30% weak, 20% today, 10% stretch. A session is 10–12 questions.
- Validation is layered: code first (exact match, normalisation, accents, known alternatives), and an LLM only for what code can't decide.
- **(new 2026-11-01) The day's question set.** Each lesson has **10–15 questions**, built by one day-level `questions` job, not one job per page. The same set is reused later by the practice agent and by review sessions. Each question carries `use: lesson | practice | both`.
  - **Code plans the slots first:** type, skill and the item each question tests. The model only writes the Egyptian scenario line, and the rubric for open answers. Code builds everything mechanical: options, blanks, tiles, answers, near misses and image refs.
  - **Skill quotas (planner targets, not runtime checks):** the planner is plain code and always produces them. Unit tests check the planner; a generated lesson is never failed for quotas.

    | Skill | Count | Types |
    |---|---|---|
    | Listening | 3–4 | `listen_meaning` (audio → Arabic meaning), `listen_pick_tl` (audio → which TL line), `listen_pick_image` (audio → one of 3–4 pictures), `dictation` (type what you hear) |
    | Writing | 3–4 | `translate_write` (Egyptian situation → type the TL line), `fill_blank_write` (type the missing word), `describe_image_write` (one sentence about a picture), `reply_write` (reply to a short message) |
    | Speaking | 3–4 | `say_it` (Egyptian situation → speak), `reply_speak` (hear a line → answer aloud), `describe_image_speak` (say one sentence about a picture), `read_aloud` (pronunciation) |
    | Grammar | 2–3 | `fill_blank_choice` (sentence with a gap + 3–4 chips), `build_sentence` (put tiles in order; code adds 1–2 distractor tiles, e.g. a wrongly placed `me`) |
    | Reading | 0–2 | `read_meaning` (only if the skills above leave room) |

    Grammar questions use only today's patterns and grammar focus. Every pattern gets at least 2 questions, and they are the pool for the grammar page's `check` (2–3).
  - **Real-world phrases (2026-11-03):** 2–3 slots on top of the 12 core slots, as in §4 "بيقولوها كده". If the `real_world` job failed or the page is hidden, these slots are simply not added.
  - **Size and coverage (changed 2026-11-01):**
    - The planner makes **exactly 12 slots** (and 14 on days with more than 15 core items). It never makes one slot per item.
    - Must be tested: every phrase and every pattern.
    - Words are tested only in the remaining slots, and preferably several at once: `listen_pick_image` and `listen_pick_tl` take one word as the answer and other words as distractors. Words with no slot are covered by the dictionary page and the cards, so an untested word is never an error.
    - Grammar slots (`fill_blank_choice`, `build_sentence`) always test the **pattern**, using its examples, never a plain phrase.
    - Open types fit the item: `reply_*` and `say_it` test phrases; `read_aloud`, `dictation` and `listen_pick_*` can test words.
    - No two questions share the same (type, tests).
    - No more than 2 questions test the same item.
    - The questions follow the order of the day: story, then the detail pages.
  - **Images:**
    - Picture questions use the lesson's generated images: word images, example images and the story scene.
    - A picture question is created only when its image exists (status ready). Otherwise code swaps it for a non-image type of the same skill, so the quotas still hold.
    - Distractor pictures are other items' images from today or recycle.
  - **Options:**
    - Options are deduped by meaning.
    - Items from the same `variant_group` (bom dia / boa tarde / boa noite) can be distractors only if the prompt gives the context that decides between them, for example "الساعة ٩ بالليل".
    - Never show two options whose Arabic is identical or a substring of each other.
    - **What the prompt may show depends on the type:**
      - Meaning types (`listen_meaning`, `read_meaning`, `listen_pick_*`): never the Arabic answer.
      - Production types (`translate_write`, `say_it`, `fill_blank_*`, `build_sentence`): the meaning or situation is the cue, so it may show the Arabic, but never the Portuguese answer.
      - `dictation` and `read_aloud`: no rule.
  - **(new 2026-11-01) The questions job never fails on content.**
    - Every slot has a code template prompt, for example translate_write: «اكتب بالبرتغالي: {eg}». The model only rewrites it as a short situation.
    - If the model's fill for a slot is missing or breaks a rule, code silently uses the template for that slot, and it's listed as a warning.
    - The job is fatal only when the model output doesn't parse at all. Even then, after one retry, the day ships with all-template prompts.
    - Nothing downstream waits on the model fills.
  - **Grading:**
    - Exact types (choice, tiles, blank) are graded by code.
    - `dictation`, `translate_write` and `fill_blank_write` are graded by code against accepted forms and near misses (accents and normalization included). The LLM grader runs only when code can't decide.
    - Open types (`describe_image_*`, `reply_*`, `say_it`) are graded by the Phase 6 grader against the rubric: the item ids that must appear, the accepted answers and the near misses.
    - Speaking uses STT, then the same grader. Until STT is live, speaking questions show "سجّل واسمع نفسك" with the model answer and a self-rating, and they don't count for SRS.

## 8. Progress and errors

- **(changed)** Progress lives in new v2 collections in `ai-agent-talk`, not in Langify's `UserProgress`. State per item is one document per user × item (`v2_item_state`): `introducedDay`, `usedCorrectlyIn`, the 4 levels, and SRS state per skill (plus the card SRS). This replaces the old embedded `flashcardProgress` array. Errors are a separate append-only collection (`v2_errors`). The error taxonomy below keeps the same top-level names as Langify's `errorTypes`.
- Error taxonomy, two levels. The top level is the existing `errorTypes` enum:
  - grammar: verb_form, agreement, sentence_structure, preposition
  - vocabulary: forgot_word, wrong_word, brazilian
  - spelling: accent, spelling
  - pronunciation: sound
- Code classifies first, then the LLM classifies the rest. The LLM may answer `unclear`.
- Weak area: 3 errors with the same scope in the same tool within the last 10 attempts.

## 9. Practice agent

- **(changed)** One answer route (`/api/v2/answers`) owns validation and progress writes. The grader and the reactor are pure modules (`lib/v2/grader`, `lib/v2/reactor`) that never write state.
- **(new)** The grader uses Claude Haiku, non-streamed, with an 8s timeout. On a timeout, an error or invalid JSON, the verdict is `unclear` and it is never counted as a learner error. `arabic_only` is detected in code before any model call.
- **(new)** Max 2 attempts per speaking or writing beat. After the second miss, the coach gives the correct sentence, the character continues, and the beat is recorded as wrong. The reactor returns non-streamed JSON: `character_tl`, `coach_eg`, `advance`.
- **(new)** Beat fields follow the `tl` rule:
  - `prompt_tl`.
  - Reading: `question_eg`.
  - Listening: `audio_tl` (hidden line), `question_eg`, and options `{id, label, lang: tl|ar|num, correct}`.
- Grader: one non-streamed JSON call. Output:
  - `verdict`: correct, near_miss, wrong, off_topic, arabic_only or unclear
  - `items_used_correctly`
  - `errors` (max 3)
  - `main_error`
  - `corrected_tl`
  - `feedback_ar`
  - **(new)** `skill`, echoed back
- Reactor: Prompt 4 with SOURCE always `code`, so there's no hidden VERDICT line. Inputs: MAIN_ERROR, CORRECTED_PT, WEAK_SPOT. It corrects **one** error only.
- Modes: practice, daily (with Inês), open_question, assessment.
- **(new) Four skills inside one conversation.** Each beat has exactly one skill, and the screen changes with it. Listening and reading are graded by code (closed answers) and never go to the LLM. Speaking (STT) and writing go code first, then the grader.

  | Skill | In the story | The learner | Feeds |
  |---|---|---|---|
  | listening | The character speaks with text hidden until answered | Picks or types what they understood | بتفهم |
  | reading | A written thing: receipt, sign, label, menu | Answers about it | بتفهم |
  | speaking | The character asks | Answers by voice | بتقول |
  | writing | A friend's message, a note, a form | Types the answer (accent key row) | بتقول |

- **(new)** "مش قادر أتكلم دلوقتي" switches a speaking beat to writing, and it counts for writing only.
- **(new)** Packs have 8–14 beats, so the mix is a proportion: by default 30% speaking, 30% listening, 20% reading, 20% writing, rounded, with at least one beat of each skill. The mix is passed into generation (`skill_mix`), which shifts weight toward the learner's weak skill.
- **(new)** Two visible voices:
  - The character speaks in white bubbles, target language only. The meaning is behind "معناها؟"; the pronunciation in Arabic letters is shown.
  - The coach appears only in a yellow sticky note above the input, in Egyptian, with a skill chip.
  - Corrections show one error, in amber, never red. The character waits until the learner says it right.
- **(new)** Lesson end: a 2×2 grid of skill results, "بتفهم +N · بتقول +M", a "استخدمت صح" chip list, one focus note (it becomes tomorrow's card), and a button to keep chatting.

## 10. Images and media

- One style for everything: Warm Storybook plus an adult line, with no childish cues. Exact style block in `03`.
- **(changed 2026-11-02)** Recurring cast of nine, of mixed ages and backgrounds, in `content/v2/characters.json`: yassin (learner, late 20s), ines (28), tiago (24), nour (Egyptian friend, early 30s), sofia (35), rita (45), carlos (50), manuel (60), graca (Dona Graça, 72). Each has a reference sheet, a gender, a fixed voice and home places.
  - **Rotation:** a lesson uses 2–4 cast members chosen by place (office: ines, tiago, carlos, rita; home building: graca, carlos; café: manuel, nour, tiago; and so on).
  - **Image pairs rotate:** the same pair at most twice in a row. The learner (yassin) appears in at most about two thirds of a lesson's images; some images show two other cast members talking.
  - Over a week, every cast member appears at least once, and no one is in more than 40% of the images.
  - Background extras vary in age and look.
- `image_spec` fields: type, subject, characters, pose, expression, setting, framing, light, must_show, must_avoid.
- Type templates: object, action, emotion, place, scene, story_panel. Images with characters get the reference sheets; images without characters get a style-anchor image.
- Model: `gpt-image-2.5-flare-2026-09-08` through the edits endpoint (with references). Medium quality; high only for reference sheets. Every image gets a vision QA pass with Haiku. Budget: about $30–45 for 90 days.
- No text inside generated images.
- **(new 2026-11-02) Image pipeline: each lesson owns its images.**
  - **Separate from text generation.** Lesson text never waits for images, and a lesson can be published without them: picture questions show their fallback type, and image slots show a calm placeholder. Images run from an admin button per lesson.
  - **The image list is built by code** from the lesson (the lesson's *image manifest*):
    1. every `word` and every `phrase` with a card → one image. Phrases are 4:3 (a conversation needs width), words are 1:1;
    2. the story scene → one 16:9 `scene` (weekly stories: one per scene);
    3. the scene page image, if the lesson has one;
    4. any extra `image_ref` a question slot uses (4:3 examples, at most 3 per lesson).

    (Changed 2026-11-02: phrases do get images. They're the ItemViewer hero.)
  - **Keys are global and reused:** `word.coffee`, `story.pt-PT.day-01.scene`. If a key is already ready, the lesson reuses it and pays nothing. Word images have no language in them, so English and German reuse them later.
  - **Specs come from the whole lesson, not the single word (changed 2026-11-02).**
    - **Step 1, the lesson visual brief** (part of the same `image_specs` call): from the situation, the story setting, the cast and the time of day of each story line, the model writes one brief for the lesson:
      - the place;
      - the cast with their outfits (from the sheets);
      - the light for each time of day;
      - one line on what the lesson is about, for example "greetings and introductions at the office on the first day".
    - **Step 2, one spec per image, written against that brief** and using the item's own context (`context_eg`, `replies_to`, and the story line where it's said and by whom):
      - **phrase:** a conversation between two people from the lesson's cast, in the lesson's place, at the right time of day for the phrase. The speaker is mid-gesture (waving, shaking hands, handing something over), and the listener is reacting. Bom dia = morning light at the office entrance. Boa tarde = afternoon. Boa noite = evening, leaving work, both waving, never someone sleeping.
      - **verb:** a person doing the action, mid-movement, in the lesson's place.
      - **emotion or adjective:** a person in the lesson's place clearly showing the state, with the cause visible when there is one.
      - **noun:** the object in use in the lesson's situation, for example a coffee being put on the café counter. The object is the clear centre of the frame, with a person's hand or a person when that helps.
      - **story scene:** the whole scene as a conversation, as before.
    - **Never:**
      - literal or symbolic shortcuts (a smiling sun for Bom dia, a sleeping woman for Boa noite);
      - mascots or faces on objects;
      - icons or symbols inside speech bubbles;
      - sticker-style isolated characters with no place;
      - a person who isn't in the lesson's cast, unless they're a background extra.
    - **Same world, different moments (changed 2026-11-02).** The cast, the outfits and the style stay the same across a lesson, but **no two images may look alike.** The visual brief includes a **shot plan**: one row per image, each a distinct moment of the lesson's day. Every row picks:
      - **moment:** a different beat, for example arriving with a coffee in the morning, back from lunch by the lift, leaving at night with coats on under the street lights;
      - **spot:** a different place within the setting (entrance, desk, coffee machine, lift, the street outside);
      - **shot:** close two-shot (waist-up, faces large), over-the-shoulder, medium, or wide. At most one wide shot per lesson, and close or medium is the default;
      - **interaction:** a different gesture (handshake, wave from a distance, a hand on the shoulder, offering a coffee, holding the door);
      - **emotion:** a different feeling (a warm smile, laughing, a shy first meeting, tired but friendly at night);
      - **detail:** one small story prop (a visitor badge, a coffee cup, an umbrella, a laptop bag).
      - **The two people always interact:** eye contact, bodies turned toward each other, faces readable. Never two people standing side by side looking at the viewer, and never one person just walking past.
    - **(new 2026-11-03) What stays fixed, and what changes.** The prompt is built from three parts:
      1. **STYLE_CORE (fixed forever):** the ink linework, the watercolour wash, the paper grain, the proportions and faces, the character sheets, and "no text".
      2. **Lesson palette (one per lesson, rotated):** one of 8 named palettes, chosen by place and time, and never the same palette on two lessons in a row:
         - morning ochre & sky blue;
         - café terracotta & cream;
         - market green & tomato red;
         - rainy slate blue & yellow raincoat;
         - sunset coral & lilac;
         - night indigo & lamp gold;
         - seaside teal & sand;
         - winter grey-green & wool red.
         The palette is also stored on the lesson and used for its cover and its dictionary card tint.
      3. **Per-image variation line:** the light and time of day, the weather (sun, overcast, light rain, wind), the season detail (scarf, short sleeves, Christmas lights) and one accent colour taken from the lesson palette for a key object or piece of clothing.
    - **(changed 2026-11-03) Generic places, no landmarks.** Images must be reusable for every target language (pt-PT now; English and German later). So:
      - no recognisable landmarks, monuments or city views;
      - no country-specific details: no trams, no azulejo, no flags, no national foods as decoration, no readable or national signage;
      - places are described generically: an office lobby, a café counter, a supermarket aisle, a pharmacy, a bus stop, a park, a building staircase, a kitchen.
      - **Cast descriptions** in `characters.json` describe appearance only, with no nationality, except where the story needs it.
      - **Items that are culture-specific by meaning** (pastel de nata, galão, bica) are the only exception: the object itself may be shown, in a neutral setting.
      - **Variety comes from** the palette, the light, the weather, the spot, the shot and the interaction, never from landmarks.
      - Code always appends to `must_avoid`: recognisable landmarks, city skylines, trams, decorative tiles, flags, national symbols, readable signage.
    - **Variety check (code):** no two images in a lesson share the same spot + shot + interaction. If they do, the spec is rewritten once with the conflict named. Light must match each phrase's time of day, and an image of Olá isn't allowed to borrow the night light from Boa noite.
    - Code turns each spec into the final prompt with the `03` templates and the style block. Character images always attach the cast's reference sheets.
    - The story scene spec comes from the story builder (learner on the left, the character on the right, mid-conversation, a recognizable place).
    - Code turns each spec into the final prompt with the `03` templates and the style block.
  - **Characters:**
    - Every image with a person uses the reference sheets.
    - The learner in images is yassin for now.
    - **Character sheets come first.** An image whose character has no sheet is blocked with the reason "no sheet", and never generated without it.
  - **Generation:** the image model from env through the edits endpoint, medium quality, then Haiku vision QA (no text, right person count, clear subject, style), **plus a meaning check (new 2026-11-02):** given the item's meaning and the spec, "does this image clearly show <spec one-liner> (for example: two colleagues greeting each other in the evening as they leave work)?" A "no" counts as a QA failure. QA failure gets one automatic retry, and then the image is flagged for the admin. Concurrency is 2, and cost is logged per image.
  - **Storage (changed 2026-11-02): Cloudinary.**
    - Upload is server-side and signed (env `CLOUDINARY_URL`), into folder `langify/v2/images`, with `public_id` = the image key and overwrite + invalidate on regenerate. Character sheets go in `langify/v2/characters`.
    - The DB keeps `public_id`, `version` and `secure_url`. The version in the URL busts caches after a regenerate.
    - **Each item stores its link:** `items[].image = { key, url }`. It's written when the image becomes ready, and refreshed on the lesson and story documents that use the key (`used_by`). The player reads `url` directly, and a missing `url` means the placeholder.
    - Sizes come from Cloudinary transformations, never from re-generating: `c_fill,ar_1:1` for words, `ar_4:3` for examples, `ar_16:9` for scenes, plus `f_auto,q_auto` and a width per screen (for example 600 for cards, 1200 for scenes).
    - Reference images for the edits call are downloaded from their Cloudinary URLs (cached in memory per job).
    - A `v2_images` collection holds key, type, spec, prompt, status (missing / queued / generating / ready / flagged / failed / blocked), url, qa, cost, version, and the lessons that use the image.
    - `content/v2/assets/index.json` is no longer written at runtime.
  - **Admin, per lesson → "الصور" tab:**
    - The manifest as cards: preview, status and the reason.
    - "ولّد الصور الناقصة", which shows the count and estimated cost first.
    - Per image: regenerate, edit spec, approve a flagged image, or upload a replacement.
    - A global "الشخصيات" page generates or uploads the reference sheets at high quality.
- **(new 2026-10-30) Story scene image.** Code builds it from the story's setting and cast. It uses the agreed cartoon style at 16:9, through the `scene` template, with the reference sheets of both people.
  - The image shows the whole scene, not one object: a conversation between the two people, mid-conversation and facing each other.
  - The learner is on the left and the character on the right, matching the bubble sides.
  - The place must be clearly recognizable.
  - There is no text in the image.
  - Weekly story days get one image like this per scene.
- Audio: Azure TTS pt-PT, cached. Whether Azure pronunciation assessment supports pt-PT is still unknown; check before building scoring on it.

## 11. Open items

- Approve the pronunciation letter table (section 2) with a native speaker.
- Character sheets for rita, manuel, sofia and carlos.
- Native review of weeks 1–2 before release.
- Pilot: generate days 1–3 end to end before the rest.
