# 12 · Custom decks (learner-generated flashcards)

Status: plan, 2026-11-12, images added 2026-11-13. Author: Omar + Claude. Implementation: Cursor.

Read first: `AGENTS.md`, `00-decisions.md` (§2, §5, §10), `10-auth.md` (A5 deletion), `11-profile-progress.md` (§5 daily deck, §7.2 streak). Where this document disagrees with `00` §5 about decks, with `00` §10 about images for custom decks, or with `11` about the daily deck or the streak, **this document wins**, and task C0 writes the changes into `00`.

No code in this document by design.

---

## 1. The feature in one paragraph

In the flashcards module, a learner types a topic in a text box ("كلمات الطقس", "المطبخ", "حاجات الحمام"). A cheap Claude model generates 20–30 useful pt-PT words for it. Code checks them, the learner previews them, and the deck is saved. Saved decks appear for every learner in a separate list, **"من المتعلمين"**, apart from the decks the app owns (the situation decks built from lessons, and later official themed decks). Popular decks get images from a cheap image model; an admin can generate them for any deck at any time. An admin can also promote a learner deck into an official app deck. Generation is free now and will be limited later.

---

## 2. Decisions

### 2.1 Words are shared items, not copies

- Every generated word becomes a **custom item** in a shared pool, `v2_custom_items`, one document per language × normalised lemma × part of speech (id like `ugc.pt-PT.chuva.noun`). The same word in two decks is **one item**, so a learner who has it in two decks reviews it once.
- **Before creating a custom item, code checks the official item banks.** If the word already exists as a lesson item (`food.cheese`, `weather.rain`), the deck references that official item and no custom item is made. The learner's card SRS for it is the same one the lessons use.
- Card SRS stays where it is: `v2_item_state`, one document per user × item. Custom items just have `source: custom`. Nothing new for progress storage.
- Because of this, **promotion (§6) never migrates learner progress**: an official deck points at the same item ids.

### 2.2 What a custom item holds

- `tl` (with the article for nouns: "a chuva", "o frigorífico"), `tl_f` only when the form changes by gender, `pos` (noun | verb | adjective | phrase), `gender` for nouns.
- `ar` (simple MSA, same rule as `00` §2) and an optional one-line `eg_note` in Egyptian (e.g. "في البرازيل بيقولوا geladeira، هنا frigorífico").
- One short `example_tl` (at most 8 words, pt-PT) with its `example_ar`.
- `concept_en`: a short English slug for the concept (`rain`, `fridge`, `to_cook`). It's used only for the global image key (§2.10), never shown.
- Code adds `say` (the fixed letter table from `00` §2). Audio is lazy through `/api/tts`, like story lines.
- `image = { key, url }`, filled when the image is ready (§2.10). A missing `url` shows the calm ImageSlot placeholder.
- **Verbs:** conjugated forms are never written by the model (`00` §2). A custom verb card shows the infinitive only. The conjugation poster on the back appears only if the verb exists in the verified conjugation table.

### 2.3 Generation

- **Model:** a cheap Claude model (Haiku), chosen by env (`CUSTOM_DECK_MODEL`), one non-streamed JSON call, server only. Timeout 20 s, one retry on a parse failure.
- **Input:** the learner's topic (trimmed, max 60 characters), the target language, the learner's phase (A1 / A2), and the instruction: the most useful everyday words for someone living in Portugal, mostly nouns with their article, some verbs and adjectives, at most 3 short fixed phrases.
- **Output:** `topic_ok` (true | false, with a short reason), `title_tl`, `title_ar`, `tags` (2–4 short English slugs, e.g. `weather`, `home`), and 20–30 words in the shape of §2.2.
- **The model also judges the topic.** `topic_ok: false` for sexual content, insults, hate, violence, drugs, politics or a topic about a real person. The learner sees one calm Egyptian line ("مش هنقدر نعمل ديك للموضوع ده، جرّب موضوع تاني") and nothing is saved. A short code blocklist runs on the topic before the call, so obvious cases cost nothing.

### 2.4 Checks (code, on the output)

Per word, a failing word is **dropped**, never fixed by hand:

