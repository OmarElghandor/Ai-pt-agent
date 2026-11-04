# Batch 1 · Foundations: pack, session, grading

Tasks: T1.1, T1.3, T1.4 (details in `docs/langify-v2/09a-conversations-tasks.md`).

## Prompt to paste into Cursor

Read docs/langify-v2/09-conversations.md (whole), docs/langify-v2/09a-conversations-tasks.md (tasks T1.1, T1.3, T1.4 and their dependencies), AGENTS.md and docs/langify-v2/00-decisions.md.

Implement tasks T1.1, T1.3, T1.4, **in this order, one after the other**. For each task:

1. implement only that task;
2. write the tests it asks for and run them until they pass;
3. check its "Done when";
4. commit it on its own, with the message "conversations: <task id> <task title>";
5. then move to the next task.

If a task fails its tests or its "Done when" and you can't fix it, stop there and report; do not continue to the next task.

Rules for the whole batch:
- Follow 09 section 5 strictly: nothing may be added to the per-turn prompt beyond the six parts in 5.1.
- Reuse the modules listed in 09 section 10 instead of writing new ones.
- New code only under lib/v2/convo, app/api/v2/convo, app/(v2), components/v2/convo. Only POST /api/v2/answers writes progress.
- Do not start any task outside this batch.
- Until content/v2/convo/pt-PT.day-18.json exists (T1.2 is written by hand by Omar and Claude, do not write it), put a small day 18 fixture pack under tests/fixtures and use it in all tests.

When the batch is done, report: the commits (one per task), the files changed per task, the test results, and anything you were unsure about.

## What Omar checks after the batch

Tests pass for the validator, the session start/reload, and the 20+ grading cases. No UI, no model calls.
