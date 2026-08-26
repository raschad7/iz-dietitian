# Enzyme — dietitian clinic management

**Enzyme** (Arabic: **إنزيم**) is a bilingual Arabic/English, RTL-first
application for dietitian clinics. It brings the staff workflow and the client
experience into one product: *one platform for clients, nutrition plans and
appointments.*

The current MVP includes client management, appointment booking, dashboards,
AI-assisted weekly meal planning, a controlled food and dish catalog, a client
portal, and optional WhatsApp automation. See
[MVP product scope](docs/product-scope.md) for the exact boundary.

> The product was previously called **Qiwam / قوام**. Design records under
> `docs/superpowers/` and `.impeccable/` are dated archives and still use the
> old name; they describe decisions as they were made and are not rewritten.

## Stack

| Area | Choice |
| --- | --- |
| Application | Next.js 16 App Router, React 19, strict TypeScript |
| Runtime and package manager | Bun 1.3.14 |
| UI | Tailwind CSS v4, shadcn (`base-nova` style) on Base UI primitives |
| Icons | lucide, reached through the local `Icon` registry |
| Database | PostgreSQL with Drizzle ORM |
| Validation | Zod and drizzle-zod |
| Authentication | Better Auth (password, passkeys, optional Google) |
| Localization | next-intl; Arabic is the default locale |
| Tests | `bun test` for unit and integration, Playwright for e2e |
| Optional integrations | OpenWA, Resend, OpenAI, Google OAuth |

## Quick start

You need Bun and a local PostgreSQL server. Docker is needed only for the
optional WhatsApp gateway.

```bash
bun install
```

```bash
createdb dietitian_dev
createdb dietitian_test
cp .env.example .env.local
cp .env.test.example .env.test.local
```

Generate a real development auth secret and put it in `.env.local`:

```bash
bunx @better-auth/cli@latest secret
```

Bring the database to a servable state, then start the app:

```bash
bun run db:setup
```

```bash
bun run dev
```

`db:setup` is the one command that gets a database working: it migrates, seeds
the canonical food catalog, seeds the dish catalog, freezes any pre-snapshot
published plan, and checks readiness. **Migrating alone is not enough** — a
migrated but unseeded database boots cleanly and then returns nothing from every
ingredient search. Run `bun run db:migrate:test` for the test database, and
`bun run db:seed` for demo data (a clinic, clients, appointments).

The app opens at <http://localhost:3000> and redirects to the Arabic route
at `/ar`.

For PowerShell setup commands, optional services, and environment-file details,
follow the [development guide](docs/development.md).

## Essential commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the development server |
| `bun run lint` | Run ESLint, including the design-token and RTL rules |
| `bun run typecheck` | Check TypeScript |
| `bun run test` | Run tests against the separate test database |
| `bun run test:e2e` | Run the Playwright end-to-end suite |
| `bun run build` | Create a production build |
| `bun run db:setup` | Migrate, seed the catalogs, and verify |
| `bun run db:check` | Report whether the database is in a servable state |
| `bun run db:generate` | Generate a migration from schema changes |
| `bun run db:migrate` | Apply development migrations |
| `bun run db:seed` | Seed local demo data |
| `bun run brand:build` | Regenerate the brand SVGs in `public/brand/` |

More scripts and database safety guidance are in
[Development](docs/development.md#common-commands).

## Repository map

```text
src/app/           Routes, layouts, and external HTTP endpoints
src/features/      Business logic and feature-specific UI
src/components/    Shared UI and application layout components
src/db/            Drizzle client and schemas
src/i18n/          Arabic/English routing and messages
src/lib/           Cross-feature infrastructure
drizzle/           Generated SQL migrations
data/              Food and curated dish datasets
scripts/           Setup, seeding, dataset, and maintenance scripts
public/            Static assets, including the brand SVGs
e2e/               Playwright specs
tests/             Shared test setup and helpers
infra/openwa/      Optional WhatsApp gateway setup
docs/              Development, architecture, product, and design guidance
design-prototypes/ Standalone HTML studies; not production code
```

The main architecture rule is:

> Business logic belongs in `src/features/<feature>/`, not in `src/app/` route
> files. Routes apply guards, load data, and compose feature components.

Read [Architecture](docs/architecture.md) before changing those boundaries.

## Branding

The mark is a leaf carrying two seeds, beside the Arabic wordmark. Its path data
lives once, in [`src/features/brand/logo.ts`](src/features/brand/logo.ts),
because the same shapes are drawn in four places that cannot share a React
component — the in-app lockup, the PWA icon route, the Open Graph card, and the
standalone files under `public/brand/`. The matching CSS values are
`--brand-leaf`, `--brand-seed`, and `--brand-wordmark` in
[`src/app/globals.css`](src/app/globals.css); if one side changes, change both.

The brand green `#75CF48` is also `--primary`, so the logo and every primary
button in the app are one colour. There is one green family — never pin a green
hex at a call site.

## Documentation

- [Development](docs/development.md): setup, environment files, commands,
  migrations, tests, seeding, and optional integrations
- [Architecture](docs/architecture.md): feature boundaries, data flow,
  authentication, clinic scoping, database conventions, and integrations
- [MVP product scope](docs/product-scope.md): what is included now and what is
  intentionally outside the first release
- [Design system](docs/design-system.md): the authoritative UI contract —
  components, tokens, typography, shapes, accessibility, and RTL
- [OpenWA setup](infra/openwa/README.md): WhatsApp gateway setup and operation

Two shadcn documents — [migration](docs/shadcn-migration.md) and
[replacement map](docs/shadcn-replacement-map.md) — record how the component
layer reached its current state. They are historical working notes, not a
to-do list.

Feature design records under `docs/superpowers/specs/` explain major decisions
and failure modes. They are useful when changing that feature, but they are not
required reading for normal onboarding.

## Releases

The version in `package.json` is the number the app shows in its settings
footer, read through [`src/lib/version.ts`](src/lib/version.ts). It is bumped
automatically by [`.github/workflows/release.yml`](.github/workflows/release.yml)
when a pull request merges into `main`: `release:major` and `release:minor`
labels choose the bump, no label means a patch, and `release:skip` merges
without touching it. Release notes are generated by GitHub from the merged pull
requests — see [`CHANGELOG.md`](CHANGELOG.md).

## Working with coding agents

- Claude Code starts with [`CLAUDE.md`](CLAUDE.md).
- Codex and other compatible agents start with [`AGENTS.md`](AGENTS.md).

Both files point to the same focused documentation. For frontend work, agents
should read the design-system guide, reuse `src/components/ui/`, inspect a
similar screen, and verify Arabic/English plus mobile/desktop rendering.

## Before handing off a change

```bash
bun run lint
bun run typecheck
bun run test
```

The test suite can clear tables. Never point `.env.test.local` at the development
or production database; `scripts/database-safety.ts` rejects unsafe test database
names.
