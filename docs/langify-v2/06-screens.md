# 06 · Screens

All screens are routes under `app/(v2)/` in `ai-agent-talk`. Each screen lists its reference image (in `design/reference/`, with the Stitch HTML of the same number in `design/stitch-html/`), what it shows, its states and its data source. All screens follow `05-design-system.md`. The app has one tab bar: **المسار · الكروت · المكتبة · أنا**. Screens marked "no tab bar" are full-screen flows.

## Tab: المسار (Path)

### S1 · Path / home
- Reference: `13-learning-path.png`. Onboarding before first launch: `00-onboarding.png` (replace "Falou" with Langify).
- Shows:
  - A greeting and "بتفهم N · بتقول M".
  - Today's day card with its situation illustration and a start button.
  - The 3 micro units for today (morning, midday, evening), each with a done state.
  - The week map: past days done, today highlighted, future days locked.
  - The story day marked on day 7.
- States: first launch; normal; today done (the card switches to "كمّل بكرة" and shows tomorrow's situation).
- Data: GET `/api/v2/path`.

### S2 · Day map
- Reference: `06-day-map.png`.
- Shows: a cover illustration, the day title (pt + ar) and the list of steps, each with minutes and a status (done, current, locked).
- **Steps in order (story first, 00 §4):**
  1. القصة (the intro story, page 0);
  2. "نفصّل اللي اتقال" (the detail pages);
  3. "القصة تاني: من غير ترجمة" (page 0 in test mode: plays without stopping, then 3–4 questions at the end);
  4. أسئلة اليوم;
  5. the practice conversation.
- Data: GET `/api/v2/lessons/[day]` plus progress.

### S3 · Content page player (no tab bar)
- References: `01-content-page-possessives.png` (the visual style for every content page, and table pages), `02-conjugation-endings.png` (verb and explore pages), `stitch-html/04-compare-o-a.html` (compare pages, layout only), `05-phrases-page.png` (phrases), `05b-dictionary-page.png` (dictionary). Guided behaviour still comes from `prototypes/ser-estar.html`.
- Working prototypes: `prototypes/ser-estar.html` (guided) and `prototypes/verb-endings.html` (explore). Match their behaviour.
- Header: back, small "Dia N · <pill>", the title, a speaker button for the page, "اختبرني" and "غطّي" toggles.
- **Sections mode (grammar pages, 2026-10-31; replaces guided):**
  - The rule's main block is visible at once. The Egyptian explanation under it is read by TTS once on open, with a pause/replay button. There is no other autoplay.
  - An arrow button "الأمثلة ⌄" reveals all examples together. Each example plays on tap. The conjugation dial and verb chips, if the page has them, sit here.
  - "فهمت؟": 2–3 simple questions under the examples. Each shows right or wrong at once with a why line. A wrong answer highlights the related example. The questions never block "التالي".
- **Guided mode (retired 2026-10-31, kept for reference):**
  - Autoplay of steps. The current target is highlighted; unrevealed parts are at 20% opacity.
  - The caption bar shows the step's `tip` in Egyptian with TTS, plus chapter segments, pause and speed.
  - At an `ask` step, playback stops and the question shows as a bubble with options. After the answer, a short why line, then playback continues.
  - "الصفحة كلها" reveals everything.
- **Explore mode:**
  - Controls sit above the blocks: a person dial (`reveal_axis`) and verb swap chips (`swap`). Each control shows its tip in the caption bar.
  - `locked_until` blocks show a lock until their condition is met.
- **Static mode:** dictionary and phrases pages open the **ItemViewer** (see 05): one word or phrase per full screen, picture on top, a learning sheet below (meaning with memory mode, an example from the story, prev/next). Other static blocks render in place; tapping an item plays its audio.
- **Story pages** (`preset: story` with a `dialogue` block) open the **StoryPlayer** (see 05), full screen and without the guided caption bar. **The story never stops to ask the learner anything** (2026-10-31). Learner lines play like the others.
  - **Intro mode (page 0):** passive. Every line plays by itself, the learner's included. The meaning is hidden and is shown per line on tap. There are no turns, asks or tips. The end screen shows "خلّصت القصة" and how many meanings were opened.
  - **Test mode (after the detail pages):** the story plays again from start to end without stopping. The meaning is hidden, with no per-line reveal, no hint, no tips and no asks. When it ends, the end screen shows 3–4 short questions about the story (what the character asked, what you replied, one line meaning), then "فهمت n من N".
- **Cover (غطّي):** hides `meaning`, `tl` or `endings`, as the page's `cover` says. Tap to peek.
- **Quiz (اختبرني):** 3 questions from the page's `quiz` ids, then return.
- Data: the page object from the lesson JSON. Answers go to POST `/api/v2/answers`.

### S4 · Day done (no tab bar)
- Reference: `07-day-done.png`.
- Shows: what was learned today (words, rule, phrases), "هتراجعها بكره" (the first cards), the streak as calm dots (not fire), and the next step.

## Tab: الكروت (Cards)

### S5 · Deck listing
- Reference: `08-decks-listing.png`.
- Shows:
  - Header "الكروت" with "بتفهم N · بتقول M".
  - A hero card "مراجعة النهارده": "١٥ كارت · ٣ دقايق", a breakdown line ("٩ من الأسبوع ده · ٤ بتغلط فيها · ٢ قديمة") and an "ابدأ" button.
  - A coral-outlined row "اللي بتغلط فيه · N كروت" with "راجعهم".
  - A segmented control: المواقف | الأفعال.
- **المواقف tab:** situation decks, newest first. Each row has a thumbnail, "No Supermercado · السوبرماركت", "Dia 3", "٢٤ كارت · ٥ النهارده", and a graduated-count bar labeled "١٠ اتخرّجوا". Future decks are faded, with a lock and "يفتح Dia N".
- **الأفعال tab:** a 2-column grid of verb tiles. The verb is shown big in its class color, with the Arabic meaning under it, "⚡ شاذ" when irregular, and a thin graduated line.
- Bottom: a collapsed row "اتخرّجت ✓ N كلمة وجملة".
- Never show a backlog number.
- Data: GET `/api/v2/decks`, GET `/api/v2/cards/today`.

### S6 · Deck detail
- Shows:
  - Header with back, the situation title and "Dia N".
  - A wide illustration with no text in it.
  - Three numbers: total, today and graduated.
  - The button "راجع الموقف ده بس".
  - Item rows: the target word with its article colored (o blue, a coral), a speaker, and a status label (جديد, بيتراجع, بتغلط فيه, اتخرّج ✓). **No Arabic meanings in the list.** Tapping a row opens the card.
- Data: GET `/api/v2/decks/[id]`.

### S7 · Flashcard review (no tab bar)
- References: `09-flashcard-front.png`, `10-flashcard-back.png`.
- Header: close, "مراجعة النهارده · ٧ / ١٥", a thin progress bar.
- **Front:**
  - Only the target word, big. Under it, "اسمع" and the turtle slow button.
  - The line "فاكر معناها؟ قولها في سرّك واقلب", an "اقلب" button and a "محتاج تلميح؟" link.
  - No autoplay.
- **Hint state:** the word inside a sentence (e.g. "A que horas dormes?") with no Arabic. The rating is locked to صعب or متوسط.
- **Back:**
  - The word plays once on flip. The answer comes first: Arabic meaning, pronunciation in Arabic letters, illustration.
  - Then the details by card type:
    - **verb:** a 5-row conjugation poster. Endings are colored by class; irregular forms are purple with ⚡; regular forms are labeled "عادي".
    - **word:** article colored; plural; one example.
    - **phrase:** when you say it, the reply you'll hear, one variation.
  - Then examples (2–3) and one tip note.
- Rating row (right to left): صعب / متوسط / سهل — mapped to again / hard / easy — plus a small "عارفها" link. All three buttons have equal visual weight (none pre-highlighted).
- Session end: "خلّصت ١٥ · بكرة N". No streak pressure.
- Data: GET `/api/v2/cards/today`, POST `/api/v2/cards/[itemId]/review`.

## Practice (from the day map, or from a micro unit)

### S8 · Practice conversation (no tab bar)
- Reference: `stitch-html/11-practice-conversation.html` (HTML only; layout of bubbles, speaker labels, audio bar). The behaviour is described below and in `00` §9.
- **Shared layout:**
  - Header: close, the situation title, "Dia 3 · مشهد ٢ من ٣", a speed toggle.
  - A mission strip: "المهمة: …" and 10 step dots colored by skill.
  - The conversation on ruled paper. The character's bubbles are white, target language only, with pronunciation in grey, a speaker and "معناها؟". The learner's bubbles are deep-teal. Narration lines are grey italic and centered.
  - A coach sticky note above the input, yellow, in Egyptian, with a skill chip.
- **States**, one per beat type and outcome:
  1. Speaking (default): a sentence frame in the note. Big mic "اضغط واتكلم", a keyboard icon, "مساعدة", and the link "مش قادر أتكلم دلوقتي".
  2. Recording: a waveform pill with a timer, "إلغاء" and "خلّصت", and a faint live transcript.
  3. Near miss or wrong: an amber dot on the learner's bubble. The character does not reply. The note expands: "قريب جداً" (or "جرّب تاني"), the wrong word struck through → the fix in orange, one Egyptian line, a speaker, and "قولها تاني". Only one error is shown.
  4. Listening: the character's bubble is audio only (play, waveform, slow, "اسمع تاني"). Three answer cards replace the mic. The text reveals after the answer.
  5. Reading: an in-chat card (receipt, sign, label, menu). Answer chips. No mic.
  6. Writing: a message card from a friend. A lined text field, an accent key row (ã õ ç á é í ó ú â ê ô à) and send.
  7. Open question: the label "سؤال مفتوح · مفيش إجابة غلط", a frame plus a word bank.
  8. Arabic-only answer: the learner's bubble turns light grey with no error mark. The coach says "حلو! قولها بالبرتغالي" with a frame. Progress doesn't change.
  9. Correct: a small green check, chips for the items used, and the character's next line.
- Verdicts map to states: correct → 9, near_miss and wrong → 3, arabic_only → 8, off_topic and unclear → 8 with a different coach line.
- **End screen:** a character illustration and "خلّصت المشهد". Then a 2×2 skill grid with results ("🎧 سمع ٣/٣"…), "بتفهم +N · بتقول +M", the "استخدمت صح" chips, a focus note ("custo → custa · هتظهرلك بكرة في الكروت"), "كمّل دردشة مع ريتا" and "رجوع للمسار".
- Data: GET `/api/v2/packs/[day]`, POST `/api/v2/answers` per beat.

## Tab: المكتبة (Library)

### S9 · Library
- Shows shelves: النطق، مرجع عام، القواعد الصغيرة، الأزمنة، الأفعال، القاموس المصوّر، القصص.
- Each shelf lists pages; unlocked pages open in the S3 player in static mode, and locked ones show "يفتح Dia N". The verb shelf opens verb posters (same as the flashcard back, full screen).
- Reference for the story reader: `14-story-reader.png` (bilingual panels, line-by-line audio, a play bar).

## Tab: أنا (Me)

### S10 · Me and gaps
- Shows:
  - The four levels as numbers (سمعها، فهمها، قالها، استخدمها).
  - Skill bars for listening, reading, speaking and writing.
  - **نواقصك:** the top weak areas from the error taxonomy (e.g. "verb_form · ESTAR", "accent"). Each has a "اتمرّن عليها" button that starts a short targeted session.
  - The weekly situation test result.
  - Settings.
- Data: GET `/api/v2/gaps`.

## Micro units

### S11 · Micro unit (sheet over the current tab)
- **Morning:** the phrase of the day with audio, plus a mission ("قولها النهارده لحد").
- **Midday:** the next tool in the series, as a 1-minute guided page.
- **Evening:** a check-in ("قلتها؟ آه / لأ / نسيت"), then due cards.
- Data: GET `/api/v2/micro/today`, POST `/api/v2/micro/[unitId]/done`.

## Reference images not mapped above

- `12-quiz-find-image.png`: the "لاقي الصورة" review game (listen and pick the picture), used for word questions in sessions.
- `12b-question-session.png`: a question-session screen (one MCQ with Arabic options, a correct state and a coral "التالي" button).