- pt-PT only (the existing Brazilian list: geladeira, ônibus, trem, banheiro, café da manhã…);
- no "/" inside `tl` (use `tl_f`);
- nouns have an article and a gender that agree;
- `ar` is Arabic and not empty; `eg_note` passes the rt rules;
- the example contains the word, is at most 8 words, and passes the same pt-PT check;
- `concept_en` is a lowercase ASCII slug;
- no duplicates inside the deck (by normalised lemma);
- reuse `lang_check` from the lesson pipeline (patches only).

After the checks:

- **20 or more words left:** the deck goes to preview.
- **15–19 left:** the deck goes to preview as is (it's still useful).
- **Fewer than 15:** one more call asking only for the missing count, with the dropped words named so they aren't repeated. If it's still under 15, generation fails with a calm message and doesn't count against the learner's limit.

### 2.5 The learner flow

1. **Flashcards → "اعمل ديك".** A text box with a placeholder ("مثلاً: الطقس، المطبخ، عند الدكتور") and 4–6 suggestion chips.
2. **Look for an existing deck first (code, no model).** The topic is matched against the titles and tags of public decks. If one matches: "فيه ديك جاهز: الطقس · ٢٤ كلمة", with "ضيفه" and "اعمل واحد جديد برضه". This saves cost and keeps the public list from filling with ten weather decks.
3. **Generating screen** with a calm progress state (a few seconds).
4. **Preview:** the words as a list (tl, say, meaning, play button). The learner can **remove** words, but can't edit their text (edited text would skip the checks). At least 15 must remain to save.
5. **Save → the deck is in "ديكاتي"** and published to "من المتعلمين" (§2.7).

### 2.6 Reviewing custom decks

- **Not mixed into the daily deck.** The daily 15 (`00` §5, `11` §5) stays curriculum-only, so the core path never gets diluted.
- Each custom deck has its own session: "راجع الديك ده". It shows due cards from that deck first, then **at most 10 new cards a day per deck**, so a new deck of 30 isn't dumped on the learner at once.
- Same card screen, same buttons (صعب / متوسط / سهل / عارفها), same retrieval-first front (`00` §5). Ratings go through `POST /api/v2/answers`, like every other card.
- **Graduation for custom-only items:** interval ≥ 21 days. The "used correctly in 2 situations" condition (`00` §5) is dropped for them, because the lessons never use them. Official items keep the full rule even when reviewed from a custom deck.
- **Streak (`11` §7.2):** finishing a custom deck session (at least 10 cards rated) counts as a real piece of learning for the day.
- Custom items never feed weak spots by problem (`11` §4); their misses only affect their own cards.
- **The curriculum ignores custom items.** Lesson generation, the question planner, distractors and the known-items list don't read them. A learner knowing "chuva" from a custom deck doesn't change any lesson.

### 2.7 The public list ("من المتعلمين")

- Every saved deck is public. There is no private switch in v1.
- Deck listing tabs become: **المواقف** (situation decks from lessons) · **الأفعال** · **مواضيع** (official themed decks, §6) · **من المتعلمين**.
- "من المتعلمين" sorts by popularity (how many learners added it), with a "الجديد" filter and a search box over titles and tags.
- A deck tile shows `title_ar`, `title_tl`, the word count and "ضافوه N". **The creator's name is not shown** (privacy, and it avoids one more thing to moderate).
- **"ضيفه"** adds the deck to the learner's "ديكاتي"; its cards enter their SRS through the same per-deck session. A learner can remove a deck they added; their item states stay (they're per item, not per deck).
- **Report:** each public deck has "بلّغ عن الديك ده" (wrong word, Brazilian, offensive, wrong picture). A deck with 3 reports from different learners is hidden from the public list automatically until an admin looks at it. Learners who already added it keep it.
- **Admin can hide or delete** any public deck, and remove single words from it.

### 2.8 Limits

- **Now:** a per-user daily cap from env (`CUSTOM_DECK_DAILY_LIMIT`, start at 3) and a global daily cap (`CUSTOM_DECK_GLOBAL_DAILY_LIMIT`) as a cost guard. A failed generation, a rejected topic and "ضيفه" on an existing deck don't count.
- **Later:** the limit will come from the user's plan. Code reads it through one function (`customDeckQuota(user)`), so plans change only that function, not the routes.
- Remaining generations are shown quietly under the text box ("باقيلك ٢ النهارده"), never as a warning.
- Tokens, cost and latency per generation are logged and visible in admin.
- Image cost has its own guard (§2.10). Learners never trigger images directly, so images never count against the learner's limit.

