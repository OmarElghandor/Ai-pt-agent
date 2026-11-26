# 18 · Review chat UI ("مراجعة النهارده" as a chat)

Status: plan, 2026-11-24. Author: Omar + Claude. Implementation: Cursor.
App: **az-talkie** (A-Z Talkie).

Read first: `16-practice-engine.md` (whole: the session, steps, answer log, rounds), `00-decisions.md` §7 (question types, grading), `05-design-system.md`, `AGENTS.md`, and the design references below.

**This doc wins over `16-practice-engine.md` §2.1 for the review session only.** The daily review is shown as a chat with the coach, using new chat components. Lessons, cards and every other module keep their existing screens. The engine is unchanged: session building, steps, grading, the answer log, stages and coverage all stay as in `16`. This doc only changes how a step is **shown** and **answered**.

No code in this document by design.

---

## 1. Design references

Stitch export `stitch_bilingual_grammar_notebook_app_16`. Omar copies the screens into the repo at `design/reference/review-chat/`, renamed:

| File | Stitch folder | Shows |
|---|---|---|
| `01-listening.png` | `_3` | opening message, round divider, `listen_meaning` answered, `listen_pick_tl` with the choice sheet |
| `01b-listening-alt.png` | `lumina_white` | the same flow, richer feedback panel (use for the correct-panel layout) |
| `02-pictures.png` | `_4` | `listen_pick_image` grid (right + wrong states), `describe_image_write`, `describe_image_speak`, accent-key composer |
| `03-writing.png` | `_5` | `dictation` near-miss, `translate_write`, `reply_write`, `fill_blank_write`, text composer with hint link |
| `04-grammar.png` | `grammar_focus` | `choose_article`, `complete_phrase`, `fill_blank_choice` wrong + grammar note, `build_sentence` with tile tray |
| `05-speaking.png` | `_1` | character line, `reply_speak` recorded answer + model + self-rating, `read_aloud`, `say_it`, mic composer |
| `06-recognition.png` | `mixed_recognition` | `read_meaning` (receipt), `pick_meaning`, `pick_tl`, `situation_choice` with the choice sheet |
| `07-round-and-session-end.png` | `_2` | round-end card and session-end card |

Token source: Omar's **"Lumina Arabic Interface — White Theme v2"** (`design/lumina/DESIGN.md`). **The Lumina file wins over the hex values inside the Stitch HTML.** Stitch drifted: it used primary `#00685f`, tertiary `#924628`, a mint background on one screen, and mixed fonts.

### 1.1 What to copy

- Chat layout:
  - coach on the right with the "AZ" avatar;
  - learner bubbles on the left in solid teal;
  - question cards inside coach messages;
  - the composer tray at the bottom changes with the type.
- Question-card anatomy: a skill chip, a lesson chip ("Dia 4"), a counter ("السؤال ٥ من ١٠"), then the prompt, then the content.
- The audio prompt block (play, waveform, "اسمع بالراحة" at 0.8×).
- Feedback panels: the correct panel (emerald, "صح ✓", TL = meaning, play icon, stage chip) and the near-miss panel (amber, "قربت!", corrected line with the fixed part highlighted, a 💡 why-line, the chip "اتسجّلت في نواقصك").
- The grammar note inside a wrong-answer panel (rule line plus a ❌ wrong → ✓ right pair).
- The tile tray, the accent-key row, the mic composer with "مش قادر أتكلم دلوقتي", the self-rating chips, the round divider pill, the round-end card and the session-end card.
- The footer line "جاوب براحتك وبدون استعجال".

### 1.2 What NOT to copy

- **Any percentage:**
  - "دقة ٩٠٪" and "استجابتك كانت أسرع بـ ٢٥٪" in `07`;
  - the "٪١٠٠" chip in `03`.
  Learners see counts only (`16-practice-engine.md` §9.3).
