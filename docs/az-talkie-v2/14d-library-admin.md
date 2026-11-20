# 14d · Library admin tool (building episodes)

Status: plan, 2026-11-14. Author: Omar + Claude. Implementation: Cursor.

Read first: `AGENTS.md`, `00-decisions.md` (§0b admin role, §10 image pipeline), `14-library.md` (whole), `14b-library-content.md` (voices, moment bank, 20 briefs), `14c-library-design.md` (notes decision). The tasks here (LA0–LA9) **replace** `14` tasks L1, L2, L3, L4a, L4b and L8. The learner-side tasks L5, L6 and L7 in `14` run after LA9.

No code in this document by design.

---

## 1. What the tool is for

One place where Omar takes an episode from an idea to a published story or podcast, step by step, seeing the cost of every paid step before it runs, and never paying twice for the same thing. Nothing is generated without his click, and an approved step is never rerun unless he changes its input.

The episode moves through fixed stages. Each stage has one screen section, one action button and one status:

**Brief → Script → Tokens → Review → Voices check → Audio → Images → Publish**

| Stage | Status values | Paid? |
|---|---|---|
| Brief | draft · approved | no |
| Script | none · generating · ready · failed | Claude |
| Tokens | none · generating · ready · failed | Claude |
| Review | open · approved | no |
| Voices check | missing · ok | no |
| Audio | none · estimated · building · ready · partial · failed | ElevenLabs |
| Images | none · queued · partial · ready | image model |
| Publish | draft · published · hidden | no |

Rules between stages:

- A stage's button is enabled only when the stage before it is done (approved or ready). Images are the exception: they can run any time after Script, and never block Publish.
- **Changing an earlier stage marks the later ones "stale"** with a calm amber label ("السكريبت اتغير، الصوت محتاج يتعمل تاني لسطرين"). Stale stages keep their old output until rebuilt, and only the affected parts are rebuilt (lines, not the whole episode).
- Publish needs: brief approved, review approved, audio ready with no stale lines, no voice placeholders in the cast.

---

## 2. Screens (admin, desktop-first, RTL)

All under `/v2-admin/library`, inside the existing v2 admin layout and guard (`denyUnlessV2Admin`, `00` §0b). Admin UI text is Egyptian; content shows as it is. Admin chrome follows the existing v2 admin pages.

### 2.1 Episodes list — `/v2-admin/library`

- Table: number, title (ar + tl), type, target level, measured level, stage chips (one per stage, colored by status), warnings count, total cost, updated.
- Filters: type, level, stage ("محتاج مراجعة", "محتاج صوت", "جاهز للنشر", "منشور").
- Buttons: "حلقة جديدة", "استورد من 14b" (§2.7), and a quiet "التكلفة" link (§2.5).
- Drag to reorder **within a level** (the sort order of the learner list; the measured score only suggests, Omar decides).

### 2.2 Episode page — `/v2-admin/library/<slug>`

One long page with a sticky stage bar at the top (the 8 stages as steps, the current one highlighted). Each section below:

**a. Brief**
- Fields: slug (fixed after first save), type, target level, setup (`intro_eg`), cast (rows: role, character key or pool key from the voice registry, gender shown from the registry, "learner" flag), places (generic), beats (ordered list, drag to reorder), must-have phrases (optional, TL), linked episode (e.g. 16 → 9).
- **Real moments:** a picker that opens the moment bank filtered by place, plus "لحظة جديدة". Each moment row: Egyptian description, direction (يسأل · يتسأل · يسمع · none for no-learner podcasts), optional `must_say`. A counter shows "٣ من ٣ مطلوبين" by level (`14` §2.3b); approve is disabled below the minimum.
- Buttons: save, "اعتمد الـ brief". Editing an approved brief asks once and marks Script stale.

