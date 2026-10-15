# Practice agent: lessons, listing, and chat

How this Next.js app runs European Portuguese practice for an Egyptian learner. The short source of truth for the engine is `docs/app-core-prompts-and-conversation-flow.md`. This report is the full walkthrough of the agent, the lesson list, lesson play, grading, chat, generation, and data.

## At a glance

| | |
|---|---|
| Home agents | 3: Friend, Practice, Assessment |
| Seed lesson slots | 24 (A0 slots 1–15, A1 slots 16–24) |
| Model prompts | 5: spec, pack, reviewer, reaction (R1/R2/R3), friend |
| Tries before a beat advances on a miss | 2 |

The home screen at `/` asks “مين تحب تكلم؟” and offers three partners. Practice never opens the old `/chat?agent=practice` URL. That query redirects into `/lessons`, or into `/lessons/[lessonKey]` when a lesson id is already in the query.

| Agent | Entry | Model |
|---|---|---|
| Friend | `/chat?agent=friend` | Prompt 5 every turn. Free European Portuguese chat. The model leads, stays inside words Langify has introduced, and ends every turn with an easy question. |
| Practice | `/lessons` then `/lessons/[lessonKey]` | A scripted scene. Code grades fixed answers. The model only reacts (R1), judges open lines (R2), or answers Arabic side remarks (R3). |
| Assessment | `/chat?agent=assessment` | R2 judge only. Same pack, no story character. A wrong first try shows the pack nudge, then the task advances. |

## One turn, one endpoint

Friend, practice, and assessment all post to `POST /api/chat`. The browser sends the last message, a session id from `localStorage` (`pt-learner-id`), a CEFR level, and an action. The server clones the learner file, runs `applyLearnerTurn` in `lib/turn.ts`, then either writes authored bubbles immediately or streams a model reply.

| Action | Who decides the reply | Model |
|---|---|---|
| `start-practice` | Code writes intro + first beat | None |
| `resume-practice` | Code restores the paused beat | None |
| `end-practice` | Code stores the focus as paused | None |
| `show-coach-tip` | Code shows the supported tip | None |
| `start-assessment` | Code shows task 1, no character | None |
| Known answer, pass | Praise or spelling fix, then R1 | R1 character |
| Known answer, wrong | Pack hint or why-note | None |
| Open answer or personal slot miss | R2 verdict, then code guard | R2 judge |
| Arabic-only during a beat | R3 coach, progress unchanged | R3 coach |
| Friend, or the 5-turn bridge | Prompt 5 chat | Friend |

## What a lesson pack contains

A playable pack is a `LessonPack`. Generation stores `plan`, intro, character, scenes, beats, closing hook, and assessment. The adapter ignores `plan` at runtime. Optional `farewell` and extra characters still adapt. A Mongo pack that is still the old `teach_steps` / `items` shape is rejected by `adaptMongoPack` and treated as needing generation.

| Beat difficulty | What the learner sees | How it is graded |
|---|---|---|
| guided | Narration if the scene changed; if the scene has `words`, a blocking word card until dismiss; then coach tip, then the character line. Sentence frame above the input. | Known list, graded in code |
| supported | Narration, character line, then coach tip. Word bank on screen. | Known list, graded in code |
| open | Character line, then tip if the pack has one. Frame and word bank together. | R2 judges, then the code guard can reject it |

Authored shape in `content/prompts/practice/pack.md`: three scenes. s01/s02 list 3–5 `words` (`pt`, `ar`, `arz`, optional `emoji`); s03 and review lessons use `words: []`. First uses are guided, then supported. Scene 3 brings a new person who re-asks two or three things as open beats. Phrase count is the nucleus plus two or three, and empty beats are not padded.

---

## Lesson list (`/lessons`)

The list page is a client screen. On load it reads `pt-learner-id` from `localStorage` (migrating the old `learner-id` key), creates a UUID when missing, and calls `GET /api/lessons/plan?id=`. In development, a small panel can replace that id with a 24-character Langify ObjectId and reload the plan. That id is what unlock and practice history are read against when it is a real Langify user.

The plan route refreshes the in-memory Mongo catalogue (30 second cache), warms the Langify known-words cache, reads the local learner file for `practisedAt`, then calls `getLearnerLessonPlan`.

