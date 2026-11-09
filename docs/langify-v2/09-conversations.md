# 09 · Conversations (the app's main selling point)

Status: plan, 2026-11-03. Author: Omar + Claude. Implementation: Cursor.

Read first: `AGENTS.md`, `00-decisions.md` (§8, §9, §10), `01-architecture.md`, `07-build-plan.md` Phase 6 and its add-on. Where this document disagrees with `00` §9 or Phase 6 about the practice conversation, **this document wins**, and task 0 below writes the changes into `00`.

No code in this document by design. Every file, field and rule is described in prose; Cursor writes the code.

---

## 1. Why this exists

Conversation is the product's selling point. ChatGPT voice is weak outside English, uses Brazilian Portuguese, ignores the learner's level, and cannot help in Egyptian Arabic without breaking the conversation. Our conversation:

- speaks pt-PT at the learner's level, enforced by code;
- **teaches** before it asks (A0–A1 learners cannot be "practised" on words they never saw);
- keeps an Egyptian coach on a side channel, so an Arabic question never derails the Portuguese conversation;
- never ends in a dead end, never loses its place, and resumes exactly where the learner left;
- stays fast: the per-turn prompt has a **fixed size** and replies stream.

Earlier attempts failed for three reasons, and this design removes each one:

1. The model was asked to plan, remember a goal list, track progress and talk, all from the chat history. The list drifted out of context. → Code owns all state; the model only talks.
2. Checks and rules were written into the prompt, and the full history was sent every turn, so the prompt grew and the conversation got lost. → Checks run in code on the output; the prompt is a constant-size window.
3. Goals were topics ("learn left/right"), not tasks, and the learner was asked to produce words nobody had taught. → Each word climbs a teach → hear → pick → say ladder, three words at a time.

---

## 2. Three modules, one engine

| Module | What it is | Pre-generated | Live |
|---|---|---|---|
| **A. Lesson conversation** | One guided conversation per lesson that teaches and then reviews that lesson's items through a story scene | The conversation pack (scene, groups, word cards, coach lines, question bank, mistake reactions, recap, encouragement extras, cached audio) | Ordering of questions (model picks from code's candidates) and every character reaction |
| **B. Topics list** | The entry to module A, grouped by topic instead of by day, with a review status per topic | Topic grouping and titles | Status per topic from `v2_item_state` |
| **C. Free chat** | Open conversation that follows the learner, with light guidance | Angle bank per free topic (generated once, cached) | Everything the character says |

Shared by all three (the engine): the session document, the Arabic side channel and coach, code grading by accepted forms, the item ladder, the encouragement bank, the constant-size prompt, streaming, TTS, post-checks, and resume.

The legacy `/chat` (Friend, Assessment, friend-bridge) and the beat-based `/practice/[day]` stay untouched until cut-over (task 9), then are removed.

---

## 3. The item ladder (core concept)

Every target item in a conversation sits on one rung. The rung is stored per session and mirrored to progress through `/api/v2/answers`.

| Rung | Meaning | How the item gets there | Progress effect |
|---|---|---|---|
| 📖 taught | The coach introduced it with a card | Code shows the item card (image or arrow, `say` transliteration, audio) and the pack's coach line in the "we say…" style | none |
| 🔈 heard | The character used it in context | The character's line contained it and the scene visual highlighted it | heard |
| 👆 picked | The learner chose it when it was offered | Answer to a choice question whose options include it | understood |
| 🗣 said | The learner produced it with no option offered | Answer to an open question that does not contain it | said |

Rules:

- Items are taught in **groups of 3** (the pack defines groups; max 4). A new group starts only when every item of the current group is at 👆 or higher, and the previous groups' items keep being recycled.
- An item reaches 🗣 only from an open question. 🗣 reached after a coach hint or choices counts as **assisted** and is recorded as understood, not said; it becomes tomorrow's card.
- What a learner at A1 must produce is **one word or a 2–3 word fixed chunk** (e.g. "Vira à direita"), never a full sentence, unless the item itself is a sentence.
- On replay (review), each item starts at the rung matching its `v2_item_state` level: known-said items go straight to open questions with no card; known-understood items start at 👆.

