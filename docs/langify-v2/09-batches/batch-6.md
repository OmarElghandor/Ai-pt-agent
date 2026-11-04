# Batch 6 · Pack generation (M4)

Tasks: T5.1, T5.2, T5.3, T5.4 (details in `docs/langify-v2/09a-conversations-tasks.md`).

## Prompt to paste into Cursor

Read docs/langify-v2/09-conversations.md (whole), docs/langify-v2/09a-conversations-tasks.md (tasks T5.1, T5.2, T5.3, T5.4 and their dependencies), AGENTS.md and docs/langify-v2/00-decisions.md.

Implement tasks T5.1, T5.2, T5.3, T5.4, **in this order, one after the other**. For each task:

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
- Reuse the Phase 3 job DAG, admin, handoffs, critic and lang_check; do not build a second pipeline. Prompt examples come from the hand-written day 18 pack.

When the batch is done, report: the commits (one per task), the files changed per task, the test results, and anything you were unsure about.

## What Omar checks after the batch

Days 3, 18 and 22 are generated from the admin, stored with audio ready, and play end to end.
