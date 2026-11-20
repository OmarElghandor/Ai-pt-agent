# 14 · Library (stories and podcasts from real life)

Status: plan, 2026-11-13 (audio provider changed to ElevenLabs and "real moments" added the same day). Author: Omar + Claude. Implementation: Cursor.

Companion docs: `14b-library-content.md` (voices + 20 briefs), `14c-library-design.md` (Stitch refs, fixes, language notes), `14d-library-admin.md` (admin tool). Tasks L1, L2, L3, L4a, L4b and L8 below are **replaced by the LA tasks in `14d`**; L5, L6 and L7 stay and start after LA9.

Read first: `AGENTS.md`, `00-decisions.md` (§1, §2, §4 story builder, §10), `12-custom-decks.md` (§2.1 item pool, §2.6 review). Where this document disagrees with `00` §1 about "المكتبة", with `00` §10 about the TTS provider (for the library only), or with `12` §2.7 about every deck being public, **this document wins**, and task L0 writes the changes into `00` and `12`.

No code in this document by design.

---

## 1. The feature in one paragraph

A new module, **المكتبة**, holds episodes of 3–5 minutes: **stories** (an illustrated real scene, read and listened to) and **podcasts** (audio-first: a phone call, two people talking). Every episode is a complete real-life situation from start to end, not an exercise: the whole supermarket shop from the trolley to the till, describing pain at the pharmacy and walking out with medicine, a phone call to a landlord about a flat. Each episode also carries the **small real moments** that textbooks skip: asking someone at the gym if they still need that weight, asking the waiter if a dish is spicy or has a vegetarian option. Episodes are ordered in one list from easiest to hardest, and they are **not locked to the learner's day or level**: anyone can open any episode. Audio is **ElevenLabs** for the best listening quality. The learner listens with the transcript on screen; the current sentence follows the audio, and tapping any word opens its meaning with **"ضيفها لكروتي"**, which saves it to the learner's private deck with the sentence it came from.

---

## 2. Decisions

### 2.1 Name and the old "Library"

- `00` §1 used "المكتبة" for the book in its original order (rules, tenses, verb cards, picture dictionary). That module was never built.
- **This module takes the name المكتبة.** The book-order idea becomes a later tab inside it, **"المراجع"**, if it's still wanted. Until then the tab doesn't exist.

### 2.2 Not tied to the learner's level

- No unlocks, no "يفتح Dia N", no warning that an episode is hard.
- Each episode carries a **level from 1 to 5** (§2.4), shown as a calm label: سهل جداً · سهل · متوسط · أصعب شوية · صعب. No CEFR labels (A1, A2) anywhere in the library.
- The list is sorted by level, then by the order Omar sets in admin (the measured score only suggests). A filter by type (قصص · بودكاست) and by level.
- The curriculum ignores the library: lesson generation, questions, distractors and the known-items list never read episodes. Words saved from the library follow the custom-item rules of `12` §2.6.

### 2.3 Real, not training

Every episode is written from a **situation brief** that describes the full real flow, beat by beat, with what people in Portugal actually say. Examples:

- **السوبر ماركت (شوبنج كامل):** taking a trolley, the fruit section and weighing, the deli counter and the ticket, asking an employee where something is, the till (store card, tax number on the receipt, bag), paying by card, the receipt.
- **الصيدلية (ألم ومحتاج دوا بسرعة):** describing the pain and where it hurts, the pharmacist's questions (since when, fever, allergies, other medicines), the recommendation, how to take it, the price, tax number.
- **مكالمة مع صاحب الشقة:** calling about an ad, is it still available, rent and what it includes (building costs, water, electricity), deposit and months in advance, guarantor, the contract and receipts, arranging a visit, giving a name and number.

Rules for every brief and script:

- The scene goes from start to end. No cut after the first exchange.
- The other person talks like a real person: fast fillers, questions the learner didn't expect, small misunderstandings and repairs.
- pt-PT, with the formality rules of `00` §4 (o senhor / a senhora, tu only where it fits; at the gym and between people the same age, tu is normal).
- **Extra content is welcome** (`14c` §2): words, sentences and facts outside the curriculum and the 1000-word list. The goal is real exposure, not a controlled lesson.
- **No real brand, shop or company names** and no real people. Generic places like the image rules of `00` §10, so later languages can reuse the structure.
- Each brief is reviewed by Omar before generation (review the data once, generate once).

### 2.3b Real moments (decided 2026-11-13)

The main flow of a place (order, pay, leave) is what every course teaches. What makes an episode feel real is the **small side moments** that happen to anyone living there and that no drill covers. Every brief has a list of them, and the script must include them.

- **What a real moment is:** a short exchange of 1–4 lines, inside the main flow, about something practical that really happens in that place. It isn't a new scene and it doesn't stop the story.
- **Three directions, mixed in each episode:**
  - **the learner asks** (يسأل): "are you still using this weight?";
  - **the learner is asked** (يتسأل): someone asks him "how many sets do you have left?", the waiter asks "is everything OK?";
  - **the learner hears it** (يسمع): a short exchange between two other people next to him, which he understands from context.
- **How many (minimum):** 2 on level 1, 3 on levels 2–3, 3 on levels 4–5. More is fine.
- **Written in Egyptian in the brief.** Omar writes each moment as a situation, not as Portuguese: "يسأل لو الأكل حار". The model writes the Portuguese, as people in Portugal would say it. If Omar knows the exact local phrase, he adds it as `must_say` on that moment and it's used as is.
- **Things that matter to our learners** make good moments: does this have pork in it, is there a vegetarian option, are the bread and olives on the table paid. Keep to what happens often, not rare situations.
- **Moment bank:** examples by place live in `14b` §2 and in `content/v2/library/moments.json` (Egyptian descriptions only). It never holds Portuguese written by us unless Omar adds a `must_say`.
- In podcasts with no learner (two friends talking), directions don't apply.

### 2.4 Levels and difficulty

Levels are targets for generation and are then **measured by code** on the finished script.

| Level | Length | Speech | Sentences | Vocabulary | Tenses |
|---|---|---|---|---|---|
| 1 سهل جداً | ~3 min | slow | short, one idea | mostly the 500 most common words | present, a few fixed chunks |
| 2 سهل | ~3–4 min | slow-normal | short | top 1000 | present, near future (vou + inf), pretérito of a few verbs |
| 3 متوسط | ~4 min | normal | medium | top 1000 + situation words | + pretérito, imperfeito in fixed uses |
| 4 أصعب شوية | ~4–5 min | normal | medium-long | + less common words | all common tenses, conditional for politeness |
| 5 صعب | ~5 min | natural | long, interruptions, two topics | natural | everything |

- **Code computes the score** from: the average sentence length, the share of tokens outside the 1000-word list, the tenses used (from the token analysis, §2.6), the number of speakers and turns, and the speech rate setting.
- An episode whose measured level differs from its target by more than one is flagged in the review; it's never auto-rewritten. Omar can accept the measured level.
- The 1000-word list is the existing "1000 Palavras Mais Comuns" reference.

### 2.5 Two types

- **قصة (story):** a scene with 2–3 people and a short narrator line where it helps. 1–3 scene images (§2.9). The screen is text-first: the transcript with images between scenes, and audio plays with it. "Heard" moments can add a third or fourth speaker for 1–2 lines.
- **بودكاست (podcast):** audio-first. Mostly phone calls, a voice message thread, or two friends talking about a situation. One cover image. The screen is player-first: a large player, and the transcript scrolls under it.
- Both use the same script shape, the same audio pipeline, the same tap-a-word sheet and the same saved-words deck. The type changes only the layout and the images.

### 2.6 The script