- The English header "Today Review Conversation" and the stray user-avatar button in the header. The header is the same everywhere: back arrow, "مراجعة النهارده", and "جولة N من M · X من Y".
- **Free-text learner chat messages** (the "حاسس إني بدأت…" bubble in `07`). The review has no free chat; every learner bubble is an answer.
- **Peach / terracotta / red for wrong answers** (the `04` wrong panel, the `02` wrong card and its ✗ icon). Learner mistakes use the Lumina **warning** tokens: amber `#B7791F` on `#F9EACB`, text `#70450B`. Terracotta is only the grammar-note surface. Red is only for system errors.
- **Mixed fonts** (Newsreader, Noto Sans Arabic). See §2.
- **Broken headers and labels:**
  - the title and subtitle overlapping, and wrapped speaker names ("الكوت ش") in `05` and `06`;
  - the "AZ" avatar letters wrapping.
  Avatars have a fixed size, names are single-line, and long text truncates.
- **The character's Portuguese line visible before the answer** (`05` shows "(Mais alguma coisa?)" on the play button). The text stays hidden until the learner has answered.
- **Grey "img" placeholders.** Use the existing ImageSlot with real lesson image urls (placeholder only while the url is missing).
- **The bright mint selected state** (`#78f6c7` in `06`). Selected = `#D8F2EE` background, `#0D9488` border, `#075E57` text.
- **Stage chips the server didn't send** ("تم الحفظ" in `06`). A stage chip appears only when the answer response reports a real stage move.
- **A flame icon on the streak row** in `07`. Use a plain icon.

---

## 2. Tokens and fonts

- **Colours:** the Lumina tokens, applied as the v2 theme. The theme doc says hex values live only in `app/(v2)/v2.css` and the `@theme` block of `app/globals.css`, so this is one swap of the values behind the existing role names, plus new roles where Lumina has a meaning the old theme didn't.

  | Role | Lumina value |
  |---|---|
  | paper | `#FFFFFF` |
  | panel / surface | `#F2F5F4` |
  | input | `#F7F9F8` (border `#C8D2CD`) |
  | nested | `#E8EDEC` |
  | line | `#D5DEDA` |
  | divider | `#E1E7E4` |
  | ink | `#202927` |
  | ink-muted | `#5F6B67` |
  | meta | `#737877` |
  | primary | `#0D9488` |
  | primary-strong | `#075E57` |
  | primary-tint | `#D8F2EE` |
  | success | `#0FA87E` (icon `#0B8064`, panel `#DDF5EB`, text `#075E47`) |
  | warning / mistake | `#B7791F` on `#F9EACB`, text `#70450B` |
  | grammar note | `#F8E2D9`, border `#EFC5B5`, text `#78391F` |
  | danger (system only) | `#C62828` |
  | waveform | `#0FA87E` on `#DDF5EB` |
  | progress | track `#E1E7E4`, fill `#0D9488`, done `#0FA87E` |
  | focus ring | 3px `rgba(13,148,136,0.16)` |

  Radius: controls 8, cards and bubbles 16, sheets 24, pills full. Shadows: the two Lumina shadows only (`0 8px 24px -4px rgba(23,31,29,0.05)` on cards; `0 12px 32px -8px rgba(23,31,29,0.10)` on floating controls).

- **Fonts:**
  - IBM Plex Sans for headings and labels;
  - IBM Plex Sans Arabic for all Arabic (line-height ≥ 1.4, about 15–20% larger than Latin at the same level);
  - Inter for Portuguese, weight 500, slightly larger than body.
  Load them through the existing font setup, not from Google URLs in the page.

- **App-wide effect:** this swap changes every v2 screen. That's intended if Lumina is the new theme, and `05-design-system.md` must be updated in the same task. If Omar wants Lumina only on the review first, R0 instead scopes the new values under a `review-chat` wrapper class, and the global swap comes later. **Default: global swap.**

---

## 3. How the chat works

### 3.1 The thread is derived, not stored

