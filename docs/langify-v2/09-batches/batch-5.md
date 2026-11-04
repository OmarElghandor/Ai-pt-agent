# Batch 5 · Arabic side channel and resume (M3)

Tasks: T3.1, T3.2, T3.3, T4.1 (details in `docs/langify-v2/09a-conversations-tasks.md`).

## Prompt to paste into Cursor

Read docs/langify-v2/09-conversations.md (whole), docs/langify-v2/09a-conversations-tasks.md (tasks T3.1, T3.2, T3.3, T4.1 and their dependencies), AGENTS.md and docs/langify-v2/00-decisions.md.

Implement tasks T3.1, T3.2, T3.3, T4.1, **in this order, one after the other**. For each task:

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
- Arabic text must never reach the character's exchanges or prompt. Add an Arabic turn to the T2.2 budget test.

When the batch is done, report: the commits (one per task), the files changed per task, the test results, and anything you were unsure about.

## What Omar checks after the batch

Typing يمين, يعني إيه esquina؟ and ازاي أقول مع رز؟ mid-conversation all work and the character waits; leaving and reopening later continues on the same question.