- **Shape:** a title (`title_tl`, `title_ar`), a one-line Egyptian setup (`intro_eg`: "إنت داخل السوبر ماركت ومعاك لستة"), the cast, the lines, and `notes` (`14c` §2). Each line has a speaker, `tl`, its `ar` meaning (simple MSA, `00` §2), the scene index for stories, and `moment` (the id of the real moment it belongs to, or empty for the main flow).
- **The learner is a character.** In most episodes one character is "you" (yassin, or the learner's gender from the profile, with `tl_f` where forms differ, like `00` §4). In some podcasts nobody is the learner.
- **Tokens (built after the script):** each line is split into tokens. Each token has its surface form, the `lemma`, the part of speech, the **meaning in this context** (MSA), and, for verbs, the tense and person.
  - Multi-word chunks are marked as one tappable unit ("se faz favor", "há quanto tempo").
  - Function words (o, a, de, em, que) are tappable but show a short Egyptian note instead of a card button.
  - **Verb forms are checked against the verified conjugation table** (`00` §2). If the table knows the lemma and the form doesn't match the claimed tense and person, the token is flagged. A verb not in the table keeps the model's analysis but can't show a conjugation poster.
  - Token analysis is a separate model call per episode (non-streamed JSON), so the script call stays small.
- **Code checks on the script** (warnings unless said otherwise): pt-PT list, no "/" in `tl`, line count fits the level's length, `ar` present for every line, no brand names (a short blocklist), every moment in the brief has at least one line tagged with it, a `must_say` phrase appears word for word, directions are mixed when there are 3 or more moments, the notes checks of `14c` §2. **Fatal** (one retry): no parse, under 15 lines, a speaker not in the cast.

### 2.7 Audio (ElevenLabs, decided 2026-11-13)

- **Provider: ElevenLabs, for the library only.** Lessons, cards, stories inside lessons and talk keep the current TTS (`00` §10). Env, server only: `ELEVENLABS_API_KEY`, `LIBRARY_TTS_MODEL`.
- **Pre-generated from admin, not lazy.** Episodes are long and the highlight needs timings, so audio is built once by an admin action. Learners never trigger an ElevenLabs call.
- **Accent:** voices are picked from the ElevenLabs voice library as Portuguese (Portugal) voices, tested on a fixed pt-PT check script, and approved only after Omar listens. If the model has a language setting, it's set to Portuguese, but the voice approval is the real guard.
- **Library voice registry** (`14b` §1): one approved voice per recurring character, a learner_f voice, a pool of approved voices per gender for new characters, and one narrator. Voice settings are stored per voice and never changed per line.
- **Per-line generation with timestamps.** Each line is generated on its own with the timestamps endpoint, which returns character-level timing. Code maps the characters to the tokens to get each token's start and end. Previous/next text context: **not confirmed on the live API yet** (`ELEVENLABS_PREV_NEXT_TEXT_SUPPORTED` in `lib/v2/library/elevenlabs.ts` is `null`). When set to `true`, the client sends `previous_text` / `next_text`; until then those fields are omitted.
- **Speech rate per level** through the voice speed setting (`14b` §1.2). The player's 0.75× covers the rest. No separate slow file.
- **Word and card audio come from the line, not new calls.** The word sheet plays the word's slice of the line audio; a saved card uses the same slice and the full line for its example.
- **Cost guard:** estimate before every build, characters and cost logged per line, a monthly cap (`LIBRARY_TTS_MONTHLY_CHAR_LIMIT`), and rebuilds only for lines whose `tl`, voice or settings changed (the audio key includes voice id, model and settings).
- **No mixed voices.** If a line fails after one retry, the build stops at that line. An episode is never published with lines from another provider.
- Small pauses between turns are added by code. A phone-call podcast may get a light phone filter on the other person's voice (a playback setting) only if it doesn't hurt clarity; decided in L5 by listening.
- Line audio is stored on Cloudinary (folder `az-talkie/v2/library`), plus one stitched file per episode for the background player.
- Learner-gender lines that differ (`tl_f`) get both versions, and the player picks by the profile.

### 2.8 The player

Build from the Stitch refs with the fixes in `14c` §3.

- **Top:** title, type, level label, length, and the one-line Egyptian setup.
- **Controls:** play / pause, back 5 seconds, speed (0.75× · 1×), "كرر الجملة" (loop the current sentence), and a time track.
- **Transcript:** bubbles (learner left, others right; podcasts without a learner show speakers by name). The current sentence is highlighted and scrolls into view; the current word gets a light underline. Lines of a real moment get a small quiet marker in the margin. Language notes sit between lines (`14c` §2) and never pause the audio.
- **Meaning is hidden by default.** Each line has a small "المعنى" button. A global switch "اظهر المعنى كله", remembered per user.
- **Tap a sentence's speaker icon** → replay that line.
- **Tap a word** → the audio pauses and a bottom sheet opens: the word, its lemma ("fui ← ir"), `say`, a play button (the word's slice), the meaning in this sentence, tense and person for verbs, the episode sentence with play, and **"ضيفها لكروتي"** or "في كروتك ✓". Closing the sheet resumes the audio if it was playing.
- **Tap a chunk** → the same sheet for the whole chunk.
- **Resume:** leaving and coming back continues from the last sentence.
- **End:** "خلصت الحلقة" with the number of words saved, **"جمل هتحتاجها"** (the learner's lines from the real moments, each with play, meaning and "ضيفها"), an optional collapsed "فهمت إيه؟ · ٣ أسئلة" with "تخطي", and "الحلقة الجاية" / "اسمعها تاني". No scores.

### 2.9 Images

- **Stories:** one 16:9 image per scene (1–3), through the existing pipeline (`00` §10): cast reference sheets, generic places, palette rotation, Haiku QA. Keys: `library.pt-PT.<episode-slug>.scene-<n>`.
- **Podcasts:** one cover image, key `library.pt-PT.<episode-slug>.cover`.
- No place badges or real-city captions. Images are not required to publish; a missing image shows the calm placeholder.

### 2.10 Saved words → the private library deck

- `12` §2.7 says every custom deck is public. **Changed for this feature:** each learner gets one automatic private deck, **"من المكتبة"**, kind `saved`. It's never in "من المتعلمين", has no report button, and can't be promoted.
- Saving a word:
  - The lemma is resolved like `12` §2.1: an official item if it exists, otherwise a custom item in the shared pool (`v2_custom_items`), keyed by lemma and part of speech.
  - For a custom item created from the library, `ar` is the contextual meaning and **the example is the sentence from the episode**, with its line audio.
  - The card shows the **lemma**, not the conjugated form: tapping "fui" saves "ir".
  - A chunk, or a whole line from "جمل هتحتاجها", saves as a phrase item.
  - The deck link stores the source (episode id + line index), so the card back can show "من: السوبر ماركت" and play the original line.
- Review follows `12` §2.6: its own session, due first, at most 10 new cards a day, **not in the daily 15**, counts for the streak.
- Removing a word from "من المكتبة" removes the link only; item state stays.
- No limit on saving now. If abuse shows up, a per-day cap goes in one function like `customDeckQuota`.

### 2.11 Catalog

The 20 starting episodes, their casts and moments are in `14b` §3.

---

## 3. Data

New collections (prefix `v2_`); admin additions are in `14d` §3.

- `v2_library_briefs`: one per situation: language, slug, type, target level, setup, beats, must-have phrases, real moments (id, Egyptian description, direction, optional `must_say`, optional bank id), cast, places, linked episode, status (draft | approved).
- `v2_library_episodes`: one per brief × version: title, type, target level, measured level and score, cast with gender and voice key, lines (`tl`, `tl_f`, `ar`, speaker, scene, `moment`, audio key, character count, timings), tokens per line with start/end, chunks, notes, images, duration, status (draft | published | hidden), sort order, warnings, text and audio cost.
- `content/v2/library/moments.json`, `content/v2/library/voices.json`, and one brief file per episode (from `14b`).
- `v2_library_tts_usage`: characters and cost per line build, for the monthly cap.
- `v2_library_progress`: one per user × episode: last line, finished at, times finished, saved-word count. **User-keyed** (A5 list).
- The "show all meanings" preference on the user document or `v2_user_settings`.
- Saved words reuse `v2_custom_items`, `v2_custom_decks` (new `kind: saved`, `visibility: private`, one per user) and `v2_user_decks`. The saved deck is **user-keyed and deleted with the account**. Each deck entry carries the source episode and line.

Indexes: unique on language × slug × version; published episodes by language × sort order; unique on user × episode.

---

## 4. Learner API (thin routes, logic in `lib/v2/library`)

All need a signed-in user; the user id comes from the session helper only. Admin routes are in `14d`.

- List published episodes (filter by type and level, with the user's progress).
- Get one episode (lines, tokens, audio keys, timings, notes, images, moment markers; `tl` or `tl_f` by the profile).
- Save progress (last line, finished).
- Save a word, chunk or moment line to "من المكتبة" and remove it.
- Answer the optional end questions (through `/api/v2/answers`, type `library_check`, never counted as an error).

---

## 5. UI

Learner screens follow the Stitch refs and fixes in `14c`, with the "Stitch mint" colors.

---

## 6. Tasks for Cursor

Same rules as `10`, `11` and `12`: one task per session, in order, tests included, stop at "Done when". Admin tasks LA0–LA9 in `14d` come first. Prompt:

> Read docs/az-talkie-v2/14-library.md (whole), 14c-library-design.md, AGENTS.md, 00-decisions.md and 12-custom-decks.md §2.1 and §2.6. Implement task **L-x only**. Do not start the next task. The user id always comes from the session helper. Never write Portuguese or Arabic content yourself; it comes from the model or from Omar. Write the tests the task asks for. Stop when "Done when" is met and list the files you changed.

**L0 · Write the decisions**
- Do: add "§1c Library" to `00` summarising §2 (real moments and the notes decision of `14c` §2 included); change the "المكتبة" line in `00` §1 (§2.1 here); note in `00` §10 that the library uses ElevenLabs and everything else keeps the current TTS; note in `12` the private `saved` deck kind (§2.10); link 14, 14b, 14c and 14d from the README.
- Done when: docs updated, nothing else changed.

**L1–L4b, L8:** replaced by `14d` LA1–LA9.

**L5 · Player** (after LA9)
- Do: library home, story and podcast layouts per `14c`, sentence and word highlight, speed, back 5 s, loop sentence, meaning per line and the global switch, notes, moment markers, resume, end screen with "جمل هتحتاجها".
- Done when: on his phone, Omar listens to the pharmacy episode end to end, the highlight stays in sync, leaving and coming back resumes at the right line, and the gym episode's end screen lists its moment lines. Phone filter decided here by listening.

**L6 · Tap a word → "من المكتبة"**
- Do: the word sheet with the word's audio slice, lemma resolution to official or custom items (reuse `12` C1), the private `saved` deck, the episode sentence and its line audio as the example, saving a whole moment line as a phrase, the source link on the card back, remove.
- Tests: tapping "fui" saves "ir"; a word that exists in a lesson saves the official item; the same word saved from two episodes is one card; a moment line saves as one phrase card; the saved deck never appears in "من المتعلمين"; saving makes no TTS call.
- Done when: Omar saves 5 words from the landlord call and two moment lines from the gym, and reviews them in the deck session with the original sentences playing.

**L7 · Optional end questions**
- Do: 3 code-built questions per episode, skippable, at least one about a real moment, through `/api/v2/answers` as `library_check`, never errors.
- Done when: finishing an episode shows them and skipping works.