### Order of sources

| Condition | List source | Response `source` field |
|---|---|---|
| `content/lessons/lesson-plan-seed-v1.json` exists | 24 seed slots, in order, overlaid with `practice_lessons` | `seed`, or `seed+mongo` when `MONGODB_URI` is set |
| Seed file missing | JSON packs under `content/lessons/`. `testOnly` packs join the list outside production, or when `ALLOW_TEST_LESSONS=1` | `json` |

Each seed row keeps its title, situation, CEFR level, topic, and grammar cells. A current Mongo row with the same `lesson_key` replaces the title, situation, level, requirements, pack status, and version. `hasPack` is true only when that Mongo row actually has a pack.

### Badge on each row

The cell and word unlock gate is switched off in `uiStatusFor`. Every slot is open. Missing cells and words are returned as empty arrays. The badge comes from practice history and generation status.

| `uiStatus` | When | What the list shows |
|---|---|---|
| `available` | Never finished | No badge |
| `done` | Finished, and 12 hours have not passed | Green check |
| `assessment_due` | Finished, and the 12-hour cooldown has passed | اختبر نفسك |
| `updating` | Mongo status is `generating` or `updating` | Badge hidden |
| `locked` | Reserved; the gate that would set it is off | Badge hidden |

Finished time is `practice_progress.finishedAt` when Mongo has a row, otherwise the local learner file `practisedAt`. Assessment becomes due at `assessmentDueAt`, or 12 hours after that finish time.

### Click and regenerate

A row that already has a pack navigates to `/lessons/[lessonKey]`. A row without a pack POSTs `/api/lessons/:key/generate` and waits. On `alreadyLive` or `hasPack` it navigates into the lesson. A failure shows the error and stays on the list. The link **ولّد تاني** posts the same route with `?force=1`, which clears the stored spec and pack so both prompts run again.

Opening `/lessons/[key]` directly checks `GET /api/lessons/:key/generation`. A JSON catalogue lesson plays immediately. A seed slot with no live pack runs the same generate POST before the first beat.

### The 24 seed slots

Source: `content/lessons/lesson-plan-seed-v1.json`. Slots 1–15 are tier 1 / A0. Slots 16–24 are tier 2 / A1. Grammar cells are the Langify ids the spec is built around.

