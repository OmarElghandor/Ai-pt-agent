# 10 · Accounts and sign-in (Google)

Status: decided, 2026-11-09. Author: Omar + Claude. Implementation: Cursor (see `10-auth-tasks.md`).

Read first: `AGENTS.md`, `00-decisions.md` (§0, §0b, §4 gender, §8), `09-conversations.md` (it relies on a signed-in user). Where this document disagrees with `00` §0 about identity, **this document wins**, and task A0 writes the change into `00`.

No code in this document by design.

---

## 1. Decisions (copied into `00` as §0b)

This section replaces the identity line in §0.

- **Sign-in method (changed 2026-11-24):** email/password (min 8 chars) with optional username; social Google (required), Apple and Facebook when env is set. Email verification does not block the first session. Magic link remains an open item.
- **Library:** Better Auth with its MongoDB adapter + username plugin, inside `ai-agent-talk`. Auth.js / NextAuth is not used for new work. Read `AGENTS.md` first: in Next.js 16 the old `middleware` file is replaced by `proxy`.
- **v2 owns its users.** Auth data lives in v2 collections with the `v2_` prefix: `v2_users`, `v2_auth_sessions`, `v2_auth_accounts`, `v2_auth_verifications` (the library's tables, renamed through its config).
  - The `v2_users` document holds: name, email, email_verified, picture, optional `username`, `role` (learner | admin), `gender` (m | f | null), `coach_dialect` (`eg` · `msa` · `levantine` · `gulf`), `motivations` (string[]), `proficiency`, `reminders`, `practice` (`daily_minutes`), `onboarded_at`, `langify_user_id` (optional), created and last-seen timestamps.
  - Google scopes are `openid email profile` only. No Drive, no contacts, nothing else.
- **Every v2 document is keyed by the v2 user id.** That covers `v2_item_state`, `v2_errors`, `v2_sessions`, `v2_convo_sessions` and every later collection. If existing v2 documents are keyed by the Langify user id, one migration script rewrites them (dry run first, then real run, idempotent).
- **Link to Langify (read-only, once):** on a user's first sign-in with a verified email that matches a Langify `users` email, code stores that id as `langify_user_id` on the v2 user. Langify is read only at that moment, through `lib/langifyRead`, and v2 still never writes Langify collections. After the link, nothing in v2 depends on Langify being reachable.
- **Who is the user, in code:** one server helper returns the current v2 user from the session. Every route handler and server action uses it. **The user id always comes from the session, never from the request body, query or headers.** A request that sends a user id for someone else is ignored, not trusted.
- **What is protected:**
  - All `/api/v2/*` routes need a signed-in user, except the auth routes, `GET /api/v2/auth/providers`, and a public health check.
  - All `(v2)` pages need a signed-in user, except the landing page, `/sign-in`, `/sign-up`, and `/privacy`.
  - The `proxy` only does an early redirect to sign-in. The real check is the helper inside each route; the proxy is never the only guard.
  - Admin pages and admin APIs (generation, images, characters, reruns) need `role: admin`. Admins are set by the env list `ADMIN_EMAILS`, applied on sign-in.
- **Sessions:** stored in the database, sent as an httpOnly, Secure, SameSite=Lax cookie. They last 60 days and roll forward on use, so a learner who opens the app a few times a week is never asked to sign in again. Sign-out deletes the session. Sessions can be revoked from the admin.
- **The flow on a phone:** full-page redirect to the social provider and back, never a popup (popups break in installed PWAs). The callback returns to the page the learner came from.
  - **Known risk:** on iPhone, a home-screen PWA and Safari don't always share cookies, so a sign-in that leaves the app can land in the wrong one. This is tested on a real iPhone (installed PWA) before the pilot, and on Android Chrome. If it fails, the fix is decided then; it is not guessed now.
- **Sign-in / sign-up screens:** Lumina (Stitch layout), RTL. Email or username + password; social row (Google / Apple / Facebook). Google button keeps Google branding colours. Privacy (and terms until a `/terms` page exists) link to `/privacy`.
- **Onboarding, once, after the first sign-in (6 steps):**
  1. Confirm the name (from Google or sign-up, editable). It is the name characters use.
  2. Gender, m or f, with the reason in one Egyptian line ("عشان نقولك obrigado ولا obrigada"). Skipping keeps the default m from §4; changeable in settings.
  3. Coach dialect (`coach_dialect`). Content stays Egyptian for now; non-`eg` values are stored for later.
  4. Motivations (multi-select) → `motivations`.
  5. Proficiency (`zero` · `words` · `basics` · `quiz`). The one-minute quiz option is stored only; no quiz engine yet.
  6. Daily commitment (5 / 15 / 20) → `practice.daily_minutes`, optional reminder flag → `reminders.daily_enabled`, then day 1.
- **No guest mode in the first version.** A learner signs in before any progress is written. Revisit after the pilot.
- **Settings:** name, gender, coach dialect, daily minutes, sign out, and "امسح حسابي".
- **Account deletion (GDPR):** "امسح حسابي" asks once for confirmation, then deletes the v2 user, their sessions and linked accounts, and every v2 document keyed by their id. It doesn't touch Langify. It also signs them out everywhere. Shared, non-personal data (lessons, images, packs) is never deleted.
- **Privacy page:** a short page in Arabic and English that says what's stored (name, email, picture; learning progress; voice recordings only as long as the STT call needs them) and how to delete it. Required for Google's OAuth consent screen.
- **Google Cloud setup:** one OAuth client of type "Web application", with redirect URIs for localhost and production. The consent screen has the app name, logo, privacy link and support email, and it is published (not left in testing) before the pilot. Apple and Facebook OAuth apps are optional and wired only when their env vars are set.
- **Env:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ADMIN_EMAILS`; optional `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_IDENTIFIER`, `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`. None of them is ever sent to the client (except a public providers flag endpoint).
- **Dev and tests:** a dev-only "sign in as test user" route for scripts and CI (for example the 40-turn budget test in `09`). It exists only when not in production, and the build fails if it is reachable in production.

---

## 2. Device test results (A7)

**Google Cloud (checklist for Omar):**
1. OAuth client type **Web application**.
2. Redirect URIs: `http://localhost:3000/api/auth/callback/google`, plus production and preview URLs (`https://<host>/api/auth/callback/google`).
3. Consent screen: app name A-Z Talkie, logo, privacy link (`/privacy`), support email; **publish** before the pilot (not left in testing).
4. Put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in the server env (never on the client).

**Device matrix** (fill after a deployed preview URL exists):

| Case | Result | Notes |
|---|---|---|
| iPhone Safari | pending | Not run yet — needs deployed preview + real device |
| iPhone installed PWA | pending | Known risk: PWA vs Safari cookie jar may diverge |
| Android Chrome | pending | Not run yet |
| Android installed | pending | Not run yet |

Omar decides the fix if any case fails; do not guess a workaround in code until then.

---

## 3. Open items (also in `00` §11)

- Test Google sign-in in an installed iPhone PWA and Android before the pilot.
- Apple / Facebook: wire env and OAuth consoles before pilot if those buttons should work in production.
- Email magic link: decide after the pilot.
- Guest mode (try day 1 before signing in): decide after the pilot.
- Langify users who signed up with an email that isn't a Google account: how they reach their old progress, if at all.
