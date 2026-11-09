# 10a · Auth: task breakdown for Cursor

Companion to `10-auth.md`. That document says **what** and **why**; this one splits the work into small tasks, each sized for **one Cursor session**. Do them in order. Each task lists what it depends on, where the code goes, and when it is done. No code in this document.

## How to run a task

Give Cursor this prompt, replacing the task id:

> Read docs/langify-v2/10-auth.md (whole), AGENTS.md and 00-decisions.md. Implement task **A-x only**. Do not start the next task. The user id always comes from the session helper, never from the request. Write the tests the task asks for. Stop when "Done when" is met and list the files you changed.

Rules for every task:

- One task = one PR-sized change. If Cursor says a task is too big, split it, don't merge two.
- The user id always comes from the session helper, never from the request body, query or headers.
- New auth code under `lib/v2/auth`, `app/api/auth`, `components/v2/auth`, and protected pages under `app/(v2)`.
- Auth catch-all stays at `/api/auth/*` (public). Shared content (lessons, images, packs) is never deleted on account wipe.
- Env secrets never sent to the client.

Milestones:

- **M1** after A1: Google sign-in on localhost creates a `v2_users` row and a session.
- **M2** after A2: every `/api/v2` learner route uses the session helper; admin is role-gated.
- **M3** after A4: new account → sign-in → onboarding → day 1.
- **M4** after A5: account deletion and privacy page ready for Google consent.
- **M5** after A6: CI can sign in without Google; production cannot reach the dev route.

---

## A0 · Write the decisions

- Depends on: nothing.
- Do: the changes in `10-auth.md` section that update `00-decisions.md` (§0 identity, new §0b, §4 gender meaning `v2_users.gender`, §11 open items); link `10-auth.md` and this file from `docs/langify-v2/README.md`. Sign-in UI is Calm Kit (not Warm Editorial).
- Done when: the docs are updated and nothing else changed.

---

## A1 · Better Auth with Google, on localhost

- Depends on: A0.
- Where: `lib/v2/auth`, the auth catch-all route under `app/api/auth`.
- Do: install Better Auth and its MongoDB adapter, using the repo's existing Mongo connection. Rename its tables to the `v2_` names in `10-auth.md` §1. Add the Google provider with `openid email profile` only. Add the extra user fields (role, gender, onboarded_at, langify_user_id). Read the env vars from §1, and fail at startup with a clear message if one is missing. Set the session to 60 days, rolling.
- Done when: signing in with Google on localhost creates one `v2_users` document and one session, and signing in again reuses them.

---

## A2 · Current-user helper and protection

- Depends on: A1.
- Where: `lib/v2/auth`, the `proxy` file, every existing `/api/v2/*` route.
- Do: one server helper that returns the current v2 user or a 401. Replace every place that reads a user id from the request (body, query, header, a dev picker) with it. Add the early redirect in `proxy` for the protected pages. Add the admin check (role from `ADMIN_EMAILS`, applied on every sign-in) and put it on every admin page and route.
- Tests: a protected route without a session returns 401; a request carrying another user's id gets the signed-in user's data only; a learner calling an admin route gets 403.
- Done when: tests pass, and a search of `app/api/v2` finds no user id read from the request.

---

## A3 · Link to Langify and migrate old v2 data

- Depends on: A2.
- Where: `lib/v2/auth/link`, a script under `scripts/`.
- Do: on the first sign-in only, if Google's email is verified, look it up in Langify `users` through `lib/langifyRead` and store `langify_user_id`. A failed Langify read never blocks sign-in; it is logged and retried on the next sign-in. Then check how existing `v2_*` documents are keyed. If any use the Langify user id, write a migration script that rekeys them to the v2 user id: dry run prints counts per collection, real run is idempotent.
- Tests: verified matching email links; unverified email doesn't; Langify down still signs in.
- Done when: Omar's own account links to his Langify user, and the dry run shows what would move.

---

## A4 · Sign-in screen, onboarding and settings

- Depends on: A2.
- Where: `app/(v2)`, `components/v2/auth`.
- Do: the sign-in page (Calm Kit, one Google button following Google's branding rules, privacy link, RTL, 390px); full-page redirect, never a popup; return to the page the learner came from. Onboarding after the first sign-in: name, then gender with its one-line reason, then day 1. Settings: name, gender, sign out. The learner's gender feeds `tl` / `tl_f` and the learner voice everywhere they're used.
- Done when: a new Google account goes sign-in → onboarding → day 1, and changing gender in settings switches the learner's lines to `tl_f`.

---

## A5 · Account deletion and privacy page

- Depends on: A4.
- Do: "امسح حسابي" with one confirmation; delete the v2 user, sessions, linked accounts and every `v2_*` document keyed by that user id (one list of user-keyed collections in code, with a test that fails when a new user-keyed collection isn't on it). Sign out everywhere. The privacy page in Arabic and English.
- Tests: after deletion, no document with that user id remains in any `v2_*` collection.
- Done when: tests pass, and Langify is untouched.

---

## A6 · Dev sign-in for scripts and CI

- Depends on: A2.
- Do: a dev-only route that signs in a fixed test user, for local scripts and CI (the `09a` T2.2 budget test uses it). It is not registered in production, and a test fails if it is reachable with production settings.
- Done when: the CI scripts run signed in, and the production check passes.

---

## A7 · Real devices and Google consent screen

- Depends on: A4, a deployed preview URL.
- Do: add the production and preview redirect URIs to the Google OAuth client; fill the consent screen (name, logo, privacy link, support email) and publish it. Test on a real iPhone (Safari, then the installed home-screen PWA) and on Android Chrome (browser and installed): sign in, close the app, reopen next day, still signed in. Write the results into `10-auth.md`.
- Done when: all four cases pass, or the failing case is written down with what was seen, for Omar to decide.
