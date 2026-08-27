# Development guide

This guide covers local setup, environment files, database work, and project
checks. For the code structure, see [Architecture](architecture.md).

## Prerequisites

- [Bun](https://bun.sh/) 1.3.14 (the version pinned in `package.json`)
- PostgreSQL running locally
- Playwright browsers, only for the end-to-end suite:
  `bunx playwright install`
- Docker only if you want to run the optional OpenWA WhatsApp gateway

## First-time setup

Install dependencies:

```bash
bun install
```

Create the development and test databases:

```bash
createdb dietitian_dev
createdb dietitian_test
```

Create local environment files from the committed templates:

```bash
cp .env.example .env.local
cp .env.test.example .env.test.local
cp infra/openwa/.env.example infra/openwa/.env
```

The third command is needed only when working on WhatsApp integration. On
PowerShell, use `Copy-Item` instead of `cp` if `cp` is not available.

Generate a development authentication secret and place it in `.env.local`:

```bash
bunx @better-auth/cli@latest secret
```

Set the database up and start the app:

```bash
bun run db:setup
```

```bash
bun run dev
```

`db:setup` is the one command that brings a database to a servable state. It
runs, in the only order that works: migrate → seed the canonical food catalog →
seed the dish catalog → freeze any published plan that predates snapshots →
check readiness. It stops at the first failure and is safe to re-run.

**Migrating alone is not enough.** Every food query reads `catalog_foods`, so a
database that is migrated but not seeded looks completely healthy — the app
boots, nothing throws — and then every ingredient search returns nothing and the
dish catalog is empty, with no error anywhere saying why. `bun run db:check`
exists to catch exactly that, and `db:setup` runs it for you.

Add demo data — a clinic, clients, appointments — separately:

```bash
bun run db:seed
```

The default local URL is <http://localhost:3000>, which redirects to `/ar`.

## Environment files

| File | Purpose | Committed |
| --- | --- | --- |
| `.env.example` | Template for the Next.js app and development scripts | Yes |
| `.env.local` | Local app values and secrets | No |
| `.env.test.example` | Safe template for the test process | Yes |
| `.env.test.local` | Local test database and test-only values | No |
| `infra/openwa/.env.example` | Template for the OpenWA service | Yes |
| `infra/openwa/.env` | Local OpenWA values and secrets | No |

Do not combine `.env.local` and `.env.test.local`. The test suite truncates
tables between tests. `scripts/database-safety.ts` requires the test database
name to end in `_test` and refuses unsafe database URLs.

Deployment secrets belong in the hosting provider's environment settings, not
in another committed `.env` file.

## Common commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the development server |
| `bun run build` | Create a production build |
| `bun run lint` | Run ESLint, including design-token and RTL rules |
| `bun run typecheck` | Run TypeScript without emitting files |
| `bun run test` | Run the unit and integration suite using `.env.test.local` |
| `bun run test:e2e` | Run the Playwright end-to-end specs in `e2e/` |
| `bun run db:setup` | Migrate, seed the catalogs, and verify — the one setup command |
| `bun run db:check` | Report whether the database is in a servable state |
| `bun run db:migrate` | Apply development database migrations |
| `bun run db:migrate:test` | Apply migrations to the test database |
| `bun run db:generate` | Generate a Drizzle migration after a schema change |
| `bun run db:seed` | Seed demo data (clinic, clients, appointments) |
| `bun run db:seed:catalog` | Seed the canonical food catalog; add `--apply` to write |
| `bun run db:seed:dishes` | Seed the shipped dish catalog |
| `bun run db:build-catalog` | Regenerate `data/catalog-foods.json` from the offline USDA source |
| `bun run db:build-food-dataset` | Rebuild the offline USDA source file itself |
| `bun run db:backfill:plan-snapshots` | Report unfrozen published plans; add `--apply` to repair |
| `bun run db:reset` | Destructively rebuild the local development schema |
| `bun run db:reset:test` | Destructively rebuild the test schema |
| `bun run wa:reminders` | Process due WhatsApp reminders once |
| `bun run push:reminders` | Send due portal push notifications once |
| `bun run brand:build` | Regenerate the brand SVGs in `public/brand/` from `src/features/brand/logo.ts` |

`db:reset` is intentionally protected against production use. Still check the
active database URL before running it.

## Database changes

Database schemas live in `src/db/schema/` and generated migrations live in
`drizzle/`. For a schema change:

1. Update the relevant schema file.
2. Run `bun run db:generate`.
3. Inspect the generated SQL.
4. Run `bun run db:migrate` and `bun run db:migrate:test`.
5. Run the relevant tests, then the full verification commands.

Tenant-owned records must include a clinic boundary. Reference datasets such as
the food catalog and curated dishes are intentionally shared; see
[Architecture](architecture.md#database).

## The food catalog

`catalog_foods`, `catalog_food_aliases` and `catalog_food_portions` are the
app's own canonical catalog and the only food source any screen reads. The
legacy USDA tables `foods` and `food_aliases` were dropped in migration `0030`;
`data/usda-sr-legacy.ndjson` is kept only as an offline provenance source that
`bun run db:build-catalog` validates the committed dataset against.

The committed dataset is self-contained and checksum-protected: seeding a fresh
database does not require loading the 7,793-row USDA file. To change the
catalog, edit `data/catalog-foods.json`, run `bun run db:build-catalog` to
regenerate the derived half and the checksum, then `bun run db:seed:catalog
--apply`. The seed refuses to run on a checksum mismatch or a validation
failure, and `bun run db:check` compares the database against the committed
files rather than against a hard-coded number.

### Recipes: adjustable lines and household units

Each line of `data/dishes.json` may carry three optional fields:

| Field | Meaning |
| --- | --- |
| `primary` | This line gets a `−/+` on the board. At most three per dish. |
| `unit` | The English portion label the amount is counted in (`Loaf`, `Piece`). |
| `count` | How many of `unit`. Required with it, meaningless without it. |

`grams` stays required and authoritative. Where `unit` and `count` are given,
`bun run db:seed:dishes` checks that `count × portion.grams` matches `grams` and
**aborts the whole seed** if they disagree — a unit and a weight are two
statements of one amount, and a drift between them would put one number in the
nutrition and a different one on the card.

A staple is recorded in the state it is eaten in: recipes carry cooked rice, not
raw, because a dietitian counts spoons of cooked rice and no household unit can
be attached to a food nobody eats dry. `bun run db:check` verifies that the
marking and the units survived the seed.

## Deploying this release: a clean database

**This release intentionally cuts over on a clean, disposable database.** There
are no real users and no production data to preserve, so the first deployment is
`bun run db:setup` against an empty database rather than an upgrade.

> **Warning.** The migration chain up to `0030` must **not** be used to upgrade a
> populated legacy database. `0030` drops `foods` and `food_aliases` and sets
> `dish_ingredients.catalog_food_id` NOT NULL, and drizzle-kit applies all
> pending migrations in a single transaction — so it cannot pause to seed the
> catalog before the NOT NULL constraint is enforced, and a database with
> unmapped ingredient rows fails and rolls back the whole chain. Upgrading a
> populated legacy production database is **not supported**; it would need a
> separate, purpose-written migration path that does not exist.

The development database was reset on this basis on 2026-08-18. If you have a
local database from before the catalog work, reset and rebuild it:

```bash
bun run db:reset
```

```bash
bun run db:setup
```

## Tests and verification

Before handing off a change, run:

```bash
bun run lint
bun run typecheck
bun run test
```

Some tests require the PostgreSQL test database to exist and have current
migrations. If needed, run `bun run db:migrate:test` first.

`bun run test` deliberately ignores `e2e/**`. The Playwright specs are a
separate suite: they drive a real browser against a running app, so run them
with `bun run test:e2e` after `bunx playwright install`. Their setup lives in
`e2e/global-setup.ts` and `e2e/fixtures.ts`, and they read the same test
database as the rest of the suite.

## Optional integrations

- WhatsApp/OpenWA: follow [`infra/openwa/README.md`](../infra/openwa/README.md).
- Web Push (client portal notifications): generate a VAPID keypair once with
  `bunx web-push generate-vapid-keys --json` and put it in `.env.local` as
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`. Leave both unset to
  keep the feature off. Rotating the pair invalidates every stored
  subscription. The scheduled half is `bun run push:reminders`, or
  `POST /api/portal/push-reminders` behind `PUSH_CRON_SECRET`; run it every few
  minutes. Testing on a phone needs HTTPS, and on iOS the portal must be
  installed to the Home Screen (16.4+).
- Email: the default `MAIL_TRANSPORT=console` prints development messages. Set
  Resend values only when testing real delivery.
- AI weekly plans: `LLM_TRANSPORT=console` uses the local catalog without an API
  key. `LLM_TRANSPORT=openai` requires `OPENAI_API_KEY`.
- Google sign-in: leave both Google OAuth variables empty to hide the button in
  local development.