| # | Key | Title | Level | Topic | Pattern | Situation |
|---|---|---|---|---|---|---|
| 1 | `ps-01-neighbour-greetings` | أهلاً يا جار | A0 | cumprimentos | greeting, thanks, goodbye | بتقابل جارك على السلم |
| 2 | `ps-02-first-day-work` | أول يوم في الشغل | A0 | cumprimentos | introducing yourself with eu | زميلة جديدة بتسألك عن نفسك |
| 3 | `ps-03-what-time` | كام الساعة؟ | A0 | numeros_e_horas | telling the time with é / são | بتسأل حد في محطة الأتوبيس |
| 4 | `ps-04-coffee-please` | قهوة لو سمحت | A0 | cafe_e_comida | queria + noun | على كاونتر كافيه في لشبونة |
| 5 | `ps-05-where-station` | المحطة فين؟ | A0 | direcoes_e_transporte | onde fica + place | بتسأل حد في الشارع |
| 6 | `ps-06-where-going` | رايح فين؟ | A0 | direcoes_e_transporte | vou ao / à + place | جارك شافك خارج من البيت |
| 7 | `ps-07-how-are-you` | عامل إيه النهارده؟ | A0 | emocoes_e_descricoes | estou + state | زميلك بيسأل عليك الصبح |
| 8 | `ps-08-my-day` | يومي العادي | A0 | trabalho_e_rotina | daily verbs with eu | بتحكي لزميلك عن روتينك |
| 9 | `ps-09-supermarket` | في السوبر ماركت | A0 | compras_e_dinheiro | quanto custa + item | عند الكاشير |
| 10 | `ps-10-family` | عندي ولاد وأخوات | A0 | familia_e_pessoas | tenho + noun | جارك بيسأل عن عيلتك |
| 11 | `ps-11-pharmacy` | في الصيدلية | A0 | saude_e_farmacia | dói-me + body part | بتشرح للصيدلي اللي بيوجعك |
| 12 | `ps-12-and-you` | وإنت؟ | A0 | cumprimentos | questions with tu | بتتعرف على زميل في الغدا |
| 13 | `ps-13-yesterday` | امبارح رحت وعملت | A0 | trabalho_e_rotina | ontem + fui and fiz | جارك بيسألك عن الويك إند |
| 14 | `ps-14-was-sick` | كنت تعبان | A0 | saude_e_farmacia | estive and tive | بتشرح لمديرك ليه اتغيبت |
| 15 | `ps-15-tomorrow` | بكرة هعمل إيه | A0 | trabalho_e_rotina | vou + verb | بتخطط الويك إند مع صاحبك |
| 16 | `ps-16-health-appointment` | ميعاد في المركز الصحي | A1 | telefone_e_contactos | marcar + day and time | مكالمة مع المركز الصحي |
| 17 | `ps-17-transport` | في المواصلات | A1 | direcoes_e_transporte | apanhar + ticket | بتسأل عن الأتوبيس وتشتري تذكرة |
| 18 | `ps-18-my-flat` | بيتي | A1 | casa_e_bairro | tem + rooms | بتوصف شقتك لصاحبك |
| 19 | `ps-19-flat-problem` | مشكلة في الشقة | A1 | casa_e_bairro | está / não funciona | بتبلّغ صاحب البيت بمشكلة |
| 20 | `ps-20-my-family-does` | عيلتي بتعمل إيه | A1 | familia_e_pessoas | ele/ela + present | بتحكي عن مراتك وأخوك |
| 21 | `ps-21-lets-go-out` | يلا نخرج | A1 | lazer_e_cultura | vamos + temos | بتتفق مع صحابك على خروجة |
| 22 | `ps-22-weather` | الجو النهارده | A1 | tempo_e_clima | está frio / faz sol | دردشة في محطة الأتوبيس |
| 23 | `ps-23-what-did-you-do` | إنت عملت إيه؟ | A1 | lazer_e_cultura | past questions with tu | بتسأل صاحبك عن رحلته |
| 24 | `ps-24-next-week-plans` | خطط الأسبوع الجاي | A1 | trabalho_e_rotina | vais + verb, vou | زميلك بيسأل عن خططك |

---

## Lesson play (`/lessons/[lessonKey]`)

`/lessons/[lessonKey]` loads the learner with `skipOpener=1`, so the Friend greeting is kept off this screen. After a pack exists it sends one chat action, `start-practice`, with an empty message. The server writes the intro, then the first beat, and returns them as typed bubbles. Voice is the default surface; a control switches to the text thread.

| Step | What is stored | What the learner hears |
|---|---|---|
| 1. Intro | `mode = practice`, beat 0, attempts 0 | One or two Egyptian sentences (`introAr` / `introArz`) |
| 2. Scene words | `sceneWordGate`, `sceneWordCardsSeen` | On s01/s02 with words: narration only, gate until `dismiss-scene-word-card`, then tip+line. Local reopen chip does not change progress. |
| 3. Beat | `coachTipShown` when a pre-hint was emitted | Tip and line in difficulty order (after any word-card dismiss) |
| 3. Answer | User bubble saved with a verdict label when code graded it | Latin text is an attempt. Arabic-only is a side remark. |
| 4. Reaction | Outcome on the beat id, or `attemptsOnCurrent += 1` | Praise, a coach note, or a short character line |
| 5. Next line | `beatIndex` moves to the next unresolved beat | The next beat is appended. The current line is not repeated. |
| 6. Closing | `phase = friend-bridge`, 5 turns left, `mode = friend` | Character closing hook, plus a checklist count |
| 7. Bridge | Each learner message decrements `friendBridgeTurnsLeft` | Prompt 5, kept inside the lesson situation |
| 8. Farewell | `practisedAt` set, practice cleared, `finishedLastTime` | Optional farewell line, then the lesson is marked practised |

The header button **إنهاء** calls `end-practice` and returns to the list. That stores the current focus on the lesson record as `paused` and sets mode back to friend. The button is visible only while mode is still practice, so it leaves the screen once the friend bridge starts.