### 2.9 Account deletion (A5)

A public deck is shared content, not personal data. When its creator deletes their account, the deck **stays** and its `created_by` is cleared. Their "ديكاتي" list, their added-deck links and their item states are deleted like every other user-keyed document. The A5 deletion list gets the user-keyed collections from §3, and `v2_custom_decks` gets a "clear creator" step instead of a delete. Images are shared content and are never deleted with an account.

### 2.10 Images (decided 2026-11-13)

- **Model:** a cheap image model from env (`CUSTOM_DECK_IMAGE_MODEL`, start with GPT Image 2) at **low quality** (`CUSTOM_DECK_IMAGE_QUALITY=low`), 1:1, through the edits endpoint with the **style-anchor image** from `00` §10. This keeps the Warm Storybook look next to the lesson cards. The lesson pipeline keeps its own model and quality; this setting is for custom decks only.
- **Which words get an image:** nouns, verbs and adjectives. Phrases get none.
- **No recurring cast.** Custom images never use the nine characters or their reference sheets. A noun is the object in use in a generic place (a hand may appear); a verb or an adjective uses an anonymous adult. The generic-place rules of `00` §10 apply: no landmarks, no flags, no readable signage, no text in the image, and code appends the same `must_avoid` list.
- **Specs are built by code from a template**, with no extra model call: the object or action from `concept_en`, the meaning, the deck's topic as the setting, the style block. One template per part of speech.
- **Global keys, reused:** the key is `word.<concept_en>` (e.g. `word.rain`), the same key space as lesson word images. If a key is already ready (from a lesson or another deck), it's reused for free. Before any generation, code counts only the keys that are missing.
- **When images are made:**
  - **Automatically** when a deck's `added_count` reaches a threshold from env (`CUSTOM_DECK_IMAGE_THRESHOLD`, start at 5). A background job queues the missing keys. A deck that never gets popular never costs anything.
  - **By an admin, at any time,** for any deck, whatever its `added_count`: "ولّد الصور" on the deck in admin, showing the number of missing images and the estimated cost first. The admin can also regenerate a single word's image, edit its spec, approve a flagged one, or upload a replacement.
- **QA:** the same Haiku vision pass as `00` §10 (no text, clear subject, style), plus the meaning check ("does this image clearly show <meaning>?"). One automatic retry on failure; after that the image is flagged for the admin and the card keeps its placeholder.
- **Storage:** the existing pipeline: Cloudinary folder `langify/v2/images`, `public_id` = the key, `v2_images` with status, cost and `used_by` (which now includes deck ids). When a key becomes ready, code writes `image = { key, url }` on the custom item, so every deck using it shows it at once.
- **Cost guard:** a global daily image cap from env (`CUSTOM_DECK_IMAGE_DAILY_LIMIT`). Automatic jobs stop at the cap and resume the next day. Admin-triggered generation shows the cap but may go past it after one confirmation. Cost per image and per day is logged in admin.
- **Reported pictures:** a "wrong picture" report flags that image in admin; three of them on the same key hide the image (placeholder) until the admin looks.
- **On promotion (§6)**, the admin may regenerate a deck's images with the lesson pipeline's model and quality. The key stays the same, so every deck using it gets the better picture.

---

## 3. Data

New collections (prefix `v2_`):

- `v2_custom_items`: the shared word pool (§2.1, §2.2), with `status` (custom | official), `concept_en`, `image`, `created_at`, the decks that use the item.
- `v2_custom_decks`: one per deck: language, `title_tl`, `title_ar`, `tags`, the ordered item ids (official or custom), `topic` as typed (admin only), `created_by` (nullable), `visibility` (public | hidden), `report_count`, `added_count`, `images_status` (none | queued | partial | ready), `status` (custom | promoted), `promoted_to` (official deck id), timestamps, generation cost.
- `v2_user_decks`: one per user × deck the learner owns or added, with added_at and the per-deck daily new-card counter. **User-keyed** (A5 list).
- `v2_deck_reports`: one per user × deck report, with a reason and an optional item id (for "wrong picture"). **User-keyed** (A5 list).
- `v2_custom_deck_jobs` (or the existing job runner with a new kind): status, attempts, cost, and the per-user daily count for the quota.
- `v2_official_decks`: official themed decks (§6): `title_tl`, `title_ar`, ordered item ids, `status` (draft | published), `source_deck` (the custom deck it came from, if any).
- `v2_images` (existing): `used_by` now also holds deck ids.

