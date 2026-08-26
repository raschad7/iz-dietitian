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
src/proxy.ts       Optimistic session and portal-locale redirects
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
- Printable bills under `src/app/[locale]/app/clients/bills/[clientId]/print/`,
  which answer with a PDF rather than a page. A server action cannot return a
  file for the browser to open, and rendering HTML that then fetches the bytes
  would be the same endpoint with a page in front of it. They are staff routes,
  guarded by `requireStaffClinic` like the screen they are reached from, and a
  subscriber outside the caller's clinic is a 404

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

### The food catalog

`catalog_foods` is the **only** food table. It is the canonical, app-owned
catalog: each row stores an Arabic and an English name, an explicit preparation
state (`raw` / `cooked` / `dry` / …), per-100 g nutrition where a null means
"never measured" rather than zero, and a provenance reference. Two tables hang
off it:

- `catalog_food_aliases` — regional synonyms (`طماطم` for `بندورة`), each with
  the language it is written in. Aliases are **search-only**; a food is always
  displayed under its canonical name.
- `catalog_food_portions` — the household measures a food may be entered in
  (`رغيف` 60 g, `كوب` 158 g), with bilingual labels and a weight in grams.

Neither carries a `clinic_id`. Their scope is inherited from the food, so it
cannot disagree with itself.

`catalog_foods` and curated `dishes` are shared reference data rather than
clinic-owned records; a clinic may also add its own private food, which stays
`needs_review` and never promotes itself to the shared set. Their nutrition
values come from the committed datasets and must not be replaced by
model-generated facts.

**The legacy `foods` and `food_aliases` tables no longer exist.** They held
7,793 USDA SR Legacy rows and were dropped in migration `0030`, along with
`dish_ingredients.food_id`. `data/usda-sr-legacy.ndjson` is kept as an offline
provenance source that `bun run db:build-catalog` validates the committed
dataset against; nothing at runtime reads it.

`dish_ingredients.catalog_food_id` is NOT NULL and `on delete restrict`, so
there is exactly one food identity per recipe line and an in-use food cannot be
deleted out from under a plan. A line may also record `portion_id` and
`portion_quantity` — how the dietitian typed the amount — but
**`quantity_grams` is the only figure any nutrition calculation reads**, and the
server derives it from the portion rather than trusting a submitted gram count.

`dish_ingredients.is_primary` marks the two or three lines a dietitian adjusts
by hand — the chicken and the rice in a maqluba, not the pine nuts. It is
metadata about the interface, never an input to a calculation, and a dish with
nothing marked simply shows no controls.

No screen reads `catalog_foods` directly for a recipe — it is reached through
`dish_ingredients`. A dish stores no nutrition of its own, so every calorie the
board, the generation prompt, and the client portal display is derived from this
join at read time, except on a published plan.

### What a planned meal contains

A meal is normally `dish_id + servings`, where `servings` scales every line of
the recipe together. That is one number for the whole plate, and it is not how a
plan is written: a dietitian raises the chicken, drops the rice by a spoon, and
leaves the oil and the spices where the recipe put them.

So a meal may instead carry its own `weekly_plan_meal_ingredients` rows —
`catalog_food_id`, `quantity_grams`, an optional `portion_id` /
`portion_quantity`, `is_primary`, `sort_order`. **When those rows exist they are
the meal, and `servings` is not consulted.** The rule is stated once, in
`mealIngredientLines` (`src/features/weekly-plans/meal-ingredients.ts`), and
every surface — board, meal panel, patient portal, publish snapshot, nutrition
totals — resolves through it, so a meal can never be described one way by its
calories and another way by its ingredient list.

Two properties are load-bearing:

- **The rows are written all at once.** The first hand-set amount copies the
  whole recipe down at its current amounts and sets `servings` to 1. A single
  stored override beside a live multiplier would leave "raise the whole dish"
  and "I pinned the chicken" fighting over one meal.
- **The rows are self-contained.** They name a `catalog_food`, not a
  `dish_ingredients` line, because `db:seed:dishes` replaces every recipe
  wholesale — and because a prescribed meal should not change when the dish it
  came from is edited.

Grams remain the only input to nutrition on both paths. A portion count travels
beside them as a display of the same quantity in the unit it was counted in, and
the server derives grams from the portion rather than trusting a submitted count.

### Published plans carry frozen nutrition

Publishing writes a `weekly_plan_meals.nutrition_snapshot` for every populated
meal — the same `dishTotals` / `dishGrams` arithmetic, run once and stored — so
editing a recipe afterwards cannot rewrite what a patient was prescribed.
Drafts hold no snapshot and keep calculating live.

The rule is version-aware and fails loudly. A published or archived meal whose
snapshot is **missing, malformed, or of an unsupported version** raises
`MealSnapshotError` rather than falling back to a live calculation: falling back
is invisible, and an invisible fallback is the exact failure the freeze exists
to prevent. `bun run db:check` validates every stored blob through the same
reader, and `bun run db:backfill:plan-snapshots --apply` repairs what it finds.

## Localization and RTL

Arabic is the default locale and English is also supported. Locale routing and
messages live in `src/i18n/`. Components must work in both RTL and LTR without
separate layout implementations.

A locale prefix is authoritative everywhere except `/{locale}/portal/**`. The
portal's language is an account setting — a client picks it in Settings, and it
is stored on `clients.preferred_locale` — so `src/proxy.ts` redirects a portal
request whose prefix disagrees with the client's choice to the same path in the
chosen locale. Without that, every history entry, bookmark and restored tab from
before a language switch would still open in the old language. The rule is GET
only and scoped to the portal; the staff area and the auth screens keep plain
prefix-wins routing.

Use logical CSS and Tailwind properties such as `ms-*`, `pe-*`, `text-start`,
and `border-s-*`. Physical left/right utilities are rejected by the custom
lint rule. See [Design system](design-system.md) for the complete UI contract.

## Major feature areas

- `auth`: staff and client authentication, password policy, passkeys, and rate
  limiting
<<<<<<< HEAD
- `billing`: the subscriber ledger — `client_charges` and `client_payments`,
  the shekel arithmetic over them, and the Bills screen. Amounts are integer
  minor units everywhere; see `src/features/billing/money.ts`
- `booking`: calendar, appointments, and appointment requests
=======
- `booking`: calendar, appointments, clinic hours, and appointment scheduling
- `brand`: the logo as path data plus the splash screen; the single source the
  in-app lockup, the PWA icon, the Open Graph card, and `public/brand/*.svg`
  are all drawn from
>>>>>>> 2fc96edfef517fccc430d17ca971bb46fc56007a
- `clients`: clinic roster, client details, the nutrition intake, and portal
  credential issuing
- `clinic-profile`: clinic onboarding, clinic details, and the default schedule
- `dashboard`: staff overview and attention items
- `notifications`: the in-app notification feed and browser notification state
- `portal`: client dashboard, appointments, profile, settings, published plan
  access, and the portal's own PWA install flow
- `requests`: the staff-side inbox for client-raised appointment and profile
  requests, kept free of database imports so its cards stay client components
- `settings`: the staff settings workspace that composes the other features'
  panels
- `user-guide`: the guided in-app tour, its anchors, and its step definitions
- `weekly-plans`: dish-based generation, review, publish, and the shared
  nutrition arithmetic over the `catalog_foods` reference table
- `whatsapp`: gateway configuration, messages, reminders, and inbound replies
- `app-pwa` / `pwa`: service-worker registration and install-prompt capture for
  the staff application

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