`presentBeat` in `lib/messages.ts` builds each beat:

- On a scene change, and when this is the first showing of the line, a narration bubble is added from `narrationAr`. If that scene has authored words and has not been seen, grading / stuck / grammar / coach-tip actions are blocked until `dismiss-scene-word-card`.
- Guided: coach tip, then the character line.
- Supported and open: character line, then the coach tip when one exists.
- An alt re-ask (`useAltLine`) skips narration and the pre-hint.

### Help ladder on a wrong known answer

Known beats that miss are answered from the pack. The model is not called. The frame stays. The character line is not shown again. `useAltLine` is set so a later resume would use `altLine`.

| Attempt | Coach text, in order | Progress |
|---|---|---|
| 1 | Anticipated-wrong note, else `hint_note`, else the coach tip plus "جرّب تاني." | Stays on the beat |
| 2 | `why_note`, else the first accepted answer | Advances as `learned-with-help` |

A code pass on a known beat shows rotating praise (`Isso mesmo!`, `Muito bem!`, `Perfeito!`, `Boa!`) and advances as `correct`. A near-miss skips praise. The coach says `بنكتبها` followed by the corrected word, then R1 speaks one short character sentence, then the next beat appears.

### How an answer is classified

| Script | Meaning | Effect |
|---|---|---|
| `latin` | Any Latin letter, including accents | Graded as an attempt |
| `arabic-only` | Arabic letters and no Latin | R3 coach. The beat index does not move. |
| `empty` | Blank, or neither script | Turn is stored with verdict `ignored` and no new bubble |

### Known answers, in order

`gradeKnownAnswer` in `lib/grade.ts`:

| Check | Verdict | Then |
|---|---|---|
| Normalized text matches an accepted answer | `correct` | Praise, then R1 |
| Matches an anticipated wrong, with or without accents | `anticipated-wrong` | Pack feedback. Authored `near_miss` still counts as a pass. |
| Same letters once accents are stripped | `near-miss`, reason `accent` | Coach names the accented word, then R1 |
| Same word count, each word within edit distance | `near-miss`, reason `spelling` | Coach names the first misspelled word, then R1 |
| Anything else | `wrong` | Help ladder, no model |

Spelling distance allows 2 edits on words of 5 or more letters, and 1 edit on shorter words. An adjacent letter swap counts as 1. Personal slots `[NAME]`, `[CITY]`, `[NUMBER]`, and `[PLACE]` are matched first. A filled slot that matches the pattern is a code pass, and R1 is told the learner’s own value. A slot miss is sent to R2.

### Open answers

Open beats and assessment tasks always go to R2. Temperature is 0. Line 1 must be `VERDICT: correct`, `VERDICT: near_miss`, or `VERDICT: wrong`. In practice, a pass may include one character sentence and, for a near-miss, a fix block. In assessment the character block is omitted. If the fix Portuguese equals the learner’s text ignoring case, the verdict is promoted to `correct`. If the model says correct or near-miss and the open code guard fails, the verdict is demoted to `wrong`. Required words must appear, and some token must end with each required ending.

Open wrong attempt 1 shows the same pack hint ladder and stays. Attempt 2 shows `why_note` and advances as `learned-with-help`. A model pass advances as `correct`, or `near-miss`. Praise for an open pass is added only when the verdict is `correct`.

### What gets thrown away

R1, R2, and R3 output is parsed as tags in `lib/friendParse.ts`. The whole reaction is dropped when:

- text sits outside the tags
- the voice is the wrong type
- a character line contains a question mark, Arabic letters, or more than 12 words
- the Portuguese echoes the beat line or the next line
- an English word appears

The log line is `reaction_dropped`. On a dropped pass the server still shows praise and the next story line, so the learner is never left with a silent turn after a real attempt.

| Reaction | Voice allowed | Temperature | Max tokens |
|---|---|---|---|
| R1 after a code pass | `character` | 0.6 | 80 |
| R2 judge | `character` and coach (`fix`). Assessment: verdict line only | 0 | 120 |
| R3 Arabic side remark | `coach` | 0.4 | 150 |
| Prompt 5 friend | `chat`, optional `help` or `correction` | 0.7 | 400 |

