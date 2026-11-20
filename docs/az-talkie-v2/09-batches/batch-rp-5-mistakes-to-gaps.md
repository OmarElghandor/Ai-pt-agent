# Role-play v5 · Repeated mistakes go to «نواقصك» (classified)

Decided by Omar on 2026-11-20: when the learner makes **the same mistake more than once** in role-play, it goes to his weak spots, classified into a problem. A one-off mistake doesn't go there; it stays a correction card in the chat.

Apply this **after** `batch-rp-4-all-scenes.md`. Nothing here changes what the learner sees in the chat. If something is unclear, **stop and ask Omar**.

## What already exists (reuse it, build nothing parallel)

- `POST /api/v2/answers` (`lib/v2/answers/handle.ts`) is the only writer of `v2_errors` (`00-decisions.md` §8b).
- After an error is saved, `enqueueClassifyError` (`lib/v2/progress/classify/enqueue.ts`) labels it in the background:
  - the code rules first (accent, common-mistake pair, Brazilian form);
  - otherwise the Qwen classifier, using only the problems available at the learner's day;
  - then `applyWeakSpotAfterLabel` updates `v2_weak_spots`.
- `GET /api/v2/gaps` lists the open weak spots for «نواقصك».
- The opening rule stays as it is (`11-profile-progress.md` §4.4): the same problem gets weight ≥ 3 within 14 days, from at least 2 different questions. `slip` and `unsure` never open anything.

## 1. What counts as "a mistake" in role-play

A mistake is one **wrong → right word pair** shown to the learner:
- in a correction card (Qwen's `corrected`, or the code-built accent card); or
- in a «قصدك X؟» stop.

**The pairs:**
- A sentence with several changed words gives several pairs. Use the same word diff that the correction card already shows («caráo → cartão»).
- Punctuation-only and capitalization-only changes are not mistakes. They're already dropped from the card.

**Not mistakes:**
- an Arabic help question;
- «مش عارف»;
- a miss with no understood answer (`unclear`);
- using a suggestion the learner was shown.

**The mistake key** is the pair, lowercased and trimmed, with accents **kept** («agua→água», «caráo→cartão», «quero→queria»). The same key in two different scenes is the same mistake.

## 2. Logging each mistake (every time) through the answers route

- Every mistake from point 1 is sent to the answers route **server-side**, inside the scene turn. Do it the way `lib/v2/convo/progress/writeViaAnswers.ts` calls `handleAnswerRequest`, not with an HTTP fetch from the browser.
- Add a new payload kind, `scene_mistake`, with these fields:
  - `answer_id`: idempotent = session id + turn number + the key;
  - `day`: the learner's current day;
  - `session_id`, `scene_id`, `goal_id`;
  - `prompt_tl`: the character's question the learner was answering;
  - `learner_tl`: the learner's sentence;
  - `corrected_tl`: the corrected sentence;
  - `wrong`, `right`: the pair;
  - `stopped`: true when it came from a «قصدك» stop.
- **The handler for this kind:**
  - It writes **one `v2_errors` doc** per mistake:
    - `category` / `scope` from `classifyMiss` / `accentError`;
    - `tool_id` = «scene:<scene_id>:<goal_id>»;
    - two new optional fields: `source: "roleplay"` and `mistake_key`.
  - It **never touches `v2_item_state`**. Scenes have no item ids.
- **The answer route never waits for the classifier.** A failed write never breaks the chat; it's logged and the turn carries on.

## 3. "More than once" → classify it (this is the gate to «نواقصك»)

- After saving the error, count the learner's `v2_errors` with the **same `mistake_key`** and `source: "roleplay"` in the **last 14 days**. Counting the same session is fine. Count across scenes too.
- **Count = 1:** the error is saved, but **not** classified. It never reaches weak spots.
- **Count = 2:** classify **both**, this one and the earlier one, with `enqueueClassifyError`.
- **Count ≥ 3:** classify each new one.
- **The question key** sent to `applyWeakSpotAfterLabel` is `tool_id` (scene + goal). This way the "2 different questions" rule works naturally:
  - the same goal failing twice in one session can't open a weak spot alone;
  - the same mistake at two goals or in two scenes can.
- **Inputs to the classifier:**
  - `questionType: "roleplay"`;
  - `promptText` = `prompt_tl`;
  - `wrong` = the learner's sentence, `right` = the corrected sentence;
  - the pair as `mainError` («caráo → cartão»);
  - **the real learner day**, so the available problems are right;
  - no item ids.
- The `isBrazilian` flag must be true **only** when `classifyMiss` returned scope `brazilian`. See point 5.

## 4. Readers that must ignore role-play errors

Role-play errors feed **problems only**, never word cards or the old tool weak areas. Check every reader of `v2_errors` and skip `source: "roleplay"` where it builds:
- the card deck's weak items (`weakItems.ts`, `cards.ts`);
- `weakAreas.ts`;
- anything per item.

List them in your plan.

## 5. Two small fixes in the existing classifier call (they affect every error, not only role-play)

1. `handle.ts` passes `isBrazilian: e.scope === 'brazilian' || e.category === 'vocabulary'`. That marks **every** vocabulary error as Brazilian. Make it `scope === 'brazilian'` only.
2. The same call defaults `learnerDay` to 1 when it's missing, so only day-1 problems are ever offered. Always pass the learner's real day.

## 6. Blocker: the problem list is empty

- `content/v2/problems.pt-PT.json` has `"problems": []` on main and on every branch.
- So right now:
  - the code rules can't find `spelling.accent` or `vocabulary.brazilian`;
  - Qwen gets an empty list, so every label is `unsure`;
  - **no weak spot can ever open**, from role-play or anything else.
- The list is content, written by Omar + Claude (`11` §4.1). It comes as a separate file. The code in this batch must work with any list, including the empty one, without errors.

## Tests (stub the classifier client and the clock)

- **R5-1:** at cena-cafe `pay`, «com cartao» once → one `v2_errors` doc (source `roleplay`, key «cartao→cartão», tool_id `scene:cena-cafe:pay`), **no** classification call.
- **R5-2:** then «agua» at cena-restaurante (key «agua→água»), then «cartao» again at cena-restaurante `pay` → the second «cartao» triggers classification of **both** «cartao» errors. «agua» stays unclassified (count 1).
- **R5-3:** with a test problem list containing `spelling.accent`: «cartao» at 3 different goals or scenes within 14 days → `spelling.accent` is labelled by code (no Qwen) and the weak spot opens. The same 3 at **one** goal → it doesn't open (only 1 question).
- **R5-4:** a key whose earlier errors are older than 14 days counts as 1 again.
- **R5-5:** punctuation-only, an Arabic help question, «مش عارف» and an `unclear` miss → no `v2_errors` doc.
- **R5-6:** a «قصدك» stop followed by the corrected answer → **one** error for that pair (the stop), not two.
- **R5-7:** a scene error never changes `v2_item_state`, the card deck's weak items or `weakAreas`.
- **R5-8:** a vocabulary `wrong_word` error is **not** sent with `isBrazilian: true`, and the classifier gets the real learner day.
- **R5-9:** a failing answers write or classifier doesn't change the bubble, the coach line or the correction card (the goldens from R4-2 still pass).

## Done when

- R5-1 to R5-9 pass; R4 and the café tests still pass.
- The plan lists every `v2_errors` reader and what it does with `source: "roleplay"`.
- `v2_errors` gets the two optional fields. No new collection, so the account-deletion list doesn't change.
