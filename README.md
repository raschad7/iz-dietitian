# Qiwam Dietitian Clinic Management

Qiwam is a bilingual Arabic/English, RTL-first application for dietitian
clinics. It brings the staff workflow and client experience into one product.

The current MVP includes client management, appointment booking, dashboards,
manual and AI-assisted meal planning, a client portal, and optional WhatsApp
automation. See [MVP product scope](docs/product-scope.md) for the exact boundary.

## Stack

| Area | Choice |
| --- | --- |
| Application | Next.js 16 App Router, React 19, strict TypeScript |
| Runtime and package manager | Bun 1.3.14 |
| Styling | Tailwind CSS v4 and shared shadcn-style components |
| Database | PostgreSQL with Drizzle ORM |
| Validation | Zod and drizzle-zod |
| Authentication | Better Auth |
| Localization | next-intl; Arabic is the default locale |
| Optional integrations | OpenWA, Resend, OpenAI, Google OAuth |

## Quick start

You need Bun and a local PostgreSQL server. Docker is needed only for the
optional WhatsApp gateway.

```bash
bun install
createdb dietitian_dev
createdb dietitian_test
cp .env.example .env.local
cp .env.test.example .env.test.local
bun run db:migrate
bun run db:migrate:test
bun run dev
```

Generate a real development auth secret with:

```bash
bunx @better-auth/cli@latest secret
```

Place it in `.env.local`. The app opens at <http://localhost:3000> and redirects
to the Arabic route at `/ar`.

For PowerShell setup commands, optional services, and environment-file details,
follow the [development guide](docs/development.md).

## Essential commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the development server |
| `bun run lint` | Run ESLint, design-token, and RTL checks |
| `bun run typecheck` | Check TypeScript |
| `bun run test` | Run tests against the separate test database |
| `bun run build` | Create a production build |
| `bun run db:generate` | Generate a migration from schema changes |
| `bun run db:migrate` | Apply development migrations |
| `bun run db:seed` | Seed local development data |

More scripts and database safety guidance are in
[Development](docs/development.md#common-commands).

## Repository map

```text
src/app/           Routes, layouts, and external HTTP endpoints
src/features/      Business logic and feature-specific UI
src/components/    Shared UI and application layout components
src/db/            Drizzle client and schemas
src/i18n/          Arabic/English routing and messages
drizzle/           Generated SQL migrations
data/              Food and curated dish datasets
infra/openwa/      Optional WhatsApp gateway setup
docs/              Development, architecture, product, and design guidance
tests/             Shared test setup and helpers
```

The main architecture rule is:

> Business logic belongs in `src/features/<feature>/`, not in `src/app/` route
> files. Routes apply guards, load data, and compose feature components.

Read [Architecture](docs/architecture.md) before changing those boundaries.

## Documentation

- [Development](docs/development.md): setup, environment files, commands,
  migrations, tests, seeding, and optional integrations
- [Architecture](docs/architecture.md): feature boundaries, data flow,
  authentication, clinic scoping, database conventions, and integrations
- [MVP product scope](docs/product-scope.md): what is included now and what is
  intentionally outside the first release
- [Design system](docs/design-system.md): concise rules for components, tokens,
  typography, shapes, accessibility, and RTL
- [Full Qiwam visual specification](docs/Qiwam%20Design%20System.html): detailed
  rendered examples; use it when the Markdown summary is not enough
- [OpenWA setup](infra/openwa/README.md): WhatsApp gateway setup and operation

Feature design records under `docs/superpowers/specs/` explain major decisions
and failure modes. They are useful when changing that feature, but they are not
required reading for normal onboarding.

## Working with coding agents

- Claude Code starts with [`CLAUDE.md`](CLAUDE.md).
- Codex and other compatible agents start with [`AGENTS.md`](AGENTS.md).

Both files point to the same focused documentation. For frontend work, agents
should read the short design-system guide, reuse `src/components/ui/`, inspect a
similar screen, and verify Arabic/English plus mobile/desktop rendering. The
large HTML design specification is a visual reference, not context that needs
to be loaded for every task.

## Before handing off a change

```bash
bun run lint
bun run typecheck
bun run test
```

The test suite can clear tables. Never point `.env.test.local` at the development
or production database; the repository includes safety checks that reject
unsafe test database names.