R1 is one short statement, at most 8 words, informal `tu`, no question, and it must not repeat the next story line. R3 answers in one or two Egyptian sentences and does not speak as the character. If the learner is stuck, R3 explains the line and gives the sentence start (`frame`), never the whole answer.

### On-screen aids

`learnerView` derives chrome from the current beat while mode is practice and phase is story. It also exposes `sceneWordCard` (blocking or review), `showSceneWordChip`, and `sceneWordWarmPt` for TTS prefetch.

| Difficulty | Sentence frame | Word bank |
|---|---|---|
| guided | yes, from `beat.frame` | no |
| supported | no | yes |
| open | yes | yes |
| friend-bridge | closing-hook frame, only while mode is still practice | no |

Audio is fetched when a bubble plays, through `POST /api/tts`, using cached pack audio when a line was warmed. Generation does not call TTS. Scene-word Portuguese strings are returned on `GET .../generation` as `sceneWordWarmPt` and prefetched on lesson open (same client cache as line playback). `scripts/warm-lesson-audio.ts` also warms scene words. The microphone posts audio to `POST /api/stt` and sends the transcript as the next turn. New assistant bubbles autoplay in order once the learner has unlocked audio.

The scene header (`stageProgressLabel`) marks each scene done, current, or todo, and shows `position / beat count`. During the friend bridge every scene is marked done.

---

## Chat

### Friend chat

`/chat?agent=friend` boots the learner from `GET /api/learner`. That call composes an opener unless the thread already has messages. The opener rotates through three lines per situation and greets by the hour. The lesson page skips this with `skipOpener=1`.

| Situation | When | Opener intent |
|---|---|---|
| `first` | No user message and no finished lesson | Introduce the partner and ask what to talk about |
| `returning` | They have talked before | Welcome back and ask about the day |
| `paused` | A lesson focus is stored as paused | Offer to continue that lesson |
| `finished` | `finishedLastTime` is set | Name the lesson they just practised, then chat |

Every later turn is Prompt 5, built in `lib/friendPrompt.ts`. The system text includes:

- the CEFR level (`A0`, `A1`, `A2`, `B1` from the header picker)
- `KNOWN` cells and introduced words from Langify `userprogresses`
- `LAST_LESSON` when a pack is in context (title, learning target, situation, taught phrases)

The model sees the last 6 exchanges. It must lead, reuse the learner’s words, ignore small slips, and correct only when the meaning is lost. A grammar question (`إزاي أقول…؟`, `ليه بنقول…؟`) gets a `help` block in Egyptian Arabic first, then a chat block that invites the learner to try it. Output is optional `help` or `correction` tags, then a `chat` block of Portuguese and Egyptian pairs. The last pair is always a question or an invitation. European Portuguese, informal `tu`. Egyptian Arabic only in the Arabic segments.

`chipsFor` still builds start-practice, resume, and assessment chips. The friend page hides practice chips. Assessment mode keeps only `start-assessment` chips. Practice itself lives on `/lessons`.

### The five-turn bridge

When every beat has an outcome, `enterFriendBridge` appends the closing hook and a checklist, sets phase to `friend-bridge` with 5 turns left, and switches mode to friend. The next learner messages hit `friendTurn`. Each one decrements the counter and streams Prompt 5 with the lesson pack attached, so the chat stays inside that situation and can reuse the taught phrases. On the turn that reaches zero:

1. An optional farewell line is written when `farewell.pt` is present.
2. `practisedAt` is saved on the lesson record.
3. `lastPractisedLessonId` and `finishedLastTime` are set.
4. The practice focus is cleared.
5. The chat route calls `markLessonPracticed`.
6. If the pack has cell ids, those cells are marked practised.

The lesson list can then show `done`, and after 12 hours, `assessment_due`.

### Assessment chat

`/chat?agent=assessment` starts an assessment as soon as the learner view loads. A `?lesson=` id starts that pack. Otherwise the first `start-assessment` chip is sent. A pack needs `assessmentAvailable` and at least one task. Each task is a line with no story character.

