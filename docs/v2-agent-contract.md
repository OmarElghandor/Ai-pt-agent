# Langify ↔ ai-agent-talk v2 contract

> **DEPRECATED.** Do not extend this contract. v2 is a single-repo app in `ai-agent-talk`: progress writes go through `POST /api/v2/answers`; grader and reactor are pure modules under `lib/v2/`. See [`docs/langify-v2/00-decisions.md`](langify-v2/00-decisions.md) §0 and §9, and [`01-architecture.md`](langify-v2/01-architecture.md). Phase 6 migrates useful logic from `/api/grade` and `/api/react` into `lib/v2`, then deletes those routes. This file remains only as a historical reference for the temporary HTTP endpoints.

Langify owns learner progress and calls this service for open grading and reactions. Mobile talks only to Langify (`POST /v2/answers`).

Tie-breaker: [`docs/langify-v2/00-decisions.md`](langify-v2/00-decisions.md) §9. Architecture: [`docs/langify-v2/01-architecture.md`](langify-v2/01-architecture.md).

## Auth

Both endpoints require header `x-agent-secret` matching env `AGENT_SHARED_SECRET`.

## `POST /api/grade`

Non-streamed JSON grader for **speaking** and **writing** only. Listening/reading return **400** (graded by code in Langify).

### Request

```json
{
  "mode": "practice | daily | open_question | assessment",
  "level": "A0",
  "learner_gender": "m | f | unknown",
  "skill": "speaking | writing",
  "prompt_pt": "Quanto custa?",
  "accepted": ["São dois euros."],
  "criterion": "optional when open",
  "target_items": ["phrase.ask_price"],
  "tool_id": "optional",
  "weak_areas": ["grammar.agreement"],
  "known_items": ["euro", "euros"],
  "answer": "Sao dois euro",
  "answer_source": "typed | speech"
}
```

### Response

```json
{
  "verdict": "correct | near_miss | wrong | off_topic | arabic_only | unclear",
  "items_used_correctly": ["phrase.ask_price"],
  "errors": [
    {
      "category": "grammar",
      "scope": "agreement",
      "item_id": "",
      "tool_id": "",
      "wrong": "euro",
      "right": "euros"
    }
  ],
  "main_error": 0,
  "corrected_tl": "São dois euros.",
  "feedback_ar": "بعد الرقم بنقول euros.",
  "skill": "speaking"
}
```

Malformed model output → `verdict: unclear` (does not count as a learner error). **Never writes progress.**

## `POST /api/react`

Stateless reactor. SOURCE is always code: no hidden `VERDICT:` line. Corrects one error only.

### Request

```json
{
  "mode": "practice",
  "level": "A0",
  "skill": "speaking",
  "verdict": "near_miss",
  "prompt_pt": "Quanto custa?",
  "line_ar": "بكام؟",
  "answer": "Sao dois euro",
  "corrected_tl": "São dois euros.",
  "main_error": {
    "category": "grammar",
    "scope": "agreement",
    "wrong": "euro",
    "right": "euros",
    "feedback_ar": "بعد الرقم بنقول euros."
  },
  "weak_spot": false,
  "character_name": "Rita",
  "character_role": "caixeira",
  "reaction_cue": "hands him the change",
  "reaction_kind": "r1 | r2 | r3"
}
```

### Response

```json
{
  "text": "<coach><ar>…</ar><arz>…</arz><pt>São dois euros.</pt></coach>",
  "mode": "practice",
  "skill": "speaking",
  "verdict": "near_miss"
}
```

Modes: `practice` (character + coach), `daily` (Inês), `open_question` (coach only / empty on correct), `assessment` (character only, no mid correction).

## Pack generation

Beats include `skill` plus `listening_options` / `reading_artifact` when needed. Default mix per ~10 beats: 3 speaking · 3 listening · 2 reading · 2 writing.

## Legacy

`POST /api/chat` still runs the in-app lesson player (local learner JSON + optional `practice_progress` writes). Set `PRACTICE_WRITE_PROGRESS=false` when Langify owns completion. Grade/react never call those writers.