---

## 4. Module A · Lesson conversation

### 4.1 The conversation pack

A new pack kind produced by the existing Phase 3 job DAG (do not build a second pipeline). It runs after the lesson is published, like the current practice packs. Store in a new collection `v2_convo_packs`, one document per language × day, versioned like lessons.

Pack contents:

- **Scene:** the speaking character (from `content/v2/characters.json`, chosen by place like images), the place, why they are talking (a real information gap: the character needs something only the learner can give, or the reverse), and the **scene visual**:
  - `map` for directions-type lessons: nodes (metro, street, traffic light, corner, café, home…), the correct route as an ordered list of steps, and which item each step uses. Code renders it and knows every correct answer from it.
  - `scene_card` for everything else: the lesson's existing story scene image plus tappable hotspots tied to item ids.
- **Groups:** the lesson's core items split into ordered groups of 3 (places/nouns first, then actions/directions, then relations), plus up to 2 recycled known items per group.
- **Per item:**
  - card data comes from the lesson's items (do not duplicate: reference by item id; `say`, audio and image already exist);
  - `coach_intro_eg`: one line, "we say" style ("عشان نقول يمين بنقول direita");
  - `memory_trick_eg`: one short Egyptian mnemonic (optional, used on the second miss);
  - **choice questions (👆):** 1–2 character lines in pt-PT that contain the item among 2–3 options (e.g. "Direita ou esquerda?"), each with its option ids;
  - **open questions (🗣):** 1–2 character lines that require the item without containing it (e.g. "E agora?" with the map arrow showing left), each with the scene state it needs (which map step, which hotspot);
  - **accepted forms:** built by code from the item (with and without article/preposition, accentless, formal and informal imperative such as vire/vira, gender variants); the model may add synonyms, code validates them;
  - **common mistakes:** up to 2 (e.g. picking direita when the map shows left, Sou cansado for Estou cansado), each with an in-story consequence for the reaction prompt ("she walks the wrong way and sees the river") and a one-line coach note.
