# Dietitian Clinic Management

Bilingual (Arabic / English), RTL-first dietitian practice management app.

The foundation — stack, internationalisation, authentication, folder structure —
is in place, and the first domain feature is built on top of it: **clients**
(`src/features/clients/`), the clinic's patient roster. The database now holds
`clinics`, `clients`, `passkeys` and `auth_attempts` alongside the four tables
Better Auth requires.

---

## Stack

| Concern          | Choice                                            |
| ---------------- | ------------------------------------------------- |
| Framework        | Next.js 16 (App Router) + TypeScript, strict       |
| Styling          | Tailwind CSS v4 + shadcn/ui                        |
| Database         | PostgreSQL (local install, no Docker)              |
| ORM              | Drizzle ORM + drizzle-kit, `postgres` (postgres.js) |
| Validation       | Zod + drizzle-zod                                  |
| i18n             | next-intl                                          |
| Auth             | Better Auth                                        |
| Runtime / PM     | Bun (pinned via `packageManager`)                  |
| Data access      | Server actions only — no REST, no tRPC             |

---

## Getting started

Requires [Bun](https://bun.sh) and a local PostgreSQL server. Bun is both the
package manager and the script runner; there is no `tsx` or `ts-node` in this
project because Bun executes TypeScript directly.

```bash
bun install
```

Create the database (PostgreSQL must be installed and running locally):

```bash
createdb dietitian_dev
```

Copy the environment template and fill it in:

```bash
cp .env.example .env.local
```

Generate a real auth secret:

```bash
bunx @better-auth/cli@latest secret
```

Development needs nothing beyond that — the rest of `.env.example` has working
defaults or is optional:

| Variable                              | Needed for                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `MAIL_TRANSPORT`                       | Defaults to `console`, which prints staff verification/reset links to the server console. Set to `resend` in production. Only staff email ever depends on this — the client portal sends no mail at all. |
| `RESEND_API_KEY`, `EMAIL_FROM`         | Only read when `MAIL_TRANSPORT=resend`.                                     |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in for staff. Leave both blank locally — the Google button simply does not render when either is missing. |

Apply the migrations, then start the dev server:

```bash
bun run db:migrate
```

```bash
bun run dev
```

The app is at <http://localhost:3000>, which redirects to `/ar`.

### Scripts

| Command               | What it does                                                  |
| --------------------- | ------------------------------------------------------------- |
| `bun run dev`         | Next dev server (Next itself still runs on Node)               |
| `bun run build`       | Production build                                               |
| `bun run start`       | Serve the production build                                     |
| `bun run lint`        | ESLint, including the RTL rule below                           |
| `bun run typecheck`   | `tsc --noEmit`                                                 |
| `bun run db:generate` | Generate a migration from the Drizzle schema into `drizzle/`   |
| `bun run db:migrate`  | Apply pending migrations                                       |
| `bun run db:seed`     | `scripts/seed.ts` — seeds a staff account and sample clients    |
| `bun run db:reset`    | **Destructive.** Drop `public`, replay migrations. Local only. |

Only `bun.lock` is committed; `package-lock.json`, `pnpm-lock.yaml` and
`yarn.lock` are git-ignored so a stray `npm install` cannot fork the dependency
tree.

---

## Architecture rule

> **Business logic lives in `src/features/<feature>/`, never in `src/app/` route
> files. Route files compose feature components and nothing more.**

A route file resolves its params, calls a session guard, and renders. That is
the whole job. Anything that decides, validates, queries or mutates belongs to a
feature.

```
src/features/<feature>/
  actions.ts      # "use server" — every mutation for this feature
  queries.ts      # read paths (server-only)
  schema.ts       # Zod input schemas, derived via drizzle-zod where possible
  components/     # UI, composed by route files
```

`src/features/` currently holds `auth/` and `clients/`. `plans/`, `payments/` and
the rest get added there as they are built.

### Layout

```
src/
  app/
    [locale]/
      layout.tsx              # dir + fonts + next-intl provider (root layout)
      page.tsx                # landing
      login/page.tsx
      signup/page.tsx
      client-login/page.tsx
      forgot-password/page.tsx
      reset-password/page.tsx
      app/                    # dietitian area — staff session required
        layout.tsx            # sidebar shell + guard
        page.tsx              # dashboard
        settings/security/page.tsx  # passkeys, password, linked providers
        clients/               # the clients feature's routes
      portal/                 # client area — client session required
        layout.tsx            # guard only
        set-password/page.tsx # forced password change, outside (secured)
        (secured)/            # everything except set-password
          layout.tsx          # adds the must-change-password redirect
          page.tsx            # placeholder
    api/auth/[...all]/route.ts  # the only HTTP endpoint, owned by Better Auth
    globals.css
  components/
    ui/                       # shadcn primitives
    layout/                   # sidebar, header, locale switcher
  db/
    index.ts                  # drizzle client
    schema/
      index.ts                # barrel — the entry point drizzle-kit reads
      auth.ts                 # Better Auth's four tables, plus passkeys and auth_attempts
      clinics.ts               # the tenant boundary
      clients.ts                # the clients feature's table
  features/
    auth/                     # forms, server actions, rate limiting, redirect safety, cleanup
    clients/                  # the roster feature
  i18n/
    routing.ts                # locales, default, direction
    navigation.ts             # locale-aware Link / redirect / useRouter
    params.ts                 # validates the [locale] segment
    request.ts                # per-request messages, time zone, formats
    messages/{ar,en}.json
  lib/
    auth.ts                   # Better Auth server config
    auth-client.ts            # browser client
    auth-constants.ts         # TTLs shared by server and client
    session.ts                # requireStaffSession / requireClientSession
    mail/                     # sendMail seam — console and resend transports
    format.ts                 # locale-aware number/date/currency
    utils.ts                  # cn()
  types/
  proxy.ts                    # request middleware (see note below)
drizzle/                      # generated migrations
eslint-rules/                 # the logical-properties lint rule
scripts/
  seed.ts
  db-reset.ts
```

`src/proxy.ts` is the request middleware. Next.js 16 renamed the `middleware.ts`
file convention to `proxy.ts`; the API and behaviour are unchanged.

---

## Internationalisation and RTL

Arabic and English are both first class. Arabic is the default: a visitor who
expresses no preference gets `ar`.

- **`ar.json` is the source of truth.** `src/types/i18n.d.ts` types the message
  catalogue from `ar.json`, so a key that exists only in `en.json` is a type
  error, and a key added to Arabic shows up as missing wherever it is used.
  `en.json` is complete, not a stub.
- **Every URL carries its locale** (`localePrefix: 'always'`), so `/ar/login` and
  `/en/login` are equally addressable and cacheable.
- **Locale detection** happens in `src/proxy.ts` via next-intl: `NEXT_LOCALE`
  cookie first, then `Accept-Language`, then `ar`.
- **`dir` is derived, never hardcoded.** `src/app/[locale]/layout.tsx` sets
  `<html lang={locale} dir={getLocaleDirection(locale)}>`. `getLocaleDirection`
  in `src/i18n/routing.ts` is the only place a direction is written down.

### Logical properties only — enforced

Physical left/right utilities are a **lint error**:

| Banned                       | Use                       |
| ---------------------------- | ------------------------- |
| `pl-*` / `pr-*`              | `ps-*` / `pe-*`           |
| `ml-*` / `mr-*`              | `ms-*` / `me-*`           |
| `text-left` / `text-right`   | `text-start` / `text-end` |
| `left-*` / `right-*`         | `start-*` / `end-*`       |
| `border-l*` / `border-r*`    | `border-s*` / `border-e*` |

The rule lives in `eslint-rules/logical-properties.mjs` and is wired up as
`rtl/no-physical-properties`. It understands variant prefixes (`md:pl-8`),
negative values (`-ml-2`), template literals, and `cn()` / `clsx` / `cva`
arguments. shadcn/ui is configured with `"rtl": true` in `components.json`, so
generated primitives already use logical properties.

A `pl-4` looks right in English and is silently wrong in Arabic. That is why it
is an error and not a warning.

### Numbers, dates and money

- **Western digits (0-9) in both locales.** `src/lib/format.ts` passes
  `ar-u-nu-latn-ca-gregory` / `en-u-nu-latn-ca-gregory` to every `Intl`
  constructor, and forces `numberingSystem: 'latn'` and `calendar: 'gregory'`.
  Never pass a bare `'ar'` to an `Intl` constructor — the numbering system would
  then depend on the runtime's CLDR defaults.
- **Gregorian calendar** in both locales.
- **Timestamps are stored in UTC** (`timestamptz`) and rendered in
  `Asia/Hebron`, which is set once as `DISPLAY_TIME_ZONE` and handed to next-intl
  in `src/i18n/request.ts`.
- Inside message files, use the **named formats** (`{amount, number, currency}`,
  `{when, dateTime, date}`) declared in `intlFormats`. A bare `{n, number}`
  bypasses the latn/Gregorian settings.

A locale switcher is mounted in the root layout in development only
(`DevLocaleSwitcher`); production areas get their own switcher in the header.

---

## Auth

Better Auth, mounted at `src/app/api/auth/[...all]/route.ts` — the only HTTP
endpoint in the app. Almost everything the UI does still goes through server
actions (`src/features/auth/actions.ts`) that call `auth.api.*()` directly;
passkey registration and sign-in are the exception (see Rate limiting below).

Staff and clients have **separate sign-in pages**, because they authenticate in
completely different ways:

| Page                       | Who        | How                                          |
| -------------------------- | ---------- | --------------------------------------------- |
| `/[locale]/login`          | Staff      | Passkey, Google, or email + password (in that order) |
| `/[locale]/signup`         | Staff      | Creates a staff account, gated by email verification |
| `/[locale]/client-login`   | Clients    | Username + password, issued by their dietitian |
| `/[locale]/forgot-password`, `/[locale]/reset-password` | Staff | Password reset |

Both `src/proxy.ts` and `src/lib/session.ts` send an anonymous visitor to the
page matching the area they asked for, so a client is never bounced to a
password form they have no password for.

Sign-up at `/[locale]/signup` is deliberately open — no invite code, no
allow-list. This is a SaaS: anyone who signs up gets their own clinic
(`clinics` row) and sees only their own clients, so an open door does not cross
a tenant boundary. What stops it from being an abuse vector is the rest of this
section: the account cannot sign in until its email is verified, sign-up itself
is rate-limited per IP, and an account that never verifies is deleted after 24
hours.

### Three ways in, one hard gate

Staff can sign in with a **passkey** (WebAuthn, via `@better-auth/passkey`),
**Google**, or **email + password** — shown on the login page in that order,
passkey first because it is the fastest and safest. The Google button only
renders when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set; leave them
blank locally and it simply does not appear.

Email + password sits behind a hard verification gate: `autoSignIn` is off and
`requireEmailVerification` is on. Signing up creates the `user` row but issues
no session — the person must click the link mailed to them before they can
sign in at all. Verification links last 1 hour.

Password reset lives at `/[locale]/forgot-password` and
`/[locale]/reset-password`. The request step **always** answers "if that
address has an account, we sent a link," regardless of whether it does — the
same opacity as the sign-in error, so the form cannot be used to test which
addresses exist. Completing a reset revokes every other session on the
account, on the theory that a reset is what someone does when they believe
another person holds their password.

**Settings → Security** (`/[locale]/app/settings/security`) lets a signed-in
staff member add and remove passkeys and see which methods (password, Google,
each passkey) are connected to their account. Removing a method is refused
when it is the account's only remaining way to sign in — otherwise the page
offers a two-click path to permanent lockout.

**OAuth account linking.** `account.accountLinking.requireLocalEmailVerified`
is left at its Better Auth default of `true`, and it must never be set to
`false`. That default is what blocks OAuth pre-hijacking: without it, an
attacker could sign up with a victim's address, never verify it, and wait for
the victim to sign in with Google — which would otherwise link the two
accounts and hand the attacker a working password on the victim's account.
Better Auth refuses that link instead. Unverified accounts are deleted after
24 hours partly for this reason: an address squatted by an unverified sign-up
would otherwise block its real owner from using Google until the squatter
expired on its own.

### Transactional email

`src/lib/mail/` is a small seam: one `sendMail(kind, to, locale, variables)`
function, and a transport chosen by `MAIL_TRANSPORT`:

- `console` (the default) prints the mail to the server console and needs no
  account, so development needs nothing configured.
- `resend` sends for real, and requires `RESEND_API_KEY` and `EMAIL_FROM`.

Mail is templated in Arabic and English (`src/lib/mail/templates.ts`); the
Arabic template sets `dir="rtl"` on the mail document, same as the app itself.

Mail now serves **staff only** — email verification and password reset.
Clients never receive mail: portal accounts are issued credentials directly
(see below), and their synthetic `@portal.invalid` address could not receive
anything even if something tried to send it.

**Locale is stored on the session** (`sessions.locale`), captured from the
request when the session is created.

### Client portal access

Clients do not sign up and do not receive email — magic links were tried
first and dropped, because `clients.email` is nullable and deliberately **not**
unique (walk-ins, children, and family members sharing one inbox are normal),
so a meaningful share of clients had no address a link could reach. Instead a
dietitian issues each client a **username and a temporary password** from the
client's detail page (`src/features/clients/portal-credentials.ts`).

- **Username suggestion, human-edited.** The app transliterates the client's
  name from Arabic to Latin (`src/features/clients/transliterate.ts`) and
  proposes it as a username — `إبراهيم نصّار` → `abrahym-nsar-8201` — which the
  dietitian can edit before the account is created. Arabic script omits short
  vowels, so a mechanical mapping is necessarily approximate (`أحمد` → `ahmd`,
  not `ahmad`); no algorithm recovers the missing vowels, so a human glancing
  at the suggestion fixes it in seconds instead.
- **Shown once.** The username and temporary password are returned only from
  the issuing call and displayed once. They are never stored in the clear and
  never retrievable again — a lost password is a re-issue, not a lookup.
- **Must be replaced at first sign-in.** `users.must_change_password` gates
  the portal (see the route-group note below). Once the client sets their own
  password, nobody at the clinic knows it — staff cannot sign in as a patient,
  and actions taken in the portal are genuinely the patient's.
- **No self-service reset.** Clients have no email, so there is nothing to
  send a reset link to. Forgetting a password means the dietitian re-issues:
  a new temporary password is generated and shown once, and the client's
  **existing sessions are revoked**, on the same theory as a staff password
  reset — the old credentials may be in someone else's hands.
- **The synthetic email.** `users.email` is `NOT NULL UNIQUE`, so every
  account needs an address even when the person has none. Each portal account
  gets a non-routable `username@portal.invalid` address (`.invalid` is
  reserved by RFC 2606 and can never resolve) — satisfying the constraint
  without colliding across a shared family inbox, and guaranteeing that
  nothing in the system can ever mail a patient. The client's real address,
  when they have one, stays on `clients.email` for contact only; it is never
  used to sign in.
- **Created already verified.** Portal accounts are created with
  `emailVerified: true`. This is mandatory, not a shortcut, for two reasons:
  `requireEmailVerification` is global, so an unverified account cannot sign
  in at all and a `.invalid` address can never be verified by any real
  process; and `purgeUnverifiedAccounts()` deletes unverified accounts after
  24 hours, which would silently delete portal access the next day.
  Verification means "this address was proven to belong to this person" — a
  `.invalid` address belongs to nobody and can receive nothing, so there is
  nothing to prove and no security given up by marking it verified.
- **Password minimums differ: 6 for clients, 10 for staff.** Better Auth
  exposes a single global `minPasswordLength`, so it cannot express two
  minimums — the global floor is the client minimum, and 10 is enforced
  separately in the staff Zod schema (`src/features/auth/schema.ts`). Six is
  defensible only in combination with the portal rate limit below and a
  common-password blocklist (`src/features/auth/password-policy.ts`):
  throttling defeats brute force, but it does nothing about a client typing
  `123456`, which is guessed on the first attempt.

#### The `(secured)` route group

`/[locale]/portal/` is split into two layouts: `portal/layout.tsx`
authenticates and nothing more, while `portal/(secured)/layout.tsx` adds the
`mustChangePassword` redirect on top. Route groups contribute nothing to the
URL, so `/portal` still resolves to `(secured)/page.tsx`, while
`/portal/set-password` sits outside the group and is reached through the outer
layout alone. **This split matters: moving the `mustChangePassword` check up
into `portal/layout.tsx` would lock every client out permanently** — a nested
layout wraps its parent rather than replacing it, so `set-password` would
inherit the redirect and bounce to itself forever, with no page left to
un-gate it.

### Rate limiting is ours, not Better Auth's

This is the one piece of this section worth reading even if you skim the rest.
Better Auth ships a `rateLimit` option, and turning it on here would **look**
like protection and provide **none**. Its limiter runs inside the router's
`onRequest` hook, which only fires for requests that pass through the HTTP
handler at `/api/auth/[...all]`. Every auth call in this app — sign-in,
sign-up, password reset, verification resend, portal sign-in — is a direct
`auth.api.*()` call from a server action, and a server action never reaches
that router. Passkey registration and sign-in are the one exception: WebAuthn
has to run in the browser, so that path does go over HTTP and is genuinely
covered by Better Auth's own limiter.

Everything else is rate-limited at the server-action layer instead
(`src/features/auth/rate-limit.ts`), against an `auth_attempts` table:

| Action               | Per email         | Per IP           |
| --------------------- | ------------------ | ----------------- |
| Sign-in                | 5 / 15 min         | 20 / 15 min       |
| Sign-up                | —                  | 3 / hour          |
| Password reset         | 3 / hour           | 10 / hour         |
| Verification resend    | 3 / hour           | 10 / hour         |
| Portal sign-in         | 5 / 15 min (per username) | 20 / 15 min |

Portal sign-in reuses the same `email` column, keyed by whichever username was
submitted — there is no email involved, but the table and the check did not
need a second column to say "per identifier". This one is load-bearing rather
than defensive: a client password can be as short as six characters, and
throttling is precisely what makes that length defensible. Loosening it
without also raising the client password minimum would quietly make every
portal account guessable.

Two details that matter:

- Attempts are recorded for email addresses that **do not exist**, on purpose.
  Skipping them would make a lockout response itself prove an account exists —
  reintroducing the enumeration leak the vague sign-in error is there to close.
- The IP comes from `x-forwarded-for`, which is **forgeable** unless a trusted
  proxy sits in front of the app and strips client-supplied values. Treat the
  per-IP limit as defence in depth; the per-email limit is the control that
  actually holds.

### Route protection

Two layers, on purpose:

1. `src/proxy.ts` does an optimistic cookie check and bounces anonymous requests
   for `/[locale]/app/**` and `/[locale]/portal/**` to `/[locale]/login`. It does
   not validate the cookie — that is all that is safe to do in middleware.
2. The area layouts call `requireStaffSession` / `requireClientSession`
   (`src/lib/session.ts`), which hit the database, validate the session and
   compare roles. **This is the authoritative check.** A signed-in user in the
   wrong area is redirected to their own.

Add a new protected area by adding its segment to `PROTECTED_AREAS` in
`src/proxy.ts` *and* calling a guard in its layout. The guard is what enforces;
the proxy is just a fast path.

---

## Database conventions

For every table added from here on:

- **snake_case** for table and column names. Drizzle is configured with
  `casing: 'snake_case'` in both `src/db/index.ts` and `drizzle.config.ts`, so
  camelCase keys map automatically — but write the column name explicitly
  anyway, so the SQL is readable from the schema file.
- **English identifiers only.** Arabic belongs in message catalogues and in
  user-entered data, never in an identifier.
- **`gen_random_uuid()` primary keys**:
  ```ts
  id: uuid('id').primaryKey().defaultRandom(),
  ```
  `gen_random_uuid()` is built into PostgreSQL core since v13, so no extension
  is required.
- **`created_at` and `updated_at` on every table**, as `timestamptz`:
  ```ts
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ```
- Store instants in **UTC**; convert to `Asia/Hebron` only when rendering.

The Better Auth tables in `src/db/schema/auth.ts` are the one exception to the
UUID rule: Better Auth generates its own text primary keys.

Workflow: edit `src/db/schema/<feature>.ts` → re-export from
`src/db/schema/index.ts` → `bun run db:generate` → review the SQL in `drizzle/`
→ `bun run db:migrate`. Never hand-edit a generated migration that has already
been applied.

Note: drizzle-kit runs its config under Node, and Bun only injects `.env.local`
into its own runtime. `drizzle.config.ts` therefore loads the env file itself.
