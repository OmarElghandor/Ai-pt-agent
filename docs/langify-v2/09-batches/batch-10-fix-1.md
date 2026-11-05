# Batch 10 · Fix 1 · Review of convo-impl @ 7caf675

Reviewed on 2026-11-05 against batches 9 and 10, plus a real run (open mode, the learner typed «عايز اعلم عن الاتجاهات» and the coach answered "Sobre onde?").

## What is right (keep)

- Modes, pickers, threads, summary, voice bar and metrics all exist and follow the plan's structure.
- The thread prompt has six labelled parts, the persona sits in the static part, and the cached-token metric is now honest.
- The AR translation line is parsed, help frames exist, and the side channel never pushes Arabic into the character's exchanges.

## What is wrong, and the fix

**E1 · Topic requests aren't detected (the screenshot bug).**
- **Cause:** `TOPIC_REQUEST_RE` (sideChannel/topicRequest.ts) only matches «عايز أتعلم» with hamza and ت. «عايز اعلم», «عاوز اتعلم», «علمني», «عايز أفهم», «عايز أعرف أقول…» all fall to `arabic_answer`.
- **Fix:** normalise Arabic first (the same normalizeAr: hamza forms, ة, ى, diacritics), then match a wider list:
  - عايز / عاوز / محتاج / نفسي + أتعلم / اتعلم / اعلم / أفهم / افهم / أعرف;
  - علمني / علّمني / فهمني;
  - «إزاي أقول» + a topic noun from the topics file.
- Tests: those 8 phrasings map to topic_request, and «عايز اعلم عن الاتجاهات» matches the directions topic.

**E2 · Coach output isn't validated.**
- Qwen returned bare Portuguese ("Sobre onde?") with no Egyptian, and it was shown.
- **Fix:**
  - The coach reply must contain Arabic script **and** at least one Portuguese segment that differs from the learner's text.
  - The suffix "— جرّب تقولها" is added by code, never trusted from the model.
  - On failure: one retry, then the bank fallback.
  - Add 3 full examples to `COACH_SIDE_SYSTEM`: «ازاي أقول مع رز؟», «يعني إيه esquina؟», «ساكن في أمادورا».
  - Put the coach model behind an env var (`V2_COACH_MODEL`), so a stronger model can be tried: coach calls are rare, so the cost is small.
- Tests: "Sobre onde?" fails validation and falls back; a valid reply passes.

**E3 · Open mode forgets its own frame.**
- The model's FRAME, HINT and CHIPS go to the client (`free_frame`) but aren't saved in the session.
- The server then rebuilds the frame from `suggested_words` (topic titles) for the side channel, the help button and resume. That's why the coach got "Quero falar de ___" with title chips.
- **Fix:** store the last frame in the session as `pending_frame` {tl, eg, chips}, both in open mode and in thread mode. The side channel, help and resume all read it.

**E4 · Wrong suggested words in open mode.**
- `suggested_words` is filled with the catalog titles (`openModeOpeningChips`), so the prompt says "Prefer these words: A casa, O trabalho…".
- **Fix:** suggested words come from the learner's weak and recent items (`v2_item_state`, up to 15 surfaces). The topic chips are a separate field, only for the opening.

**E5 · The open opening has no chips.**
- The opening chips go into `suggested_words` and never reach the UI.
- **Fix:** the opening bubble emits a frame: "Quero falar de ___." / «قول عايز تتكلم عن إيه», with the chips "Sobre o meu dia", "Futebol", "Comida", "O trabalho".

**E6 · The learner's name is never looked up.**
- `learnerName` is never passed from the start route.
- **Fix:** read the first name via `lib/langifyRead`. If it's unknown, drop the slot, as now.

**E7 · No format example in the open-mode prompt.**
- The open rules list the five lines but don't show them. Qwen (MoE) breaks the format and the fallback fires too often.
- **Fix:** add two full example outputs to `OPEN_CONVO_CHARACTER_RULES`:
  - one reacting with a recast;
  - one answering a learner's question.

  Log the fallback rate in the dev panel. Target: under 10% of turns.

**E8 · No pronunciation line on live bubbles.**
- `CharacterBubble` supports `say`, but the convo turns never compute it for reactions or open lines.
- **Fix:** compute `say` in code with the existing transliteration module (`lib/v2/generation/say`) for every character bubble (reaction + authored line, or the open PT line), and send it with the final bubble event.

**E9 · Learn CTA encoded as text.**
- The Learn suggestion sends the href inside a coach message ("آيو\n/talk/…").
- **Fix:** a proper stream event `{type: 'cta', label_eg, href}`, rendered as two buttons («يلا نتعلّم» / «لأ، نكمّل»), with no text parsing on the client.

**E10 · Header and text-mode UI.**
- **Header:**
  - shows «محادثة صوتية / البرتغالية الأوروبية • …» → show the partner's name with the topic under it (title_tl · title_ar, or «أي حاجة»);
  - the partner switcher is a small chevron on the avatar, not a separate dropdown;
  - keep «خلّص»;
  - remove the extra profile icon.
- **Avatars:** generic person icons. Use the character's portrait image if the cast images exist; otherwise their initial on a moss circle.
- **Character bubble:** remove the «البرتغال» subtitle.
- **Accent keys:** they take three rows. Show one compact scrollable row, collapsed behind an «á» toggle by default.
- **Helper line:** replace «أنت في نمط الكتابة النصية الهادئ • انقر المايك للتبديل الفوري للصوت» with «دوس المايك ترجع للصوت».

## Prompt to paste into Cursor

Read docs/langify-v2/09-batches/batch-9-free-chat-v2.md, batch-10-modes-and-voice.md and this file. Implement E1 to E10 in order, and commit each as "conversations: fix E<n> <title>", with the tests listed. Don't change the content files' Portuguese. At the end, run these with the real model:

- **Open mode:**
  1. «عايز اعلم عن الاتجاهات» → Learn CTA buttons;
  2. «ازاي أقول مع رز؟» → a coach note containing "com arroz";
  3. 5 Portuguese turns about cars → every bubble has a pronunciation line and one question, and the fallback count is visible in the dev panel.
- **Thread mode (casa):** batch 9's "Done when" again.
