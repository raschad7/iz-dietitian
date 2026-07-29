# Authentication Hardening — Design

**Date:** 2026-07-29
**Status:** Approved
**Scope:** Staff (dietitian) authentication. Patient/portal auth changes only where it
shares machinery (the mailer).

---

## Goal

Make staff authentication both easier and safer than it is today.

Three ways in — passkey, Google, email + password — with a verified email address
behind every account, real transactional email, and failed attempts that are
counted and throttled.

## Product context

This is a **public SaaS**: any dietitian may sign up, and each sign-up creates its
own clinic (the existing tenant boundary). Sign-up therefore stays open, and is
made safe rather than closed.

## What exists today

Working: separate staff/client sign-in pages, opaque sign-in errors, authoritative
role checks in the area layouts, clinic-scoped tenancy, `input: false` on `role`
and `clinicId` so neither can be posted from a form, single-use 15-minute magic
links.

Gaps this design closes:

1. Staff sign-up is unauthenticated and unthrottled, and grants access to every
   client's medical notes.
2. No transactional email. `sendMagicLink` logs in development and **throws in
   production**, so the patient portal cannot work when deployed.
3. No rate limiting anywhere.
4. No password reset — a forgotten password is permanent lockout.
5. No email verification (`requireEmailVerification: false`).
6. `src/proxy.ts` writes a `?redirect=` parameter that nothing reads.
7. Auth business logic lives in `src/components/auth/`, contradicting the
   architecture rule in the README.

Out of scope, deliberately: team invitations, session/device management UI,
audit logging, 2FA/TOTP. Each is its own spec.

### Verified finding: Better Auth's rate limiter cannot protect this app

Better Auth applies rate limiting in the router's `onRequest` hook
(`node_modules/better-auth/dist/api/index.mjs`, `router()` → `onRequest` →
`onRequestRateLimit`). That hook runs only for requests passing through the HTTP
handler.

Every auth call in this app is a direct `auth.api.*(...)` invocation from a server
action, which calls the endpoint object and never touches the router. Enabling
`rateLimit` in the Better Auth config would therefore appear to add protection
while adding none.

**Consequence:** rate limiting is implemented at the server-action layer, by this
codebase. The exception is passkeys, which necessarily go over HTTP and so are
covered by Better Auth's own limiter.

---

## Architecture

Auth logic moves into a feature folder, matching the rule the rest of the codebase
follows. `src/components/auth/` is removed.

```
src/lib/mail/
  index.ts          # Mailer interface + transport selection
  console.ts        # development transport — logs to the server console
  resend.ts         # production transport
  templates.ts      # subject + body per mail type, ar and en

src/features/auth/
  actions.ts        # "use server" — every auth mutation
  form-state.ts     # state shapes (a "use server" module may only export functions)
  schema.ts         # Zod input schemas
  rate-limit.ts     # attempt recording, throttling, lockout — imports no Next
  redirect.ts       # safe post-login destination — pure
  cleanup.ts        # expiry of unverified accounts
  components/       # forms, moved from src/components/auth/
  rate-limit.test.ts  redirect.test.ts  cleanup.test.ts

src/db/schema/auth.ts
  + passkeys        # required by @better-auth/passkey
  + authAttempts    # rate limiting and lockout

src/app/[locale]/
  forgot-password/page.tsx
  reset-password/page.tsx
  app/settings/security/page.tsx
```

No `verify-email` route is needed: Better Auth serves verification at
`/api/auth/verify-email` and redirects to `callbackURL` itself. Adding a page
would only duplicate it.

```
```

`rate-limit.ts`, `redirect.ts` and `cleanup.ts` import nothing from Next.js, so
`bun test` calls them directly — the same split the clients feature uses between
`mutations.ts` and `actions.ts`.

### Dependencies

- `@better-auth/passkey@^1.6.25` — matches the installed `better-auth@1.6.25`.
- `resend` — production mail transport.

---

## Flows

### Sign-up with a password

`emailAndPassword.autoSignIn` becomes `false`; `requireEmailVerification` becomes
`true`.

Submitting the form creates the user and its clinic, sends a verification email,
and returns a `check-your-inbox` state. **No session is issued.** Clicking the
link verifies the address and signs the user in
(`emailVerification.autoSignInAfterVerification: true`), landing on
`/[locale]/app`.

Attempting to sign in before verifying returns a `verify-email` state carrying a
resend button, which is itself rate limited.

