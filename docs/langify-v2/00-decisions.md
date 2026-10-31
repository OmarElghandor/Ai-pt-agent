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
- **(changed 2026-10-25)** 90 days, ordered **grammar-first**. Each day is one grammar unit, following the unit order of Practice Portuguese A1: regular present -ar → -er → -ir, then ser/estar, then the irregulars, then the past. The unit is taught **inside a street situation** that needs it, and the situation supplies the phrases, the words and the character conversation.
  - Anything urgent for a resident (Queria…, O que é isto?, Fui ao…, Dói-me…) comes early as a **ready-made chunk**, and its rule comes later in its place in the order. Numbers are the one exception, with their own day (day 4).
  - Day 7 of every week is a story. Full plan: `04-curriculum.md`.
- **(new)** Lesson titles are the Portuguese unit titles (e.g. "Verbos -AR 1", "Possessivos"), shown with an Arabic translation and the situation under them.
  - When a day covers more than one of their units, the extra unit titles are listed on it.
  - Story days and day 29 have our own titles.
  - We reuse only the topic order and names, never their content.
  - Plan fields: `title_tl`, `title_ar`, `situation_eg`, `example_tl`, `rule_eg`, `extra_units_tl`, `early_chunks_tl`.
- **(new)** Days 1–30 are labeled **A1**, and weeks 5–8 start **A2**. This is aligned with the CIPLE A2 exam that residents need.
- SER vs ESTAR is now days 10–11. `examples/day06-example.json` is the ESTAR day, which is **day 11** in the new order. The file keeps its name, but its `day` is 11.
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
  - **Weekly story days (7, 14, 21, 28)** stay as they are: a full story, with no detail pages.
- **(new 2026-10-30) Story builder.** The story is generated by its own job, before the outline, and the rest of the day is built from it.
  - **Order:** brief → items → **story** → outline → pages / questions / micro / daily_use → critic → continuity → lang_check → assemble. The outline and the page jobs receive the story as input.
  - **Storage:** each day has one story document per language, in its own file or collection (for example `stories/pt-PT/day-03`), with its own version and status. The lesson does not copy the lines. Page 0 and the test replay point to it by `story_id`. The publish gate checks the story document together with the lesson.
  - **Speaker on every line.** The model writes the cast and the lines, and every line names its speaker:
    - **Cast:** exactly two people on normal days, the learner and one character from the plan. Each cast entry has an id, a display name and a role.
    - **Narration:** if it is needed, it uses the speaker `narrator`.
    - **What the view takes from the speaker:** the bubble side (learner on the left, the character on the right), the voice, and which lines the after-story questions ask about.
  - **Line shape:** `speaker`, `tl` as a plain string, `ids` (the items the line uses), and `extra` (words or chunks that are not in the lesson). The story has 6–10 lines, and the learner speaks 2–4 of them. There are no tips and no asks.
  - **Coverage (fatal):**
    - Every word, phrase and pattern in today's core items appears in the story. A plural or another form of the pattern counts.
    - Today's grammar focus is used at least twice.
  - **Extra content is allowed** up to 15% of the tokens: words outside today, recycle and earlier days. Each extra is listed in the line's `extra` field with an Arabic gloss. Extras are never tested and never get a card.
  - **Coherence (fatal):**
    - A learner reply comes after the heard line it answers (`replies_to`).
    - No line is a bare noun. Every line is a phrase or a full sentence.
    - There are 6–10 lines and 2 speakers, and every line has a valid speaker.
  - **Retry:** a failure reruns the story job only, at most once.
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
  - Fatal: two different time-of-day greetings used as hellos in the same scene. A greeting used as a farewell in the last two lines is allowed.
  - The story critic flags as high a character asking for something the learner already said.
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
- Recurring cast: yassin, ines, rita, manuel, sofia, carlos. Each has a reference sheet.
- `image_spec` fields: type, subject, characters, pose, expression, setting, framing, light, must_show, must_avoid.
- Type templates: object, action, emotion, place, scene, story_panel. Images with characters get the reference sheets; images without characters get a style-anchor image.
- Model: `gpt-image-2.5-flare-2026-09-08` through the edits endpoint (with references). Medium quality; high only for reference sheets. Every image gets a vision QA pass with Haiku. Budget: about $30–45 for 90 days.
- No text inside generated images.
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
