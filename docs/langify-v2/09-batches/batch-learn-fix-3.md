# Learn fix 3 · Day 33 directions and authored-pack priority

Omar reported (2026-11-06) that «Onde fica?» "doesn't have the directions".

## Findings (branch docs/conversations-plan @ b7a5128)

1. **The pack was missing the day's early chunks.** Day 33 in `pt-PT.days.json` lists `early_chunks_tl: ["Vire à esquerda", "Siga em frente"]`. The lesson pages teach them, but the conversation pack only had à direita / à esquerda (and those only in group 2, after 6 place questions).
   - **Fixed in content** on this branch: the pack now has 4 groups:
     1. places;
     2. directions: à direita, siga em frente, à esquerda, vire à esquerda;
     3. perto / longe;
     4. asking.
   - The map route is now station → right → street → straight on → pharmacy → left → home.
   - The new items are `phrase.go_straight` and `phrase.turn_left`, listed in `early_chunks_item_ids`.
   - The pack is valid with the app's loader, with 4 recap-coverage warnings only.
2. **A generated pack in Mongo overrides the authored file.** `loadConvoPackAsync` reads Mongo first. If a generated day 33 pack exists in Mongo (from earlier ensure / prepare runs), it's served instead of the authored file. «أعد تحميل المحادثة» then re-enqueues generation, because the Mongo pack isn't marked authored. The authored file can never win.

## Prompt to paste into Cursor

Read this file. Implement N1–N4 in order, and commit each as "conversations: learn fix N<n> <title>", with tests. Don't change the pack's Portuguese.

**N1 · Authored files win.**
- In `loadConvoPackAsync`, if a content file exists for the pack id, load the file and skip Mongo.
- Mongo is used only for days without an authored file.
- Tests:
  - with both an authored file and a Mongo pack for day 33, the file is served;
  - without a file, Mongo is served.

**N2 · Clean up generated packs that shadow authored ones.**
- A one-off script plus an admin action: delete or archive `v2_convo_packs` documents whose day has an authored file.
- Run it for day 33.
- `prepare_day` and the convo pack job must refuse to write a pack for a day that has an authored file, even with `force`.

**N3 · Early chunks are allowed items.**
- The pack validator accepts item ids listed in `early_chunks_item_ids` when they match the day's `early_chunks_tl` in the plan. That's in addition to core and recycle.
- Progress writes for them count normally.
- The convo generation job (for other days) also receives the day's early chunks, and must include them in a group.

**N4 · Reload works for authored packs.** «أعد تحميل المحادثة» on an authored pack clears the in-memory cache, re-reads the file and resets the session. No generation.

## Done when

- Open «Onde fica?» after N1–N2 → the opening is «Olá! 😊 Já saí do metro, mas estou perdida! Vês-me no mapa?».
- Group 2 shows 4 mini cards (à direita, à esquerda, Siga em frente, Vire à esquerda), and the map shows the right → straight → left route.
- Editing the JSON and tapping «أعد تحميل المحادثة» shows the edit.
