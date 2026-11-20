# Rename · The app is A-Z Talkie (slug `az-talkie`), not Langify

Decided by Omar on 2026-11-20. Apply this **last**, after batch-rp-4 and batch-rp-5 are merged, so their paths don't move under them. If something is unclear, **stop and ask Omar**.

## Two names, two meanings

- **A-Z Talkie** (`az-talkie`) is **our app**: the v2 app, its docs, its specs, its content.
- **Langify** stays **only** for the legacy app and the shared legacy data we read. These keep their names:
  - `lib/langifyRead`, `getCurrentUserId()`, and `DEV_LANGIFY_USER_ID`;
  - the Langify `users` / `userprogresses` collections;
  - the legacy UI (`/lessons`, `/chat`);
  - the account-deletion text «مش بنلمس حسابك على Langify», which is correct as it is.

## What changes

1. **The docs folder:** move `docs/az-talkie-v2/` to `docs/az-talkie-v2/` with `git mv` so the history stays. Then update every reference to that path:
   - `AGENTS.md` / `CLAUDE.md`;
   - `.cursor/rules` (also rename `00-az-talkie-core.mdc` to `00-az-talkie-core.mdc`);
   - the docs themselves;
   - code comments;
   - tests;
   - scripts.
2. **The spec text:** where a doc or comment says "Langify v2" meaning our app, write "A-Z Talkie". Leave it where it means the legacy app.
3. **Code identifiers:** under `lib/v2`, `app/(v2)`, `app/api/v2` and `components/v2`, rename any identifier, log tag or env var that names our app "langify". Env vars change only if they're v2-only. If a renamed env var is read in production, keep reading the old name as a fallback and tell Omar which ones to rename in Vercel.
4. **Leave alone:**
   - the `v2_` collection names;
   - the URLs and routes;
   - the `design/` folder;
   - the legacy code paths listed above.

## Before you change anything

Send Omar the full list of hits (file → the old text → the new text, or "keep: legacy"), grouped by the 4 points. Wait for his OK.

## Done when

- `git grep -i langify` shows only legacy hits, and each one is in the approved list.
- The build, typecheck and all tests pass.
- `AGENTS.md` points to `docs/az-talkie-v2/`.
