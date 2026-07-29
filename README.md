# Dietitian Clinic Management

Foundation build of a bilingual (Arabic / English), RTL-first dietitian practice
management app.

The stack, internationalisation, authentication and folder structure are in
place, plus two feature modules: **clients** (`src/features/clients/`) and
**meal plans** (`src/features/meal-plans/`). Everything else — appointments,
payments — is still to be built.

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

Apply the migrations, then start the dev server:

```bash
bun run db:migrate
```

```bash
bun run dev
```

The app is at <http://localhost:3000>, which redirects to `/ar`.

### Scripts

| Command                       | What it does                                                          |
| ----------------------------- | --------------------------------------------------------------------- |
| `bun run dev`                 | Next dev server (Next itself still runs on Node)                       |
| `bun run build`               | Production build                                                       |
| `bun run start`               | Serve the production build                                             |
| `bun run lint`                | ESLint, including the RTL rule below                                   |
| `bun run typecheck`           | `tsc --noEmit`                                                         |
| `bun run test`                | `bun test` — needs `.env.test.local`, see below                        |
| `bun run db:generate`         | Generate a migration from the Drizzle schema into `drizzle/`           |
| `bun run db:migrate`          | Apply pending migrations                                               |
| `bun run db:seed`             | Staff account, sample clients, the food table and one sample meal plan |
| `bun run db:seed:foods`       | Just the `foods` reference table                                       |
| `bun run db:build-food-dataset` | Regenerate `data/usda-sr-legacy.ndjson` from USDA (rarely needed)     |
| `bun run db:reset`            | **Destructive.** Drop `public`, replay migrations. Local only.         |

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

`clients/` and `meal-plans/` follow this shape. `appointments/`, `payments/` and
the rest get added alongside them as they are built.

Two conventions worth copying from both:

- `queries.ts` and `mutations.ts` import nothing from Next.js, so `bun test` can
  call them directly — a `"use server"` module calling `revalidatePath` cannot
  run outside a request scope. `actions.ts` is the thin layer that adds the
  Next.js concerns on top.
- A client component importing a type from `queries.ts` must use a top-level
  `import type`, not an inline `import { type … }`. Both erase in TypeScript, but
  only the former keeps the module out of the bundler's client graph — with the
  inline form the bundler follows it to `@/db` and tries to bundle `postgres`
  for the browser.

### Layout

```
src/
  app/
    [locale]/
      layout.tsx              # dir + fonts + next-intl provider (root layout)
      page.tsx                # landing
      login/page.tsx
      app/                    # dietitian area — staff session required
        layout.tsx            # sidebar shell + guard
        page.tsx              # dashboard placeholder
      portal/                 # client area — client session required
        layout.tsx            # guard
        page.tsx              # placeholder
    api/auth/[...all]/route.ts  # the only HTTP endpoint, owned by Better Auth
    globals.css
  components/
    ui/                       # shadcn primitives
    layout/                   # sidebar, header, locale switcher
    auth/                     # login forms + their server actions
  db/
    index.ts                  # drizzle client
    schema/
      index.ts                # barrel — the entry point drizzle-kit reads
      auth.ts                 # Better Auth tables (the only tables)
  features/                   # empty; one folder per feature
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
endpoint in the app. Everything the UI does goes through server actions
(`src/components/auth/actions.ts`).

Staff and clients have **separate sign-in pages**, because they authenticate in
completely different ways:

| Page                       | Who        | How                        |
| -------------------------- | ---------- | -------------------------- |
| `/[locale]/login`          | Staff      | Email + password           |
| `/[locale]/signup`         | Staff      | Creates a staff account    |
| `/[locale]/client-login`   | Clients    | Single-use magic link      |

Both `src/proxy.ts` and `src/lib/session.ts` send an anonymous visitor to the
page matching the area they asked for, so a client is never bounced to a
password form they have no password for.

> ### ⚠️ Staff sign-up is currently open to anyone
>
> `/[locale]/signup` has no invite code, no allow-list and no rate limit, and
> `role` defaults to `staff`. Anyone who reaches that URL gets an account with
> full access to every client's medical notes, allergies and contact details.
>
> This is fine on a development machine. **Gate it before deploying anywhere
> reachable from the internet** — check an invite code inside `signUpStaff` in
> `src/components/auth/actions.ts`, or allow sign-up only while zero staff
> accounts exist.

- **Dietitian and staff** sign in with email + password.
- **Clients** sign in with a magic link: single use, 15-minute expiry, exchanged
  for a 60-day session cookie. Tokens live in the `verifications` table and are
  deleted on first redemption. `disableSignUp` is on, so a client row must exist
  before a link can be requested.
  Magic links are **scaffolding**: `sendMagicLink` logs the URL to the console in
  development and throws in production. Wire a transactional email provider in
  `src/lib/auth.ts` before going live.
- **Locale is stored on the session** (`sessions.locale`), captured from the
  request when the session is created.

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

---

## Food composition data

Meal plans are costed against **USDA FoodData Central, SR Legacy (April 2018)** —
7,793 generic foods with energy, the three macros, and nine further nutrients.
It is a work of the US federal government and therefore public domain
(17 U.S.C. § 105).

SR Legacy was chosen over the other FoodData Central datasets because it is the
only one that is both broad and clean: Foundation Foods holds ~300 items, and
Branded Foods holds ~1.9M packaged US supermarket SKUs with manufacturer-declared
numbers. SR Legacy is generic whole foods — "Egg, whole, raw, fresh" — which is
what a dietitian actually writes a plan in.

The extract lives at **`data/usda-sr-legacy.ndjson`** and is committed, so
`bun run db:seed` works offline and seeds identical rows on every machine. One
food per line, so it stays reviewable in a diff.

- Regenerate it with `bun run db:build-food-dataset` (downloads ~6 MB from USDA,
  caches it under `node_modules/.cache/`, and should produce a no-op diff).
- Load it with `bun run db:seed:foods`. Idempotent via `foods.fdc_id`, so a
  re-seed updates rows in place and existing meal plan items keep pointing at
  the same foods.

Two rules the code depends on:

- **Every nutrient column is per 100 g.** Portions are converted at the point of
  use, in `scaleNutrients`. Nothing is ever stored per-serving.
- **NULL means "not measured", never zero.** Only the macros are present on all
  7,793 foods; fibre, sugars and the minerals are present on 77–99% of them.
  Totals skip a NULL and count it in `unmeasured`, and the analysis panel marks
  any such total as a floor rather than an answer.

`foods` is the one domain table that is **not** scoped to a clinic — food
composition is a physical fact, not a tenant's data.

---

## Tests

`bun test` needs its own database, because the suite truncates every table
between tests:

```bash
createdb dietitian_test
```

Then create `.env.test.local` (git-ignored) in the repo root:

```
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dietitian_test
```

It must **not** be the same database as `DATABASE_URL`, and its name must end in
`_test` — `scripts/database-safety.ts` refuses otherwise, and `tests/helpers.ts`
re-checks `current_database()` on the server immediately before the TRUNCATE.

Apply migrations to it with `bun run db:migrate:test`.