R2 judges it. A wrong first try shows `nudge_note` and stays on the task. A pass, a near-miss, or a second miss records `pass` or `fail` and shows the next task. After the last task the server writes a results bubble from each task’s `passSummary` or `reviewSummary`, stores `assessmentByTarget` and `lastAssessedAt`, and returns to friend mode.

Assessment chips in friend mode appear only for packs that are marked `assessmentAvailable`, already have `practisedAt`, and are past the 12-hour cooldown. The list badge uses the same cooldown.

### Client loop

Both chat and the lesson page use the AI SDK `useChat` transport against `/api/chat`. They keep an action ref so a chip can send `start-practice` or `start-assessment` without looking like ordinary text. While the stream is in flight, the learner’s own text stays on screen. When streaming ends, the page refetches `/api/learner` and replaces the thread with the saved typed messages. Voice and text share that thread. The dev panel (`pt-dev-panel`) prints the last turn log: mode, lesson, beat, script, grading source, verdict, latency, and token count.

| Control | Route | Effect |
|---|---|---|
| Send text or mic result | `POST /api/chat` | One graded or friend turn |
| CEFR picker | `POST /api/learner` `action=level` | Stores A0–B1 on the learner file |
| محادثة جديدة | `POST /api/learner` `action=new` | Archives the thread and composes a fresh opener |
| Play a bubble | `POST /api/tts` | Speech for that segment |
| Hold the mic | `POST /api/stt` | Transcript becomes the next message |

Voice orb states: `speaking` while audio plays, `listening` while the mic is open, `transcribing` while speech-to-text runs or a turn is in flight, otherwise `idle`. Until audio is unlocked, the idle screen offers **اضغط لتسمع** on the last assistant line.

---

## Generation

`POST /api/lessons/:key/generate` calls `generateLessonDirect` in `lib/generation/runPipeline.ts`. There is no job queue. One in-flight promise per lesson key dedupes double clicks. The slot must exist in the seed plan. Audio is not generated here. A line is spoken later, when the learner plays it.

| Stage | Prompt file | Writes | Playback |
|---|---|---|---|
| `preparing_situation` | `content/prompts/practice/spec.md` | spec, requirements, status `spec` | Waits until a pack is live |
| `writing_exercises` | `content/prompts/practice/pack.md` | Pack JSON from the spec | Waits |
| `reviewing` | Hard validator in `lib/generation/validator.ts` | One full pack regeneration if hard checks fail | A second hard fail sets status `failed` |
| `done` | `content/prompts/practice/reviewer.md` | status `live`, plus `reviewer_issues` | Reviewer notes never rewrite the pack |

Inputs are assembled from the seed slot, earlier lessons on the same topic, the word-priority lists, the nucleus, the grammar grid, and the register map (`lib/generation/inputAssembler.ts`). Force (`?force=1` or `PRACTICE_LESSON_REGENERATE=true`) clears the pack and the spec so Prompt 1 runs again. A pack that no longer adapts is cleared the same way, while a still-valid spec is kept.

`repairStoryAids` runs on the pack before validation. There is no FIX MODE that patches a failing pack in place. A hard fail regenerates the whole pack once with the same prompt.

### What can stop a pack

The validator records many issues. Only three codes fail the run:

- `no_beats`
- `empty_accepted`
- `missing_scene`

Every other issue is stored on `validator_warnings` and the pack still goes live. After live, the reviewer runs once. Only `must_fix` and `should_fix` issues are saved. A reviewer failure stores an empty issue list and leaves the pack live. `needs_review` packs are not served as playable.

Soft checks, including out-of-allowlist words on accepted answers and word banks, are warnings. The closing hook is also checked so it does not ask the same question as a beat line.

### Pack document statuses

| `status` | Meaning |
|---|---|
| `spec` | Situation exists, pack not written yet |
| `generating` | A Claude call is in progress |
| `live` | Current pack can be played |
| `reviewed` | Also playable; treated like live by the adapter |
| `updating` | List shows the updating state |
| `failed` | Second hard validation failed, or the call threw |
| `needs_review` | Stored, and kept out of the playable catalogue |

---

## Data

This app and Langify share one `MONGODB_URI`. Langify collections are read-only, through `lib/langifyRead`. Identity for that read is `getCurrentUserId`: a 24-character session id, otherwise `DEV_LANGIFY_USER_ID` (or the legacy `DEV_USER_PROGRESS_ID`). The chat transcript itself is a JSON file, keyed by whatever string the browser stored.