**Accepted consequence:** a mistyped address is unrecoverable — no session exists
and the mail went elsewhere. The check-your-inbox screen therefore carries a
"wrong address? sign up again" link, and the orphaned account expires (below).

### Sign-in with a password

Unchanged in shape. The error stays deliberately opaque — it never reveals whether
the address is registered. Gains a rate-limit check before the attempt, a recorded
failure after, and the unverified-account branch above.

### Google

A server action calls `auth.api.signInSocial` and redirects to the returned consent
URL, keeping the entry point in the action layer where it can be rate limited.

The button appears on staff pages only. Patients use magic links; offering Google
on the portal door would invite them to try a method that is not theirs.

Google-created accounts arrive with `emailVerified: true` from the provider and so
skip the verification gate.

### Passkeys

`@better-auth/passkey`, configured with `rpID`, `rpName` and `origin` derived from
`BETTER_AUTH_URL`.

WebAuthn requires browser APIs, so registration and sign-in run through
`authClient` against `/api/auth/*`. **This is the one deliberate exception to the
"server actions only" rule**, and it is documented in the code. It also means
these two paths are covered by Better Auth's own rate limiter.

Registration happens on Settings → Security. Sign-in is a button above the password
form on the staff login page; with no passkey registered the browser reports none
and the password form is still present.

### Password reset

`/[locale]/forgot-password` accepts an email and **always** reports "if that
address has an account, we sent a link" — the same opacity as sign-in.

The mailed link lands on `/[locale]/reset-password?token=…`. Setting a new password
**revokes every other session for that user**, because a reset is what a person
does when they believe someone else holds their password.

### Sign-in page ordering

Passkey button, Google button, then the password form. Passkey is the fastest and
safest path, and its position is what drives adoption.

---

## Abuse protection

### `auth_attempts`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | `gen_random_uuid()` |
| `kind` | text | `sign_in` \| `sign_up` \| `password_reset` \| `verification_resend` \| `magic_link` |
| `email` | text, null | normalised (trimmed, lowercased) |
| `ip_address` | text, null | see caveat below |
| `created_at` | timestamptz | default `now()` |

Indexed on `(kind, email, created_at)` and `(kind, ip_address, created_at)`.

Each attempt counts rows inside a trailing window. Over the limit, the action
returns a `rate-limited` state naming the minutes remaining, and the underlying
call is never made.

### Limits

| Action | Per email | Per IP |
| --- | --- | --- |
| Sign-in | 5 / 15 min | 20 / 15 min |
| Sign-up | — | 3 / hour |
| Password reset request | 3 / hour | 10 / hour |
| Verification resend | 3 / hour | 10 / hour |
| Magic link request | 3 / 15 min | 10 / hour |

A successful sign-in deletes that email's `sign_in` rows. Expired rows are deleted
opportunistically on write, keeping the table small without a scheduled job.

**Two properties that must not be lost:**

Failures are recorded for addresses that **do not exist**. If they were not, a
lockout response would confirm an account exists — reintroducing the enumeration
leak the opaque sign-in error exists to prevent.

The IP address is read from `x-forwarded-for`, which is **forgeable when no trusted
proxy sits in front of the app**. The per-email limit is the load-bearing control;
the per-IP limit is defence in depth. This is stated in the code so no later reader
assumes IPs are trustworthy.

### OAuth account-linking safeguard

Account linking is enabled with `google` as a trusted provider. That would normally
introduce a known pre-hijacking attack:

1. An attacker signs up with the victim's address and a password of their choosing.
2. They never verify, so they cannot sign in — the account sits dormant.
3. The victim later signs in with Google. Google asserts the address, the accounts
   are linked, and `emailVerified` becomes true.
4. The attacker's password now works on the victim's account.

**Better Auth already blocks this, and we must not undo it.**
`account.accountLinking.requireLocalEmailVerified` defaults to `true`
(`node_modules/better-auth/dist/oauth2/link-account.mjs:22`). When the existing
local user is unverified, linking is refused and the callback returns
`"account not linked"`.

So this codebase writes **no custom mitigation**. The design rule is narrower and
stricter: `requireLocalEmailVerified` is never set to `false`, and a comment in
`src/lib/auth.ts` records why, because the option is marked deprecated-pending-
removal and a future reader might otherwise "clean it up".

**The residual problem is usability, not security.** A squatted address locks the
genuine owner out of Google sign-in behind an opaque error. Two things address it:

- The callback error is translated to a real message rather than a raw code:
  "An unverified account already exists for this email address."
