# Architecture

This document describes the boundaries that should remain stable as the MVP
changes. For local setup and commands, see [Development](development.md).

## Overview

The application is a bilingual, RTL-first Next.js application. UI routes use
the App Router, mutations normally use server actions, PostgreSQL stores data,
and Drizzle owns the schema and migrations.

```text
src/app/           Route composition, layouts, and external HTTP endpoints
src/features/      Business logic and feature-owned UI
src/components/    Shared UI and application layout components
src/db/            Database client and Drizzle schemas
src/i18n/          Locale routing and Arabic/English messages
src/lib/           Cross-feature infrastructure
```

## Routes and features

Business decisions, validation, queries, and mutations belong in
`src/features/<feature>/`. Files under `src/app/` resolve route parameters,
apply the correct session guard, load feature data, and compose components.
They should not become a second business-logic layer.

A feature can contain:

```text
src/features/<feature>/
  actions.ts       Server actions and mutation entry points
  queries.ts       Server-side read paths
  schema.ts        Zod input validation
  components/      Feature-specific UI
  *.test.ts        Tests beside the behavior they cover
```

Not every feature needs every file. Prefer a small focused module over an empty
or speculative layer.

Reusable interface primitives live in `src/components/ui/`. Add a variant to a
shared component when the same control needs another supported appearance; do
not fork a local button, card, field, or badge inside a feature.

## Data flow

For normal application UI, the common flow is:

```text
route or feature component -> feature query/server action -> Drizzle -> PostgreSQL
```

The application does not expose a general REST or tRPC API for its own browser
UI. HTTP route handlers are reserved for callers that cannot use server actions:

- Better Auth under `src/app/api/auth/`
- OpenWA webhook delivery under `src/app/api/whatsapp/webhook/`
- Authenticated reminder ticks under `src/app/api/whatsapp/reminders/`

A new HTTP endpoint needs an external caller or another clear boundary reason.

## Authentication and tenant boundaries

Better Auth supports two application areas:

- `/{locale}/app/**` is for staff.
- `/{locale}/portal/**` is for clients.

`src/proxy.ts` performs an optimistic session-cookie redirect. It is not an
authorization boundary. Layouts and server-side operations must use the guards
in `src/lib/session.ts`, which validate the session and role against the
database.

Staff reads and writes must obtain `clinicId` through `requireStaffClinic()` and
pass it to feature queries and mutations. Never fall back to an unscoped query
when a clinic ID is missing.

## Database

Drizzle schemas live in `src/db/schema/` and are re-exported from
`src/db/schema/index.ts`. Generated SQL migrations live in `drizzle/`.

Conventions:

- Use English identifiers and `snake_case` database names.
- Use database-generated UUID primary keys.
- Include timestamps on mutable domain records.
- Scope clinic-owned data by `clinic_id` in reads and writes.
- Add indexes and constraints for real query and integrity requirements, not in
  anticipation of possible future features.

A client record spans two tables — `clients` and `client_nutrition_profiles` —
and is written by **one** form, the intake dialog in `src/features/clients/`.
The storage split is real: the profile carries what only plan generation reads.
The form split it used to have was not, and cost the app a client whose height
lived on one screen and whose weight lived on another. `saveIntake` writes both
in one transaction; nothing else may write either half on its own.

`foods` and curated `dishes` are shared reference data rather than clinic-owned
records. Their nutrition values are derived from the committed datasets and
must not be replaced by model-generated facts.

No screen reads `foods` directly — it is reached only through
`dish_ingredients`. A dish stores no nutrition of its own, so every calorie the
board, the generation prompt, and the client portal display is derived from this
join at read time. Do not remove the table on the grounds that nothing in the UI
references it.

## Localization and RTL

Arabic is the default locale and English is also supported. Locale routing and
messages live in `src/i18n/`. Components must work in both RTL and LTR without
separate layout implementations.

Use logical CSS and Tailwind properties such as `ms-*`, `pe-*`, `text-start`,
and `border-s-*`. Physical left/right utilities are rejected by the custom
lint rule. See [Design system](design-system.md) for the complete UI contract.

## Major feature areas

- `auth`: staff and client authentication, password policy, passkeys, and rate
  limiting
- `booking`: calendar, appointments, and appointment requests
- `clients`: clinic roster, client details, the nutrition intake, and portal
  credential issuing
- `dashboard`: staff overview and attention items
- `portal`: client dashboard, appointments, profile, and published plan access
- `weekly-plans`: dish-based generation, review, publish, and the shared
  nutrition arithmetic over the `foods` reference table
- `whatsapp`: gateway configuration, messages, reminders, and inbound replies

## External services

- PostgreSQL is required for the application and tests.
- OpenWA is optional and self-hosted separately under `infra/openwa/`.
- Resend is optional; console mail is the local default.
- OpenAI is optional; console generation is available for local work and tests.
- Google OAuth is optional and hidden when its credentials are absent.

External failures should produce an ordinary, visible application outcome. Do
not let an optional integration make unrelated local development unavailable.

## Deeper design records

Feature design records live in `docs/superpowers/specs/`. They explain why a
large feature was built a certain way. They are historical context, not the
first onboarding step and not a replacement for the current code.