**b. Script**
- "ولّد السكريبت" with the estimate (model, expected tokens, ~cost) in the button tooltip.
- Shows the result as a two-column reader: TL line (Newsreader) and `ar` under it, speaker chip with its voice key, scene number, moment tag chip, notes (`14c` §2) between lines.
- Warnings panel (from `14` §2.6 and `14c` §2): each warning links to its line. Fatal problems show the retry result and the raw output in a collapsed box.
- "ولّد تاني" regenerates the whole script (asks once; shows that tokens, audio and review will go stale).
- **Regenerate one line or one moment:** a small action on a line ("اكتب السطر ده تاني" with an optional instruction box) and on a moment ("اكتب اللحظة دي تاني"). It sends only the surrounding lines as context and replaces just that part. This is the normal way to fix things, not full regeneration.

**c. Tokens**
- "حلّل الكلمات" runs the token call.
- View: each line split into token chips. Tapping a chip shows lemma, POS, meaning in context, tense/person, `say`, and chunk membership. Flagged tokens (conjugation-table mismatch) are amber.
- Fix by hand: edit lemma or meaning for one token, merge tokens into a chunk, split a chunk. Hand edits are kept on token rebuilds of other lines.

**d. Review**
- Top: level box — target vs measured, the score parts (sentence length, out-of-1000 share, tenses, turns), and "اقبل المستوى المقاس".
- Moments coverage: each moment with ✓ and the line numbers that cover it, or "ناقصة".
- Read mode: the full script as the learner will see it (bubbles, notes), with a "اسمع بصوت المتصفح" quick preview (browser speech, free, rough) to catch rhythm problems before paying for audio.
- **Edit a line by hand:** `tl`, `tl_f`, `ar`, speaker. Saving reruns tokens for that line only and marks that line's audio stale.
- "اعتمد المراجعة" (Omar's sign-off). Any later script edit reopens review for the edited lines only.

**e. Voices check**
- The cast list with each voice key, its ElevenLabs id (or `<<placeholder>>` in amber), approved yes/no, and a play button with the pt-PT check script sample (cached from the voices page).
- Pool voices are assigned here by code (unused ones of the right gender), and Omar can swap a pool voice from a dropdown.
- Status ok only when every cast voice has a real id and is approved.

**f. Audio**
- "احسب التكلفة": characters per line and total, the level's speed, estimated credits, and what's left in the monthly cap. Lines already built and unchanged show "جاهز" and cost 0.
- "ابني الصوت": builds missing and stale lines only, with live progress per line, then stitches.
- Per line: play, waveform with token boundaries (to check the timings), "ابني السطر ده تاني" (with the cost).
- A full "اسمع الحلقة" player that uses the real learner player component in preview mode (when L5 exists; before that, a simple line-by-line player with highlight), so Omar hears what learners will get.
- Failures: the build stops at the failed line (`14` §2.7), shows the error, and offers retry for that line.

**g. Images**
- Stories: one row per scene with the code-built spec (editable), status, preview, and generate / regenerate / upload, through the existing pipeline. Podcasts: one cover row.
- Shows the estimated cost first, like the lesson images tab.

**h. Publish**
- A checklist of the publish rules (§1) with ✓ or the missing item.
- "انشر" / "اخفي". Published episodes can still be edited; edits go to a draft version and the published one stays live until "انشر النسخة الجديدة".

### 2.3 Voices — `/v2-admin/library/voices`

- The registry from `14b` §1: cast voices, learner_f, narrator, pool. Each row: key, who, gender, ElevenLabs id (editable), settings (stability, similarity, style), approved, approved at.
- "اختبار الصوت": plays the fixed pt-PT check script with that voice, model and settings (generated once per voice + model + settings and cached, so testing again is free). Approve / reject buttons.
- Global settings: model id, output format, monthly cap, speed per level. Changing the model or a voice's settings marks every episode that uses it "audio stale" (shown, never rebuilt automatically).
- The pt-PT check script text is entered by Omar on this page (one text field), never written by Cursor.

### 2.4 Moment bank — `/v2-admin/library/moments`

- Places as tabs; each moment: Egyptian text, optional `must_say`, used-in count (episodes). Add, edit, archive (archived moments stay on existing briefs).

### 2.5 Cost — `/v2-admin/library/cost`

- Per day and per month: Claude (script, tokens, line rewrites), ElevenLabs (characters, credits), images. Per episode totals. The monthly ElevenLabs cap bar.

### 2.6 Jobs

- Every paid action runs as a background job (the existing job runner, new kinds: `library_script`, `library_line_rewrite`, `library_tokens`, `library_audio_line`, `library_stitch`, `library_image`, `library_voice_test`). The page polls status; closing the tab never cancels a job. One running job per episode per stage; a second click is refused while one runs.

### 2.7 Import from 14b — "استورد من 14b"

- Reads `content/v2/library/voices.json`, `content/v2/library/moments.json` and the brief files in `content/v2/library/briefs/` (Cursor writes these in LA1 from `14b`; Omar edits them or the admin afterwards).
- Creates missing briefs as `draft`, never overwrites a brief that was edited in admin (shows "موجود، اتساب" instead). Voices and moments are merged the same way: new keys added, edited ones kept.

---

## 3. Data additions (on top of `14` §3)

- `v2_library_episodes`: `stages` (status per stage + updated at + stale flags), per-line `hand_edited` and `audio_stale`, per-token `hand_edited`, `published_version`, `draft_version`, `prompt_version` per generated part.
- `v2_library_jobs` (or the shared runner): kind, episode, line index (when per line), status, attempts, cost, error, started/finished.
- `v2_library_voices` (registry, seeded from `voices.json`) and `v2_library_settings` (model, format, cap, speeds, check-script text).
- `v2_library_voice_tests`: voice key × model × settings → cached sample audio url.
- `v2_library_moments` (seeded from `moments.json`), with archived flag.
- Audit: every approve, publish, hide and hand edit stores who and when (admin email).

---

## 4. Prompts and models

- Script: Claude (env `LIBRARY_SCRIPT_MODEL`), one non-streamed JSON call; input = brief, moments, level targets, the notes rule (`14c` §2), the formality rule. Output = title, setup, cast confirmation, lines (with `moment`), notes.
- Line / moment rewrite: same model, input = the brief summary, 3 lines before and after, the instruction; output = the replacement lines only, same shape.
- Tokens: Claude Haiku (env `LIBRARY_TOKENS_MODEL`), all lines in one call; for episodes over ~60 lines, split into two calls by scene.
- Prompts live in `lib/v2/library/prompts`, versioned (a `prompt_version` is stored on every output), so a prompt change can be traced.
- Cursor never writes Portuguese or Arabic content into prompts as examples except what Omar provides.

---

## 5. Tasks for Cursor

One task per session, in order, tests included, stop at "Done when". Prompt:

> Read docs/az-talkie-v2/14d-library-admin.md (whole), 14-library.md, 14b-library-content.md, 14c-library-design.md, AGENTS.md and 00-decisions.md §0b and §10. Implement task **LA-x only**. Do not start the next task. Admin pages and APIs live under `/v2-admin` and use the existing v2 admin guard. Never write Portuguese or Arabic content yourself; it comes from the model, from these docs, or from Omar. Write the tests the task asks for. Stop when "Done when" is met and list the files you changed.

**LA0 · Decisions**
- Do: `14` task L0 (decisions into `00` and `12`, README links).
- Done when: docs updated, nothing else changed.

**LA1 · Data, import, list**
- Do: the collections of `14` §3 and §3 here with indexes; write `content/v2/library/voices.json`, `content/v2/library/moments.json` and one file per brief in `content/v2/library/briefs/` from `14b` (text copied as is, placeholders kept); the import action; the episodes list with filters, stage chips and reorder within a level; the A5 additions.
- Tests: import creates 20 draft briefs; importing again changes nothing; an admin-edited brief is skipped on import; non-admins are refused on every library admin route.
- Done when: Omar opens `/v2-admin/library` and sees the 20 episodes in level order.

**LA2 · Brief editor and moment bank**
- Do: §2.2a and §2.4: brief form, cast rows from the registry, beats, moment picker with the level minimum, approve, stale marking on edit; the moment bank page.
- Tests: approve is refused below the moment minimum; editing an approved brief marks Script stale; an archived moment stays on an existing brief.
- Done when: Omar approves the pharmacy, gym and restaurant briefs.

**LA3 · Script stage**
- Do: §2.2b and §4: the job, the call, the checks from `14` §2.6 and `14c` §2 as warnings, fatal + one retry, the reader view, line and moment rewrite, full regenerate with stale marking, cost logging, prompt versioning.
- Tests (stub model): warnings link to lines; a line rewrite changes only that line and marks its tokens and audio stale; a fatal output retries once then shows the raw output; a second click while running is refused.
- Done when: the gym script is generated, Omar rewrites one moment with an instruction, and the rest of the script is unchanged.

**LA4 · Tokens stage**
- Do: §2.2c: the job, the token view, conjugation-table flags, hand edits (lemma, meaning, merge, split) that survive rebuilds of other lines.
- Tests: rebuilding line 5 keeps a hand edit on line 3; merge then split restores the original tokens; a flagged verb shows amber.
- Done when: Omar fixes one lemma by hand in the pharmacy episode and it stays after rebuilding another line.

**LA5 · Review stage**
- Do: §2.2d: level box with score parts and accept, moments coverage, read mode with browser-speech preview, hand line edits (tokens for that line only, audio stale for that line), approve, reopen on later edits.
- Tests: a hand edit reruns tokens for one line only; approve is reopened by a later edit for that line only; the measured level is shown next to the target.
- Done when: Omar reads the pharmacy episode in read mode, edits one line, and approves the review.

**LA6 · Voices page and voices check**
- Do: §2.3 and §2.2e: the registry editor, the check-script field, cached voice tests, approve/reject, global settings, pool assignment with swap, stale marking when a model or voice setting changes; the ElevenLabs client (timestamps endpoint) server-only, key from env `ELEVENLABS_API_KEY`; confirm on the real API whether previous/next text context is supported and record it in `14` §2.7.
- Tests (stub ElevenLabs): a second test of the same voice + model + settings makes no call; a placeholder id blocks the voices check; changing a voice's settings marks only episodes using it as audio stale; two pool voices in one episode are never the same.
- Done when: Omar fills and approves the voices for the pharmacy cast, and its voices check is ok.

**LA7 · Audio stage**
- Do: §2.2f: estimate, build missing and stale lines only, token timings from character timings, pauses, stitch, Cloudinary (`az-talkie/v2/library`), per-line rebuild, waveform with token boundaries, preview player, monthly cap, stop on failure.
- Tests (stub ElevenLabs): an unchanged rebuild makes no calls and costs 0; a hand-edited line rebuilds only that line and the stitched file; the cap stops before any call; a failed line stops the build and keeps earlier lines; every token has start and end, including a chunk and a word with an accent.
- Done when: Omar sees the estimate, builds the pharmacy audio, and the preview highlights words in sync.

**LA8 · Images stage**
- Do: §2.2g through the existing image pipeline: scene specs from code (stories), cover (podcasts), estimate, generate / regenerate / upload, generic-place rules (`00` §10, no place badges per `14c`).
- Done when: the pharmacy episode has its scene images and the landlord podcast has its cover.

**LA9 · Publish, versions, cost**
- Do: §2.2h, §2.5: the publish checklist, publish / hide, draft vs published versions, the cost page, the audit trail.
- Tests: publish is refused with a voice placeholder, stale audio or unapproved review; editing a published episode doesn't change what learners get until "انشر النسخة الجديدة"; the cost page totals match the job logs.
- Done when: the pharmacy episode is published and the learner API returns it (L5 can start).