- **Recap:** a short ordered list of step questions that, answered with the visual hidden, require every item again (e.g. "Primeiro? / E depois? / E no semáforo? / E na esquina?"). Framed inside the story (her brother is coming tomorrow; explain the way).
- **Opening line** and **closing line** of the character, and a **bridge line** that hands over to free chat on the same topic.
- **Help ladder lines per open question:** step 1 a simpler re-ask by the character; step 2 a coach hint giving the start of the answer; step 3 choices (built by code from the item's choice question).

Generation jobs (new job kinds in the same DAG and admin):

1. `convo_outline`: scene, character, information gap, visual type, groups, recap shape.
2. `convo_items`: one job per group, writing coach intros, tricks, questions, mistakes.
3. `critic` and `lang_check` exactly as for lessons (patches only).
4. `assemble`: code builds accepted forms, map/hotspot wiring, help-ladder choices, and ids; warms audio for every fixed line (opening, all questions, re-asks, recap, closing) with the character's fixed voice and the coach lines with the Egyptian voice.

Code checks (fail the job → one retry → drop the offending question and warn; the pack ships if every item still has ≥1 choice and ≥1 open question):

- every core item has a coach intro, ≥1 choice question, ≥1 open question, and appears in the recap;
- choice questions contain the item and only taught or known items as options;
- open questions do **not** contain the item;
- every character line: pt-PT only (Brazilian list check: você as default address, ônibus, trem, banheiro, etc.), at most 8 words at phase 1, at most 2 unknown words and each glossed;
- every map-dependent open question references an existing step; the route uses only items from the pack;
- coach lines are Egyptian Arabic with the Portuguese wrapped as tl segments (the existing rt rules).

Reference pack: **day 33, "Primeira Viagem a Portugal"** (directions: estação, rua, farmácia, à esquerda, à direita, É perto?, É longe, Onde fica…). Hand-authored at `content/v2/convo/pt-PT.day-33.json`; day 34 is «Vire à esquerda». It is the template for the prompt examples.

### 4.2 One turn, step by step

1. **Learner sends** text or voice (STT through the existing `/api/stt`). "مش قادر أتكلم دلوقتي" keeps working: voice switches to typing and counts for writing only.
2. **Side channel first, in code:** if the message is Arabic, classify it before anything else (section 6). Arabic never enters the character's history.
3. **Grade in code** (`lib/v2/answers` match/normalize/knownNearMiss): against the current question's accepted forms, the map state, and the known near-misses. Result: correct, near_miss (right word, wrong form), wrong (a different taught item, or a listed mistake), unclear.
   - No grader call is in the path. If code says unclear, the turn continues with the event "answer unclear" and the character reacts naturally ("Hmm, como?"). The Haiku grader (Phase 6) may run **after** the reply, asynchronously, only to log errors; it never blocks or changes the reply.
4. **Update state in code:** item rung, attempts on this question, help-ladder step, group gating, streaks.
5. **Coach bank message, immediately, no model:** if the moment calls for it (section 7), code picks the line and sends it to the client at once.
6. **Code picks 2–3 candidate questions** from the pack (section 4.3), or, after a miss, the next help-ladder step for the same question.
7. **One streamed model call** (section 5) writes the character's reaction and chooses one candidate. The chosen question id comes first in the stream as a short tag; code strips it and immediately starts fetching that question's cached audio.
8. **Post-checks on the reaction** (section 5.4). Then code appends the chosen question line with its cached audio.
9. **Persist:** session document (rungs, pointers, last 3 exchanges, pending question), then progress through `/api/v2/answers` (answer_id idempotency, implicit-review cap) as Phase 4/6 define.

After a wrong answer the character waits on the same question (help ladder); she never moves on until the step is resolved or the ladder ends (step 4: coach gives the answer, learner repeats, item recorded assisted, conversation continues).

### 4.3 Candidate selection (code)

Eligible questions are those whose item's next rung matches the question type (choice for 📖/🔈 items, open for 👆 items), in the current or earlier groups, whose scene state is consistent with where the story is (the map position), and that were not asked in the last 2 turns. Ranking: first an item from the current group that is behind, then a recycled weak item, then anything else. Pass the top 3 with ids. When the current group is complete, the next group's coach intro and cards are shown by code (no model) before the next turn. When all items reach 🗣 (or assisted), code moves to the recap; after the recap, the closing line, the result card and the bridge to free chat.

The model chooses among candidates so the order feels natural; it can never pick outside them, and an unknown id falls back to the first candidate.

### 4.4 End of a lesson conversation

- Result card: items at 🗣 ("بتقولها"), items assisted or at 👆 ("بتفهمها، هتيجي كارت بكرة"), extra words heard, counts "بتفهم +N · بتقول +M".
- The conversation does **not** close: the bridge line continues in free chat (module C) on the same topic, with the lesson's items as suggested words.

---

## 5. The prompt contract (most important rule)

### 5.1 Fixed layout, static first

Every turn of every module sends the same parts in the same order, so prompt caching works (Anthropic prompt caching, or prefix caching on vLLM for self-hosted models):

| # | Part | Changes | Budget (tokens) |
|---|---|---|---|
| 1 | Character and voice rules: who you are, pt-PT, informal or formal address per character, short A1 lines, react to what the learner said, never explain grammar, never translate, never ask the question yourself in Module A | never (cached) | ~400 |
| 2 | Scene: place, situation, information gap, current visual state summary in two lines | once per session (cached) | ~150 |
| 3 | Event line: one sentence produced by code (e.g. "answer correct, after two misses, first time without help" or "answer wrong: picked direita, map shows left; consequence: she walks toward the river") | every turn | ~30 |
| 4 | Candidates: 2–3 question ids with their text (Module A) or the current angle plus the next angle (Module C) | every turn | ~60 |
| 5 | Last 3 exchanges, verbatim, Portuguese only | every turn, fixed size | ~150 |
| 6 | The learner's latest answer | every turn | ~20 |

Total ≈ 800 tokens, of which ≈ 550 cached. **Turn 3 and turn 50 must cost the same.**

Module C adds, inside part 2 or 4 (still capped): up to 15 suggested words and up to 5 fact lines.

### 5.2 Never in the prompt

The full pack or item list; the full history; the known-words list; accepted forms or grading rules; the encouragement bank or tricks; Brazilian or length rules beyond one line; any JSON schema; the coach's text; any Arabic the learner wrote.

### 5.3 Output

- Plain streamed text, no JSON, no structured output.
- Module A: first a short tag with the chosen candidate id, then the reaction: one sentence, at most 8 words in phase 1, pt-PT, reacting to the learner (including the story consequence of a mistake, or a natural recast of a near miss), and **no question** (code appends the question).
- Module C: the reply, at most 2 short sentences, ending with a question or an invitation.
- Small max-tokens cap (speed depends mostly on output length).

### 5.4 Post-checks (code, on the output)

- Brazilian or English leak, or longer than the cap → **one** regeneration whose extra instruction names the exact problem ("you used você; say it without the pronoun"). If it fails again, Module A drops the reaction and shows only the question; Module C uses the next angle question from the bank.
- Unknown words in an otherwise valid line → no regeneration: they are shown underlined with "معناها؟".
- Module A: a question inside the reaction → strip it. Module C: no question at the end → append the next angle question from the bank (cached, no model call).

### 5.5 Guard test and logging

- Log per turn: input tokens, cached tokens, output tokens, time to first token, total time. Show them in the existing dev panel.
- A test script plays a 40-turn conversation automatically (scripted learner answers, mixed correct/wrong/Arabic/off-topic) and **fails if input tokens at turn 40 exceed turn 3 by more than 10%**. Run it in CI. This protects the budget from anyone (including Cursor) adding text to the prompt.

---

## 6. The Arabic side channel (all modules)

Detection in code (the existing `arabicOnly` helper plus a mixed-script check). Arabic text is never added to the character's history. Classification, cheapest first:

| Type | Example | Handled by |
|---|---|---|
| Answer in Arabic | "يمين"، "كنت في الشغل" | Code: coach line "بالبرتغالي بنقولها **direita**، جرّب" with the item from the current question; the character waits. Not counted as an error. |
| Language question | "يعني إيه esquina؟"، "ازاي أقول مع رز؟" | A small separate coach call (Egyptian, 1–2 lines, then "جرّب تقولها"). If the question is about a pack item, code answers from the item card with no model call and highlights it on the visual. |
| Topic request (Module C) | "عايز أتعلم الاتجاهات" | Code matches against the topics list: if found, show "افتح محادثة الاتجاهات"; if not, log to `v2_topic_requests` and the coach says it's coming. |
| Other | chit-chat in Arabic | The coach offers the Portuguese version and invites the learner to say it. |

The coach call has its own small fixed prompt (Egyptian coach persona, the learner's question, the current item ids). It never sees the character prompt and never changes the conversation state except to log "asked about X" as a fact in Module C.

---

## 7. Encouragement and gentle correction

Two voices:

- **Character (pt-PT, inside the story):** reacts after every answer. The best praise is a consequence ("Consegui! Obrigada!"); the best correction is a consequence plus a natural recast ("Direita? Hmm… vejo o rio 😅"). Driven only by the event line.
- **Coach (Egyptian, side channel, amber/yellow note):** appears only at moments chosen by code, from a bank. No model call.

Coach bank (`lib/v2/convo/encouragement`, a static content file with 6–8 variants per moment and slots like {item}; never repeat any of the last 3 used):

- correct moments: first 🗣 of an item ("قلت {item} لوحدك من غير أي مساعدة"); success after struggling; 3 correct in a row; group finished; returned after a break; conversation finished (compare to the start);
- wrong moments, escalating: first miss, a light hint pointing at the visual; second miss, reassurance ("عادي، الكلمتين دول بيلخبطوا أي حد") plus the item's memory trick; third miss, "نختار سوا" and choices; fourth, the coach gives it, the learner repeats, and "هنرجعلها بكرة";
- special: STT unclear → blame the microphone ("ما سمعتكش كويس 🎧"); near miss in gender/form → counts correct, coach comments only if repeated; Arabic answer → never treated as wrong.

Rules: specific, about effort and progress, adult tone (a friend, not a kindergarten teacher), never red, never the word "غلط", one correction at a time.

---

## 8. Module B · Topics list

- A screen listing conversation topics grouped by theme (directions, café, neighbours, landlord, doctor…), each mapped to one or more lessons' conversation packs. Titles: pt-PT title + Arabic subtitle.
- A topic unlocks when its lesson is completed.
- Status per topic from `v2_item_state` over its items: 🟢 solid, 🟡 needs review (any item due or weak), ⚪ not tried.
- The home screen suggests one 🟡 topic ("الاتجاهات محتاجة مراجعة، تتكلم مع Inês؟").
- Opening a topic starts or resumes its lesson conversation in review mode (rungs from progress, section 3).

---

## 9. Module C · Free chat (follows the flow, lightly guided)

- **Start:** the learner picks a free topic (food, work, home, your day, Egypt, the weekend…) or just starts talking; the app may suggest one from recent lessons. The character is one of the cast (default Inês; Nour for "tell me your day" in the evening).
- **Angle bank:** each free topic has 8–12 angles (sub-questions), generated once per language and cached in `v2_topic_angles`. Code holds the current angle and chooses the next one, preferring angles likely to need the learner's weak items.
- **Light guidance:** up to 15 suggested words per session chosen by code from weak and recently learned items; the prompt says "prefer these words". Unknown words in replies are allowed and glossed (5.4).
- **No dead ends:** every reply ends with a question or invitation (5.4). When angles run out, code bridges to a related topic with a bank bridge line.
- **Off-topic:** the grader-free signal is cheap: code checks whether the learner's message shares any content word with the current topic's word set; if not, the event line says "learner went off topic: {short gist}". First time: the character answers in one short sentence and bridges back ("Que interessante! Mas diga-me…" + current angle). Second consecutive time: code switches to the nearest catalogue topic (respecting the learner's interest). Non-learning requests (write code, translate an email, news in English): the coach declines in Egyptian and offers to talk about it in Portuguese.
- **Facts:** after each angle closes, code extracts up to 1 fact from items the learner said correctly ("said he cooks rice and chicken"); max 5 kept per session, oldest dropped. No model-written summaries.
- **Resume:** the session stores topic, angle, facts, last 3 exchanges and the pending question. On return, code builds the reopening line from a template plus the pending question ("Olá outra vez! Estávamos a falar de comida… então, sabe cozinhar?") with no model call.
- **Learning request mid-chat:** handled by the side channel (section 6). The free chat is paused, the lesson conversation runs, and afterwards code returns to the pending free-chat question.
- Optional, later: per-character memory across sessions (`v2_relationships`, user × character, max 10 short facts). Not in the first version.

---

## 10. Data and code layout

New code only under `lib/v2/convo/…`, `app/api/v2/convo/…`, `app/(v2)/…`, `components/v2/convo/…`. Reuse, do not duplicate:

- job DAG, admin, handoffs, critic, lang_check, `say` computation, rt building, audio warming (`lib/v2/generation`);
- matching and normalization, near misses, `arabicOnly` (`lib/v2/answers`);
- progress and SRS, weak items (`lib/v2/progress`); all progress writes still go only through `POST /api/v2/answers`;
- the grader module (`lib/v2/grader`), async and optional;
- cast, voices and places (`content/v2/characters.json`), TTS and STT routes.

New collections (prefix `v2_`):

- `v2_convo_packs`: the pack per language × day (section 4.1).
- `v2_convo_sessions`: one per user × conversation: module (lesson/free), pack or topic id, rungs per item, help-ladder state, current group, candidate history, last 3 exchanges, pending question, facts, suggested words, status, timestamps. **Chosen:** a dedicated `v2_convo_sessions` collection (not an extension of practice-shaped `v2_sessions`); one document per conversation.
- `v2_topic_angles`: angle bank per language × free topic.
- `v2_topic_requests`: learner topic requests that had no match (content signal for Omar).

API (thin routes; logic in `lib/v2/convo`):

- start or resume a conversation (returns the opening or reopening bubbles, the visual, the first cards);
- one turn (streamed: coach bank message first if any, then the tag-stripped reaction, then the appended question with its audio key);
- topics list with statuses;
- free topics list.

UI (Module A Learn + Module C free: **Calm Kit** — global v2 theme; `.v2-free-talk` is a layout hook. See `05`, `design/calm-kit/`, and Learn screens in `design/onde-fica/`, 390px):

- character bubbles: pt-PT, `say` line under it, "معناها؟" hidden translation, play button;
- learner bubbles deep teal; coach as NoteCard (amber/yellow), never red;
- item card component (image or arrow, `say`, audio) shown inline when a group starts;
- scene visual pinned at the top: the map (route animates; hidden during the recap) or the scene card with hotspots;
- choice chips under the input for 👆 questions and help step 3;
- survival buttons always available: Pode repetir? · Mais devagar · Não percebi (they count as "used", replay the line slower or simpler with no model call);
- progress dots per group; the result card; the topics list screen; the free topics picker.

---

## 11. Build order

Each step ends in something Omar can play. Do them in order. **For Cursor, use the small tasks in `09a-conversations-tasks.md`**, not these steps directly.

0. **Decisions.** Add a section "§9b Conversations" to `00-decisions.md` summarising sections 2, 3, 5 and 7 of this document, and mark the Phase 6 beat-based practice as superseded for new work (kept until cut-over). Add this doc to `docs/langify-v2/README.md`.
1. **Engine skeleton, hand-written pack.** Write the day 18 pack by hand as a JSON content file (no generation yet). Build the session document, code grading, ladder, candidate selection, the streamed turn with the fixed prompt, post-checks, the coach bank, and the conversation screen with the map. Done when the day 18 conversation plays end to end with streaming, the map, the help ladder and the result card.
2. **Prompt budget guard.** Token/latency logging in the dev panel and the 40-turn CI test. Done when the test passes and fails on purpose if a line is added to the prompt.
3. **Arabic side channel.** The three classifications, the coach call, and item-card answers. Done when "يعني إيه esquina؟" mid-conversation gets a coach note, the character waits, and its history contains no Arabic.
4. **Resume.** Leave mid-conversation, reopen hours later, get the template reopening line with the pending question. Done when it works after a server restart.
5. **Pack generation.** The new job kinds, checks and audio warming in the existing DAG and admin. Done when day 18 regenerates from the pipeline and plays as well as the hand-written one, and day 3 and day 22 generate and play.
6. **Topics list and review mode.** Statuses from progress; replay starts each item at its rung. Done when replaying day 18 after finishing it skips the cards and starts at open questions.
7. **Free chat.** Free topics, angle bank, suggested words, no-dead-end rule, off-topic handling, facts, resume, topic requests, and the bridge from a lesson conversation's end. Done when a 30-turn free chat stays on topic, never ends without a question, and survives an English off-topic message and an Arabic topic request.
8. **Polish.** Survival buttons, encouragement variety, adult tone review, speed pass (target: first audio within ~2.5 s of sending).
9. **Cut-over.** Remove the legacy `/chat` Friend/Assessment, the friend-bridge, the JSON learner file store, and the beat-based practice route once modules A–C cover them.

Prompt to give Cursor for each step: "Read docs/langify-v2/09-conversations.md (whole), AGENTS.md and 00-decisions.md. Implement step N of section 11 only. Follow section 5 strictly: nothing may be added to the per-turn prompt beyond the six parts in 5.1. Reuse the modules listed in section 10 instead of writing new ones. Stop when the step's 'Done when' is met and list what you changed."

---

## 12. Out of scope (for now)

- Real-time voice-to-voice (WebSocket). Turn-based STT → stream → TTS first; revisit only if latency numbers demand it.
- Model-generated plans for topics that don't exist (on-the-fly lesson creation). Missing topics are logged instead.
- Cross-session character memory (`v2_relationships`).
- Reading and writing artifacts inside conversations (receipts, signs). The four-skill mix stays in the day's questions.