| Store | Collection or path | Access | Holds |
|---|---|---|---|
| Langify | `users`, `userprogresses` | Read | Grammar cells, introduced words, finished missions |
| This app | `practice_lessons` | Write | Spec, pack, status, warnings, reviewer issues |
| This app | `practice_progress` | Write | Per-user finished and assessment times |
| This app | `practice_chat_state` | Write | Chat state schema; the live thread is the file store |
| This app | `practice_new_answers` | Write | New-answer records |
| This app | `practice_generation_jobs` | Schema only | No worker. Generation is the HTTP request. |
| Disk | `data/learners/<id>.json` | Write | Visible thread, archive, mode, beat index, outcomes |

### Learner file

`lib/store.ts` reads and writes `data/learners`. `openLearner` creates the file, migrates older mission-shaped progress into the three-mode shape, and optionally prepends an opener. Each turn pushes assistant bubbles onto `visible`, updates `progress`, and appends a one-line log. The view returned to the browser is `learnerView`: messages, chips, practice or assessment header, word bank, sentence frame, and a dev snapshot of the last turn.

Progress fields that matter at runtime:

| Field | Role |
|---|---|
| `mode` | `friend`, `practice`, or `assessment` |
| `practice` | Lesson id, beat index, attempts, outcomes, phase (`story` or `friend-bridge`), turns left, alt-line flag, coach-tip flag, `sceneWordGate`, `sceneWordCardsSeen` |
| `assessment` | Lesson id, task index, attempts, per-task pass/fail |
| `lessons[id].practisedAt` | Set when the friend bridge ends |
| `lessons[id].paused` | Saved focus when the learner ends practice early |
| `lessons[id].assessmentByTarget` | Latest assessment results |
| `recentPraise` / `recentCharacterReactions` | Last few lines, so the model does not repeat them |

### Catalogue

JSON packs under `content/lessons/` load once and must pass `validateLessonPack`. Files named `lesson-plan-seed*` are the plan, not packs. Mongo `live` and `reviewed` packs are adapted by `adaptMongoPack` and merged by lesson id, refreshing at most every 30 seconds. `ensureMongoLesson` pulls a single key into that map right after generation so the next chat turn can see it.

### Environment

| Variable | Role |
|---|---|
| `MONGODB_URI` | Shared with Langify. This app writes only `practice_*`. |
| `DEV_LANGIFY_USER_ID` | Dev Langify user. Legacy name: `DEV_USER_PROGRESS_ID`. |
| `ANTHROPIC_API_KEY` / `CLAUDE_MODEL` | Spec, pack, and reviewer calls |
| `ALLOW_TEST_LESSONS` | Include `testOnly` JSON packs outside the normal live set |
| `PRACTICE_LESSON_REGENERATE` | Clear spec and pack and regenerate |

---

## File map

| Path | Role |
|---|---|
| `app/page.tsx` | Home: friend, practice, assessment |
| `app/lessons/page.tsx` | Seed list, generate-on-click |
| `app/lessons/[lessonKey]/page.tsx` | Play one lesson, voice or text |
| `app/chat/page.tsx` | Friend and assessment chat |
| `app/api/chat/route.ts` | Turn entry: code path or streamed model |
| `app/api/learner/route.ts` | Load, reset, or set level |
| `app/api/lessons/plan/route.ts` | Ordered list for the learner |
| `app/api/lessons/[lessonKey]/generate/route.ts` | Run the pack pipeline |
| `lib/turn.ts` | Practice, bridge, and assessment state machine |
| `lib/grade.ts` | Exact, anticipated, accent, spelling, slots, script |
| `lib/friendPrompt.ts` | Prompt 5 and R1 / R2 / R3 |
| `lib/friendParse.ts` | Tags, verdict line, drop bad reactions |
| `lib/messages.ts` | Intro, beat order, closing, farewell, praise |
| `lib/lessons/plan.ts` | Seed overlay and list status |
| `lib/generation/runPipeline.ts` | Spec, pack, one regen, reviewer |