- The page loads today's `v2_review_sessions` doc (built on the tab tap, `16-practice-engine.md` §8).
- **The thread is rebuilt from the session every time:**
  - one coach opening message;
  - a round divider per round;
  - for each answered step: its question card in a compact answered state, the learner's answer bubble, and the feedback panel;
  - for the current step: its question card and its composer;
  - then the round-end card, or the session-end card.
- **No chat-message collection.** Answers already live in `v2_answers`, and each session step stores its first-try answer id (`16-practice-engine.md` §7). On resume, the thread is rebuilt exactly as it was.
- History is lazy: earlier rounds collapse into a single line "الجولة ١ · ١٠ أسئلة ✓", which expands on tap.

### 3.2 Coach and system text

- Every coach line is a code template from a content file, `content/v2/review-coach.ar.json`. Omar + Claude write it; **Cursor never writes the Arabic.** The file holds:
  - the opening ("أهلاً يا {name} 👋 النهارده هنراجع {lessons} · {rounds} جولات صغيرين");
  - the round names;
  - feedback labels ("صح ✓", "قربت!", "مش دي", "مش متأكد");
  - hint lines, the round-end and session-end lines;
  - the speaking self-rating note, the "مش قادر أتكلم" line, and the empty state.
- Each label has 3–5 variants, picked by step index so they don't repeat back to back.
- **Why-lines and corrections come from the question data and the grader**, never from the coach file. That covers the near-miss corrected line, the one-line why and the common-mistake pairs.
- **No model calls for the chat itself.**

### 3.3 Answering

- The composer is chosen by the step type (§4). The learner answers, the answer appears at once as a learner bubble (optimistic), and the step posts to `/api/v2/answers` and `/api/v2/progress/events` (same `event_id`, as in `16-practice-engine.md`).
- **Code-graded types** show feedback as soon as the response returns.
- **LLM-graded open types** (`reply_*`, `describe_image_*`, graded `say_it`) show a small "بيشوف إجابتك…" coach typing row. There's an 8 s timeout. On `unclear` the coach shows "مش متأكد" with the model answer, and it's never counted as a mistake (`00-decisions.md` §9).
- **After feedback,** the next step slides in. There's no auto-advance timer: the learner taps "التالي" in the composer, or simply starts the next answer.
- **Retry:** choice and tile types allow retry until right, but only the first try counts (same as "لاقي الصورة"). Writing types show the correction and move on.
- **Hint:** "مش عارف (ساعدني أحلها)" under the text composer, or "مش عارف؟ اطلب تلميح نحوي" under the tiles. The coach replies with a hint: 1–2 words, or the rule line for grammar steps, from the question's hint data. The answer is then logged with `hint_used: true`, and it never counts as a first-try correct for stages (`16-practice-engine.md` §6).
- **Speaking:**
  - The mic composer records locally; playback only, and the audio is never uploaded (`16-practice-engine.md` §9.2).
  - Until STT is live, the coach shows the model answer and the self-rating chips "قلتها صح / قربت / لسه". Self-rated answers count for coverage only.
  - "مش قادر أتكلم دلوقتي" swaps the step to its writing twin and logs that skill.
- **Audio:** the existing TTS player and cache. Normal speed, plus 0.8× for "اسمع بالراحة". The waveform is decorative, driven by playback progress. A character's line uses that character's voice.

### 3.4 Layout rules

- Full-screen flow: the bottom tab bar is hidden inside the session, like the lesson players. The back arrow returns to where the learner came from, and the session stays resumable.
- 390px design width, centred on wider screens, RTL. The thread auto-scrolls to the newest message, and the composer is pinned above the keyboard (no jump on iOS PWA).
- The header progress bar has one segment per step **of the current round**, and the subtitle is "جولة N من M · X من Y".
- Images use the existing ImageSlot and Cloudinary sizes (4:3 for scenes, 1:1 for words).
- Accessibility:
  - every icon button has an Arabic label;
  - status is never colour-only (✓ / ! / label);
  - visible focus rings;
  - tap targets ≥ 44px.

---

## 4. Every question type in the chat