- Unverified accounts expire quickly (below), which releases the address.

### Expiry of unverified accounts

Users with `emailVerified = false` and `created_at` older than **24 hours** are
deleted, along with the clinic they created if it holds no clients.

24 hours rather than a week specifically because of the case above: a squatted
address should free up fast, and an unverified account has no value to lose — it
cannot sign in at all under the hard gate.

Implemented as an exported function in `cleanup.ts`, invoked opportunistically
during sign-up. No scheduler is introduced.

### Safe redirect

`src/proxy.ts` already appends `?redirect=<pathname>`; nothing reads it today.
Wiring it up naively would create an open redirect.

`resolveSafeRedirect(raw, locale, role)` returns a path only when it begins with
`/{locale}/app` for staff or `/{locale}/portal` for clients. Absolute URLs,
protocol-relative `//host` values, and backslash variants are rejected. Anything
else falls back to the role's home. Pure function, unit tested.

---

## Email

A single interface:

```ts
type Mail = { to: string; subject: string; html: string; text: string };
interface Mailer { send(mail: Mail): Promise<void> }
```

Two transports, selected by `MAIL_TRANSPORT`:

- `console` (development default) — prints the mail to the server console,
  preserving today's magic-link behaviour with zero setup.
- `resend` — sends via Resend.

If `MAIL_TRANSPORT=resend` and `RESEND_API_KEY` or `EMAIL_FROM` is missing, the app
**throws at startup**. A misconfigured mailer that silently swallows password
resets is worse than one that refuses to boot.

Three templates — verification, password reset, patient magic link — each in
Arabic and English, selected by the recipient's stored locale. Arabic mail sets
`dir="rtl"` on the HTML root: email clients inherit direction from nothing.

This also repairs the existing production failure, where `sendMagicLink` throws.

### New environment variables

`MAIL_TRANSPORT`, `RESEND_API_KEY`, `EMAIL_FROM`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET` — all documented in `.env.example`.

---

## Settings → Security

`/[locale]/app/settings/security`, guarded by `requireStaffSession`.

- Registered passkeys, with add and remove
- Whether Google is connected
- Change password — requires the current password, and revokes other sessions on
  success

**One invariant:** a user may not remove their last remaining sign-in method. If a
passkey is the only way in, its remove control is disabled and explains why.
Otherwise the page offers a two-click path to permanent lockout.

---

## Error handling and i18n

Server actions return a **message key**, never a sentence; the form resolves it
through `next-intl`. Every new key is added to `ar.json` first — it is the source
of truth and types the catalogue, so a missing English key fails the build.

Keys: `wrongCredentials`, `verifyEmailFirst`, `verificationSent`, `rateLimited`
(takes `minutes`), `emailTaken`, `resetLinkSent`, `passwordChanged`,
`lastSignInMethod`, `passkeyRegistered`, `passkeyRemoved`, `accountNotLinked`.

---

## Testing

**Pure unit tests** (no database, no browser):

- Rate-limit policy: 4 failures pass, the 5th blocks, the window expires correctly,
  remaining-minutes arithmetic
- `resolveSafeRedirect`: accepts `/ar/app/clients`; rejects `//evil.com`,
  `https://evil.com`, `/en/app` under an `ar` session, backslash variants
- Template selection by locale

**Integration tests** (test database, existing `bun test` harness):

- A failed sign-in is recorded; a successful one clears the count
- An unverified account cannot sign in; a verified one can
- Sign-up creates exactly one clinic; a Google sign-in by an existing patient
  creates none
- Removing the last sign-in method is refused
- Unverified accounts older than 24 hours are removed; recent ones are not
- A clinic with clients is never removed by the cleanup pass

**Manual verification before completion:**

- Full sign-up → email → verify → sign-in path
- A passkey registered and used on a real phone
- The whole flow in Arabic, checking RTL layout and mail direction

---

## Migration notes

- `emailAndPassword.autoSignIn` false and `requireEmailVerification` true mean
  **existing seeded accounts must have `emailVerified: true`**. `scripts/seed.ts`
  already sets it; no data migration is required for development.
- Removing `src/components/auth/` changes import paths in
  `src/app/[locale]/login`, `signup`, `client-login`, and
  `src/components/layout/sign-out-button.tsx`.
- Two new tables (`passkeys`, `auth_attempts`) require one generated migration.
- The README's auth section, including its open-sign-up warning, is rewritten to
  match. The stale "there are no features yet" claim is corrected at the same time.