Indexes: unique on custom item key; unique on user × deck; text index on deck titles and tags; `added_count` for sorting.

---

## 4. API (thin routes, logic in `lib/v2/decks`)

All need a signed-in user; the user id comes from the session helper only.

- Find existing decks for a topic (no model).
- Generate a deck (quota check, topic blocklist, model call, checks) → returns the preview with a draft id.
- Save a draft (with the removed words) → creates the deck and adds it to "ديكاتي".
- List public decks (sort, filter, search, paging).
- Add / remove a deck to "ديكاتي" (adding may cross the image threshold and queue images).
- Start a deck review session (due first, then up to 10 new).
- Report a deck or one of its pictures.
- Admin: list reported and popular decks, hide / delete a deck, remove a word, generate or regenerate images (deck or single word), promote (§6).

---

## 5. UI (Calm Kit, RTL, 390px)

- "اعمل ديك" entry on the deck listing, under the "مراجعة النهارده" hero (the daily deck stays the first thing).
- The text box screen with suggestion chips and the quiet quota line.
- Generating state, preview list with remove buttons, save.
- "من المتعلمين" tab with search, sorting and deck tiles.
- Deck detail: the words with no Arabic meanings (same self-test rule as `00` §5), "ضيفه" or "راجع الديك ده", and the report link.
- Cards show the picture when `url` is ready, the ImageSlot placeholder otherwise. Nothing tells the learner images are "coming".
- No percentages, no backlog counts (`00` §5).

---

## 6. Admin promotion to an official deck

- **Admin → "ديكات المتعلمين":** the public decks sorted by `added_count`, with reports, image status, and a filter for decks not yet promoted.
- **"حوّله لديك رسمي"** creates a `v2_official_decks` document in `draft`, pointing at the **same item ids**, so learners who added the custom deck keep all their progress.
- In the draft, the admin can:
  - remove or reorder words, and add words from the official item banks or the custom pool;
  - edit a custom item's text (this is the one place a human edits generated text; it marks the item `reviewed`);
  - rename the deck;
  - regenerate the deck's images with the lesson pipeline's model and quality (§2.10).
