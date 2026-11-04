# Batch 8 · Free chat (M5)

Tasks: T7.1, T7.2, T7.3, T7.4, T7.5 (details in `docs/langify-v2/09a-conversations-tasks.md`).

## Prompt to paste into Cursor

Read docs/langify-v2/09-conversations.md (whole), docs/langify-v2/09a-conversations-tasks.md (tasks T7.1, T7.2, T7.3, T7.4, T7.5 and their dependencies), AGENTS.md and docs/langify-v2/00-decisions.md.

Implement tasks T7.1, T7.2, T7.3, T7.4, T7.5, **in this order, one after the other**. For each task:

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
- The free chat uses the same six-part prompt; add a free-chat run to the T2.2 budget test.

When the batch is done, report: the commits (one per task), the files changed per task, the test results, and anything you were unsure about.

## What Omar checks after the batch

A 30-turn free chat never ends without a question, survives an English off-topic message, and the loop free chat → directions conversation → back to free chat works.
