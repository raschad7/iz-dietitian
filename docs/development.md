# Development guide

This guide covers local setup, environment files, database work, and project
checks. For the code structure, see [Architecture](architecture.md).

## Prerequisites

- [Bun](https://bun.sh/) 1.3.14 (the version pinned in `package.json`)
- PostgreSQL running locally
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

Apply migrations and start the app:

```bash
bun run db:migrate
bun run dev
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
| `bun run test` | Run the test suite using `.env.test.local` |
| `bun run db:migrate` | Apply development database migrations |
| `bun run db:migrate:test` | Apply migrations to the test database |
| `bun run db:generate` | Generate a Drizzle migration after a schema change |
| `bun run db:seed` | Seed the development database |
| `bun run db:seed:demo` | Give one existing client a published week and adherence |
| `bun run db:reset` | Destructively rebuild the local development schema |
| `bun run wa:reminders` | Process due WhatsApp reminders once |

`db:reset` is intentionally protected against production use. Still check the
active database URL before running it.

`db:seed:demo` is for reviewing the portal's Home and "خطتي" screens with real
content. It decorates one named client — `سعيد سالم` by default, or
`bun run db:seed:demo "<name>"` — and creates nobody, deletes nothing it did not
write, and leaves every other client's plan and progress alone. Re-running it is
safe and is how you pick up an edit to `scripts/demo-menu.ts`; a plan for that
week the script did not write is reported and left untouched.

## Database changes

Database schemas live in `src/db/schema/` and generated migrations live in
`drizzle/`. For a schema change:

1. Update the relevant schema file.
2. Run `bun run db:generate`.
3. Inspect the generated SQL.
4. Run `bun run db:migrate` and `bun run db:migrate:test`.
5. Run the relevant tests, then the full verification commands.

Tenant-owned records must include a clinic boundary. Reference datasets such as
foods and curated dishes are intentionally shared; see
[Architecture](architecture.md#database).

## Tests and verification

Before handing off a change, run:

```bash
bun run lint
bun run typecheck
bun run test
```

Some tests require the PostgreSQL test database to exist and have current
migrations. If needed, run `bun run db:migrate:test` first.

## Optional integrations

- WhatsApp/OpenWA: follow [`infra/openwa/README.md`](../infra/openwa/README.md).
- Email: the default `MAIL_TRANSPORT=console` prints development messages. Set
  Resend values only when testing real delivery.
- AI weekly plans: `LLM_TRANSPORT=console` uses the local catalog without an API
  key. `LLM_TRANSPORT=openai` requires `OPENAI_API_KEY`.
- Google sign-in: leave both Google OAuth variables empty to hide the button in
  local development.