- **Publish** makes the deck appear in "مواضيع" and marks its custom items `status: official` (their ids don't change). The source custom deck gets `status: promoted` and a small "بقى ديك رسمي" mark, and leaves the "من المتعلمين" list so the same deck isn't listed twice.
- Official decks follow the same review rules as custom decks (§2.6), not the curriculum's `introducedDay`.

---

## 7. Decided defaults (2026-11-12)

- Public by default, no private switch in v1.
- No native check before promoting a deck in v1.
- No automatic twins in other languages. The item pool is per language; a German weather deck is generated separately when needed (its images are reused through the global keys).

---

## 8. Tasks for Cursor

Same rules as `09a`, `10` and `11`: one task per session, in order, tests included, stop at "Done when". Prompt:

> Read docs/langify-v2/12-custom-decks.md (whole), AGENTS.md, 00-decisions.md, 10-auth.md and 11-profile-progress.md §5 and §7.2. Implement task **C-x only**. Do not start the next task. The user id always comes from the session helper. Only `/api/v2/answers` writes item state. Never write Portuguese or Arabic content yourself; it comes from the model or from Omar. Write the tests the task asks for. Stop when "Done when" is met and list the files you changed.

**C0 · Write the decisions**
- Do: add "§5b Custom decks" to `00-decisions.md` summarising §2 and §6 (images included); note the changes to `00` §5 (graduation for custom-only items, deck tabs), `00` §10 (custom-deck images: cheap model at low quality, no cast, popularity threshold, admin any time) and `11` §5 / §7.2 (not in the daily deck; a custom session counts for the streak); link this doc from the README.
- Done when: docs updated, nothing else changed.

**C1 · Collections, item pool and deletion list**
- Where: `lib/v2/decks`.
- Do: the models in §3 with their indexes; the custom item key normaliser (lowercase, accents kept, article stripped for the key); the lookup that returns an official item id when the word exists in a lesson item bank; add the user-keyed collections to the A5 list and the "clear creator" step for decks.
- Tests: the same word from two decks resolves to one item; a word that exists in a lesson resolves to the official id; the A5 deletion test passes and a deleted creator's public deck remains with no creator.
- Done when: tests pass.

**C2 · Generation and checks (no UI)**
- Where: `lib/v2/decks/generate`.
- Do: quota check, topic blocklist, the model call from env with the fixed prompt, parsing, the checks of §2.4, the top-up call when under 15, `say` added by code, cost and latency logged.
- Tests (stub model): a Brazilian word is dropped; a word with "/" is dropped; a noun with no article is dropped; a bad `concept_en` is dropped; duplicates are removed; 12 good words trigger exactly one top-up; `topic_ok: false` saves nothing and doesn't use quota; a parse failure retries once; a verb never gets conjugated forms.
- Done when: tests pass, and 5 real topics (weather, kitchen, bathroom, doctor, supermarket) produce decks Omar reviews.

**C3 · Find, generate, save routes**
- Do: the routes in §4 for find, generate and save, with the draft and the removed words; the per-user and global daily caps.
- Tests: the 4th generation in a day is refused with the quota error; "ضيفه" on an existing deck doesn't use quota; saving with fewer than 15 words is refused.
- Done when: tests pass.

**C4 · "اعمل ديك" screens**
- Do: text box with suggestion chips and the quota line, existing-deck suggestion, generating state, preview with remove, save (§2.5, §5).
- Done when: Omar types "الطقس" on his phone and ends with a saved deck in "ديكاتي".

**C5 · Deck review session**
- Do: per-deck session (due first, then up to 10 new a day per deck), the same card component (picture or placeholder), ratings through `/api/v2/answers`, the graduation rule for custom-only items, the streak count for a finished session.
- Tests: day 1 shows 10 new cards from a 25-word deck, day 2 shows the due ones then 10 more; a word in two decks is reviewed once; custom items never appear in the daily deck.
- Done when: tests pass.

**C6 · Public list, add, report**
- Do: the "من المتعلمين" tab with sorting, "الجديد" and search; deck detail; "ضيفه" and remove; report (deck or picture) with auto-hide at 3 reports from different learners.
- Tests: a reported deck disappears from the list after the 3rd report but stays for learners who added it; one learner reporting 3 times counts once.
- Done when: a second test account finds Omar's weather deck, adds it and reviews it.

**C7 · Admin moderation**
- Do: admin list of public decks (popular, reported, image status, not promoted), hide / unhide, delete, remove a word; generation cost per day in the admin view.
- Done when: Omar can hide a deck and it leaves the public list.

**C8 · Deck images**
- Where: `lib/v2/decks/images`, reusing the existing image pipeline (`v2_images`, Cloudinary upload, Haiku QA, admin image cards).
- Do: the §2.10 rules: code-built specs per part of speech, global `word.<concept_en>` keys with reuse, the cheap model and quality from env with the style anchor and no cast sheets, the automatic job when `added_count` crosses the threshold, the admin "ولّد الصور" button on any deck at any time (count and estimated cost first), single-word regenerate / edit spec / approve / upload, QA with one retry then flagged, `image` written on every custom item using the key, the global daily image cap, and the "wrong picture" report handling.
- Tests (stub image model): a key already ready is reused and costs nothing; phrases get no image; crossing the threshold queues only missing keys, once; a deck under the threshold queues nothing automatically but the admin action works; the daily cap stops automatic jobs; a QA failure retries once then flags; a ready key updates every deck that uses it.
- Done when: Omar presses "ولّد الصور" on his weather deck, sees the count and cost, and the cards show their pictures in the Warm Storybook style next to lesson cards.

**C9 · Promotion to official decks**
- Do: "حوّله لديك رسمي" → draft official deck on the same item ids; draft editing (remove, reorder, add from banks or pool, edit a custom item's text, rename, regenerate images with the lesson model); publish to "مواضيع"; mark items official and the source deck promoted.
- Tests: a learner who reviewed the custom deck keeps every item state after promotion; the promoted deck no longer appears in "من المتعلمين".
- Done when: Omar promotes the weather deck, publishes it, and it shows in "مواضيع" with his old progress intact.