| Type | Card (inside the coach message) | Composer | Ref |
|---|---|---|---|
| `listen_meaning` | audio prompt + "معناها إيه؟" | choice sheet (Arabic options) | 01 |
| `listen_pick_tl` | audio prompt + "سمعت أنهي جملة؟" | choice sheet (TL rows with speaker icons) | 01 |
| `listen_pick_image` | "لاقي الصورة · N من 6" + audio + 2×2 image grid (answers in the grid itself; retry until right) | none (grid is the input) | 02 |
| `situation_choice` | Egyptian situation + optional quoted TL line with play | choice sheet (TL rows) | 06 |
| `read_meaning` | reading card (receipt / sign / menu / note, rendered from the question's structured text) + question | chip row (inline options) | 06 |
| `pick_meaning` | TL word + play + "معناها إيه؟" | chip row (Arabic) | 06 |
| `pick_tl` | Arabic word + "بالبرتغالي تكون؟" | choice sheet (TL rows) | 06 |
| `choose_article` | "___ reunião" | chip row (o / a / os / as) | 04 |
| `complete_phrase` | phrase with one blank | chip row | 04 |
| `fill_blank_choice` | sentence with a blank + optional rule chip ("ser ولا estar؟") | chip row | 04 |
| `build_sentence` | Arabic meaning + slot line | tile tray (with distractor tiles), مسح / تأكيد الإجابة | 04 |
| `fill_blank_write` | sentence with a dashed blank + rule chip + "فكّر:" helper line | text composer (accent keys, hint link) | 03 |
| `dictation` | audio prompt + "اكتب اللي سمعته" | text composer | 03 |
| `translate_write` | "الموقف:" situation box | text composer | 03 |
| `reply_write` | quoted friend message (name, TL line, play, hidden meaning) + "رد عليه" | text composer | 03 |
| `describe_image_write` | 4:3 image + "اكتب جملة واحدة عن الصورة" | text composer | 02 |
| `describe_image_speak` | 4:3 image + "قول جملة عن الصورة" | mic composer | 02 |
| `image_pick_tl` | one picture; answer by choice; word hidden until answered | choice sheet | 02 |
| `image_write` | one picture; answer by text; word hidden until answered | text composer | 02 |
| `image_say` | one picture; answer by mic; word hidden until answered | mic composer | 02 |
| `say_it` | "سياق الموقف:" situation | mic composer | 05 |
| `reply_speak` | character bubble first (avatar + name, play "اسمع {name}", text hidden until answered), then the coach card "رد عليه" | mic composer | 05 |
| `read_aloud` | TL sentence + play + Arabic-letter pronunciation | mic composer | 05 |

**Feedback panel states:**

| State | Look | Content |
|---|---|---|
| correct | emerald | "صح ✓", TL = meaning, play icon, stage chip if moved |
| near_miss | amber | "قربت!", the corrected line with the changed part highlighted, the why-line, "اتسجّلت في نواقصك" when an error was logged |
| wrong | amber | "مش دي", the right answer, the why-line, plus the terracotta grammar note when the step tests a pattern that has a common-mistake pair |
| unclear | neutral | "مش متأكد", the model answer |
| self_rated | neutral | the model answer + rating chips |

---

## 5. Round and session end

- **Round-end card** (coach message):
  - "خلصت الجولة N 👏 · X أسئلة";
  - stage-up chips from real stage moves only ("افتكرتها +4 · راجعتها +3");
  - primary "يلا الجولة N+1 · حوالي M دقايق", secondary "كفاية كده النهارده".
  - **No accuracy, no speed, no percentages.**
- **Session-end card:**
  - the check, "خلصت مراجعة النهارده";
  - one row per window lesson (title, situation, "اتراجع كله ✓" or "فاضل N");
  - the focus card (mint, with play);
  - the open-problem card (terracotta note, "اتمرّن عليها");
  - the streak row (count only, plain icon);
  - the composer is replaced by "رجوع للمسار".
- **The extra round** (from the session end) continues in the same thread with a new divider (`16-practice-engine.md` §8.2).

---

## 6. Components

New, in `components/v2/review-chat/`. Each is presentational only: state and posting live in the session hook.

- **Shell and thread:** `ReviewChatShell` (header, thread, composer slot), `ChatThread` (derive messages from the session, collapse old rounds, auto-scroll).
- **Messages:** `CoachMessage` (avatar + bubble or card), `LearnerBubble` (text, choice, tiles or audio variants), `CharacterBubble`, `RoundDivider`, `TypingRow`.
- **Card parts:** `QuestionCard` (skill chip, lesson chip, counter, slots), `AudioPrompt`, `ImageGrid`, `ReadingCard`, `QuotedMessage`, `BlankSentence`, `SlotLine`, `SituationBox`.
- **Feedback:** `FeedbackPanel` (five states), `GrammarNote`, `StageChip`.
- **Composers:** `ChoiceSheet`, `ChipRow`, `TextComposer` (accent keys, hint link), `TileTray`, `MicComposer` (switch to writing), `SelfRating`.
- **End cards:** `RoundEndCard`, `SessionEndCard`.

Reused logic, not rebuilt:

- grading and normalisation (the same graders the day questions use);
- the TTS player and cache;
- ImageSlot and Cloudinary urls;
- accent-key handling, if the day-questions renderer already has it;
- the answers and events posting helpers;
- distractor data comes frozen in the step (`16-practice-engine.md` §7).

---

## 7. Tasks for Cursor

**Prerequisite.** The engine tasks from `16-practice-engine.md` up to **E7** (the session build) give real sessions. Until then, every R task works against a **fixture session**: a dev-only JSON session at `content/v2/fixtures/review-all-types.json`, with one step of every type in §4 in all feedback states. Omar + Claude write its Portuguese and Arabic, never Cursor. It's opened with `?fixture=all-types` from an admin session only.

Prompt:

> Read `docs/az-talkie-v2/18-review-chat-ui.md` (whole), `16-practice-engine.md` §5–§9, `00-decisions.md` §7, `AGENTS.md`, `design/lumina/DESIGN.md` and the screens in `design/reference/review-chat/`. Implement task **R-x only**. Do not start the next task. Follow §1.2 "What NOT to copy" strictly: no percentages, no red or peach for learner mistakes, no visible character text before answering, no free-text chat. Colours only through the theme tokens, never hex in components. Never write Portuguese or Arabic content yourself: coach lines come from `content/v2/review-coach.ar.json` and question text from the session. Do not change the engine, grading or the answer log. Stop when "Done when" is met and list the files you changed.

**R0 · Tokens, fonts, references**
- Do:
  - put Omar's files in place: `design/lumina/DESIGN.md` and the renamed screens in `design/reference/review-chat/`;
  - swap the theme token values to Lumina (§2) in `v2.css` and `globals.css` (`@theme`), adding the new roles (warning, grammar note, waveform, focus ring);
  - switch fonts to IBM Plex Sans / IBM Plex Sans Arabic / Inter through the existing font setup;
  - update `docs/az-talkie-v2/05-design-system.md` to Lumina;
  - add this doc to the pack and a line in `16-practice-engine.md` §2.1 pointing here.
- Done when: the path, a lesson page and the cards screen render white Lumina with no hard-coded old mint left (a grep for the old hexes outside the token files finds nothing), and Omar approves the look.

**R1 · Chat shell, thread, coach file, fixture**
- Do:
  - `ReviewChatShell`, `ChatThread`, `CoachMessage`, `LearnerBubble`, `RoundDivider`, `TypingRow`, `QuestionCard`;
  - the derive-thread logic from a session (answered / current / collapsed rounds);
  - the header with per-round progress;
  - the coach content loader with variants;
  - the fixture route;
  - auto-scroll and the keyboard-safe composer slot;
  - the tab bar hidden inside the session.
- Done when: the fixture opens as a chat with the opening message and a round divider, and reloading the page mid-fixture rebuilds the same thread.

**R2 · Listening and recognition**
- Do: `AudioPrompt` (play, 0.8×, waveform), `ChoiceSheet`, `ChipRow`, `FeedbackPanel` (correct, wrong, unclear), `StageChip`; the types `listen_meaning`, `listen_pick_tl`, `situation_choice`, `pick_meaning`, `pick_tl`, `read_meaning` with `ReadingCard`; retry until right with only the first try posted.
- Done when: those fixture steps play end to end and match `01`, `01b` and `06`, minus everything listed in §1.2.

**R3 · Pictures**
- Do: `ImageGrid` with ImageSlot and its right / wrong captions (amber, not peach); the `listen_pick_image` blocks ("N من 6"); `describe_image_write` and `describe_image_speak` cards.
- Done when: the fixture picture block matches `02` with real images, and a missing url shows the placeholder.

**R4 · Writing**
- Do: `TextComposer` (accent row, send, "مش عارف" hint link), `SituationBox`, `QuotedMessage`, `BlankSentence`; the near-miss panel with the highlighted fix and the "اتسجّلت في نواقصك" chip; hint flow with `hint_used`; the types `dictation`, `translate_write`, `reply_write`, `fill_blank_write`, `describe_image_write`; the typing row for LLM-graded types, with the 8 s timeout and the unclear state.
- Done when: the fixture writing steps match `03`, and a hinted answer is logged with `hint_used: true`.

**R5 · Grammar and sentence building**
- Do: `TileTray` (distractor tiles, مسح, تأكيد الإجابة, the hint link), `SlotLine`, `GrammarNote` inside wrong panels; the types `choose_article`, `complete_phrase`, `fill_blank_choice`, `build_sentence`.
- Done when: the fixture grammar steps match `04`, with the wrong panel in amber and the grammar note in terracotta.

**R6 · Speaking**
- Do: `MicComposer` (record, local playback, never upload, "مش قادر أتكلم دلوقتي" → the writing twin), `SelfRating`, `CharacterBubble` with the text hidden until answered; the types `say_it`, `reply_speak`, `read_aloud`, `describe_image_speak`.
- Done when: the fixture speaking steps match `05`; switching to writing logs the writing skill; and no audio request leaves the device.

**R7 · Round and session end, real sessions, footer tab**
- Do:
  - `RoundEndCard` and `SessionEndCard` (§5);
  - the extra round in the same thread;
  - connect the shell to real sessions from E7 (`16-practice-engine.md` §8 footer tab and home entry open this chat);
  - remove the fixture from non-admin builds.
- Done when: Omar taps "مراجعة" on day 5, answers a full round in the chat, closes the app, reopens and continues in the same thread, and the end card shows his lessons with no percentage anywhere.

**R8 · QA pass**
- Do:
  - check 390px and wider centring, RTL in every bubble and composer, an iOS PWA keyboard pass, Android Chrome;
  - check focus rings, Arabic labels on icon buttons, and tap targets;
  - a grep check that no learner-facing string contains "٪" or "%" inside `review-chat`.
- Done when: Omar runs the whole fixture on his phone with nothing clipped, overlapping or wrapped wrongly (the header, the avatar and the names from §1.2).

---

## 8. Decisions

1. **Chat look for the review** (Omar, 2026-11-24). The daily review is a chat with the coach, and every quiz type of the lessons has a chat form. This replaces `16-practice-engine.md` §2.1 for the review only.
2. **Lumina white theme** (Omar, 2026-11-24). Lumina is the colour schema, and its values win over the Stitch HTML. Default: applied globally to v2 through the token files (`05-design-system.md`, `design/lumina/DESIGN.md`).
3. **Defaults (Omar can change them):**
   - the thread is rebuilt from the session, with no chat-message storage;
   - coach lines come from a content file, with no model;
   - learner mistakes are amber and terracotta is only for the grammar note;
   - no percentages for learners, even where the Stitch screens show them.