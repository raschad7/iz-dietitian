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
- Web-push re-registration under `src/app/api/portal/push-subscription/`. A
  service worker handling `pushsubscriptionchange` fires with no page open, so
  it has no router and no server action to call — only `fetch`. Subscribing and
  unsubscribing from a live page still go through
  `src/features/portal/push/actions.ts`
- Authenticated push reminder ticks under `src/app/api/portal/push-reminders/`,
  which carries its own secret rather than sharing the WhatsApp one.
  `scripts/push-reminders.ts` does the same job from a shell
- Generated PWA icons under `src/app/api/pwa-icons/[size]/`, which render the
  brand lockup from `src/features/brand/logo.ts` at install time
- Printable bills under `src/app/[locale]/app/clients/bills/[clientId]/print/`,
  which answer with a PDF rather than a page. A server action cannot return a
  file for the browser to open, and rendering HTML that then fetches the bytes
  would be the same endpoint with a page in front of it. They are staff routes,
  guarded by `requireStaffClinic` like the screen they are reached from, and a
  subscriber outside the caller's clinic is a 404

A new HTTP endpoint needs an external caller or another clear boundary reason.

## Authentication and tenant boundaries

Better Auth supports three application areas, one per role in `UserRole`:

- `/{locale}/app/**` is for staff.
- `/{locale}/portal/**` is for clients.
- `/{locale}/admin/**` is for the platform owner, above every clinic.

`src/proxy.ts` performs an optimistic session-cookie redirect. It is not an
authorization boundary. Layouts and server-side operations must use the guards
in `src/lib/session.ts`, which validate the session and role against the
database.

Staff reads and writes must obtain `clinicId` through `requireStaffClinic()` and
pass it to feature queries and mutations. Never fall back to an unscoped query
when a clinic ID is missing.

Where each role belongs is stated **once**, as `AREA_BY_ROLE` in
`src/features/auth/redirect.ts`, and reached through `areaHomePath()`. Three
places need that answer — the post-sign-in redirect, the locale root, and
`requireRole` turning someone around — and a second copy of the mapping is how
they come to disagree.

### The platform area

`/{locale}/admin/**` is the one part of the application that deliberately reads
across clinics, and `requireAdminSession()` is the only guard that grants it.

An `admin` is a third role, not a staff account with extra rights. It holds no
`clinicId`, so `requireStaffClinic()` cannot hand it a tenant scope — it throws
instead, which is the loud failure we want if the two are ever crossed. The
tenant boundary is therefore a property of *which guard a route calls*, visible
at the top of a file, rather than a permission check buried in a query.

### The audit log

Every privileged write in the platform area records a row in `admin_audit_log`,
and destructive verbs will not proceed without a typed reason. The registry of
verbs is `ADMIN_ACTIONS` in `src/features/admin/audit-rules.ts`; adding a
privileged button means adding a line there first, so the log cannot fall behind
the panel by accident.

Three properties are load-bearing:

- **Rows are snapshots, not pointers.** `actor_email` and `target_label` are
  copied at write time. A log that renders "user 9f3a… suspended clinic 7c1b…"
  after both rows are gone has recorded nothing.
- **The entry is inside the action's transaction.** A panel that can suspend a
  clinic and then fail to record it has a log that looks complete and is not.
- **Refusals are recorded too.** The last admin trying to disable themselves, a
  promotion blocked because the clinic still has patients — those are written
  with `outcome: 'refused'`. A log of only successes cannot show an attempt.

There is no update or delete path, which is why the table has no `updated_at`.
Postgres cannot enforce append-only against a role holding `UPDATE`, so this is a
rule about the code.

⚠ `audit.ts` is `server-only`; the shared constants and pure rules live in
`audit-rules.ts`. A client component importing the first pulls the postgres
driver into the browser bundle.

### Plans and platform revenue

`clinics.plan`, `plan_price_minor` and `trial_ends_at` are what the *clinic* pays
the *platform*. This is not the billing ledger — that one records what a clinic
charges its own patients, and the two are never added together.

The packages live in `platform_plans` and are edited at `/admin/plans` — price,
both names, seats, the AI allowance, trial length and ordering. They were a
constant in `src/features/admin/plans.ts` until the operator of a deployment
turned out not to be the person who ships releases, which made "raise the Pro
price" a support request with a deploy attached; the file's header records the
argument it lost. Packages are **archived, never deleted**: a retired one
disappears from the pickers and keeps pricing the clinics already on it.

`clinics.plan` still stores the key as text with no foreign key behind it, so a
package's key can never be renamed and `planOf` still falls back rather than
throwing on one it does not recognise. Every screen reads the list through
`loadPlanCatalog`, once per request. A clinic's price is `plan_price_minor` when
set and the package's list price otherwise, so a negotiated deal survives a
change to the list — the same reasoning `client_charges` uses for storing its
own amount. Zero is a price, not an absence.

Nothing is enforced. Seat and AI-plan counts are what a tier is *sold* with, and
a clinic over them keeps working and shows up on the registry as over its limit.
A clinic losing access to its patients' records because a number in that file was
wrong is not a trade worth making inside an admin panel.

### Clinic health

`src/features/admin/health.ts` derives a band — dormant, at-risk, watch, new,
healthy — plus the **signals** behind it, from six aggregates per clinic: last
plan, last patient, last seen, plans this period against last, staff count, and
AI usage this month.

It is deliberately **not** a weighted score out of 100. A composite number is one
nobody can argue with because nobody can see what is in it, two clinics on the
same 38 can need opposite conversations, and there is no data on this deployment
to fit weights against — they would be guesses wearing the costume of a
measurement. The band sorts; the signals say what to do.

Two rules stop the queue filling with noise: a clinic under `NEW_CLINIC_DAYS` is
judged on setup rather than output, and a suspended clinic reports suspension as
its cause rather than appearing as a health problem the operator caused.

### Disabling an account

`users.disabled_at` is checked in `requireRole`, so it covers all three areas at
once — a disabled client is refused the portal exactly as a disabled dietitian is
refused the app. That is the difference from clinic suspension below, which is
deliberately staff-only. A disabled account lands on `/{locale}/disabled`.

The action refuses two things, server-side rather than in the UI: disabling the
account making the request, and disabling the last enabled admin. Neither is a
state worth supporting, and the only way back from the second is
`bun run admin:sync` on a machine with database access.

### Suspending a clinic

`clinics.suspended_at` is set only from the platform area, and two mechanisms
carry it because neither is sufficient alone:

- `requireStaffSession` reads it on every staff request, page or server action,
  and redirects to `/{locale}/suspended`. This is what makes a suspension
  **immediate** — a dietitian with the app already open is turned away at their
  very next request.
- The action also deletes that clinic's staff session rows. This is what makes it
  **durable**. It is not instant: Better Auth caches a session in a signed cookie
  for `SESSION_COOKIE_CACHE_SECONDS`, so for up to a minute a deleted row is
  still honoured. The column check covers that window.

**Clients are deliberately untouched.** `requireClientSession` never consults the
clinic, so a suspended practice's patients keep their portal, their plans and
their appointments. Suspension is the platform's dispute with the practice, and a
patient is not a party to it.

### Editing the shared catalog

The shared catalog is generated data as much as it is a table, and the platform
panel splits its fields accordingly:

- **Curated** — names, category, preparation state, the active flag. A person
  chose these, and `/admin/catalog` edits them.
- **Derived** — nutrition, portions, provenance. `bun run db:build-catalog`
  regenerates them from `data/usda-sr-legacy.ndjson` and would put its own
  figures back over a hand correction, so the panel shows them read-only. There
  is deliberately no kcal box.

An edit is not durable until it is exported. `db:seed:catalog --apply` upserts
every row in `data/catalog-foods.json` on `slug`, so
`bun run db:export:catalog --apply` writes the database back out and the diff is
committed, the way a generated migration is.

**The export merges rather than overwrites**, because the database is not a
complete copy of the file. `note` — the USDA description a `sourceRef` carried
when the dataset was built, which `seed-dishes.ts` asserts against — is in the
file and is null on 143 of the 145 rows. It also preserves food order, authored
alias order and per-entry nutrition key order, all of which are part of the
file's checksum. On an unedited database it is a no-op.

Its first screen is AI usage — what the plan generator costs, per clinic. It
adds no column and no write path: `weekly_plan_generations` has recorded one row
per model call since the feature was written, for failures as well as successes,
and plan review writes to that same table under `scope: 'review'` rather than
keeping a ledger of its own. So a clinic's whole model bill is one read over one
table, aggregated by pure functions in `ai-usage.ts`.

What a model costs is *not* in the database, and deliberately: no API reports it,
and freezing a price into a row would preserve whatever was true the day it was
written. Rates live in `pricing.ts` for someone to keep current, matched by
longest name prefix because the provider resolves an alias to a dated snapshot on
the way out. A model with no rate contributes its tokens and no cost, and the
screen names it — never a default rate, which would make an unnoticed guess look
like a measurement.

Two rules follow, and both matter more than they look:

- **Unscoped reads live only in `src/features/admin/`.** Nothing under
  `src/app/[locale]/app`, `src/app/[locale]/portal`, or any other feature may
  import from it. A query that omits `clinic_id` is correct in exactly one
  module and a data leak everywhere else.
- **Promotion is deliberate and never a sign-up path.** `ADMIN_EMAILS`
  bootstraps the first account through `bun run admin:sync`; the environment is
  never consulted at request time, so the database stays the single authority on
  who can reach the area.

### What the platform area does not do

Recorded here because each was considered and declined, and a later reader should
not have to rediscover the reasoning:

- **No impersonation, and no "view as clinic".** The tenant boundary stays
  absolute. Support questions are answered from the platform screens and the
  audit log.
- **No graded admin roles.** `admin` is all-or-nothing. Splitting it into owner
  and support is the obvious next step if more than one person ever holds it.
- **No failed-sign-in metric.** `auth_attempts` is pruned to the longest
  rate-limit window — one hour — on every write, and `clearAttempts` empties an
  address's rows the moment it signs in. Any count over it reads near-zero during
  an attack that ended an hour ago. Recording sign-in failures durably is a real
  feature with a retention policy attached, and it belongs in the auth layer that
  owns the table.
- **No MRR history.** The revenue figures are live; nothing snapshots them
  monthly, so the cards show "no earlier period" rather than a fabricated
  baseline.
- **No shared *dish* editing.** `data/dishes.json` addresses ingredients by USDA
  `fdcId` while the database stores `catalog_food_id`, so a faithful dish export
  is its own piece of work.

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
- `billing`: the subscriber ledger — `client_charges` and `client_payments`,
  the shekel arithmetic over them, and the Bills screen. Amounts are integer
  minor units everywhere; see `src/features/billing/money.ts`

  What a clinic sells is **its own list**, not the app's: `clinic_services`
  holds one row per service per clinic, with its names, its term in months, its
  price and its free-first rule. `DEFAULT_SERVICES` in `services.ts` is only the
  list a new clinic is seeded with. Three rules hold the ledger together:

  - **A charge stores the service's `key`, never its id**, and copies its own
    description and amount. Renaming a service or repricing it cannot rewrite
    what a subscriber was told they owed last March, and a retired service's
    charges stay readable.
  - **A term is derived, never stored.** `subscriptionEnd` is arithmetic over
    the charge's day, the service's months, and the days a freeze gave back —
    so a correction fixes every reading of it at once.
  - **A freeze is a range of days** (`client_subscription_freezes`), not a
    property of a charge. It lands on whichever term covers it, survives a
    back-dated correction, and one left open runs to today — which is what a
    pause means before anybody knows how long it will last. Resume closes it on
    the day *before* the press, so the day the subscriber came back counts
    again; a pause recorded and ended on one day gave nothing back and its row
    is removed rather than left covering a day nobody was away for.
- `booking`: the calendar, appointments, and the constraints a booking is
  checked against — the clinic's hours, repeats, and clashes. The hours
  themselves are set in `clinic-profile`, and a client-raised request is
  handled in `requests`
- `brand`: the logo as path data plus the splash screen; the single source the
  in-app lockup, the PWA icon, the Open Graph card, and `public/brand/*.svg`
  are all drawn from
- `clients`: clinic roster, client details, the nutrition intake, and portal
  credential issuing
- `clinic-profile`: clinic onboarding, clinic details, and the default schedule
- `dashboard`: staff overview and attention items
- `measurements`: body composition across visits — the readings, the goal-aware
  comparison between them, reading an analyser's PDF report, and the client's
  own view of it. `parse/` holds one template per machine; adding a clinic's
  analyser is a template and a test fixture, not a screen

  Three rules keep it from contradicting the client record, which holds the
  same figures for a different purpose:

  - **`clients.height_cm` is the one height every screen computes BMI from.**
    `measurementHeightCm` reads the record and falls back to the height typed
    into the analyser only when the record has none. The machine's height is
    still stored, still compared against the printed BMI, and still warned
    about on upload — but two tabs must not answer the same question with two
    numbers.
  - **`client_nutrition_profiles.weight_kg` has one writer with a history.**
    The intake dialog's weight box calls `recordIntakeWeight`, so a weight that
    moves the calorie target always leaves a dated row behind it. It never
    writes over a day an analyser already covered.
  - **The calorie target is built on Mifflin-St Jeor, and the analyser's own
    BMR is shown beside it rather than substituted for it.** An analyser does
    not measure metabolic rate — that is indirect calorimetry, a different
    machine. It measures impedance, estimates fat-free mass, and runs its own
    undisclosed equation from there, so the choice is one prediction against
    another and Mifflin is the one with published validation. When they
    disagree by 8% or more the Nutrition tab names both and the dietitian
    decides.
  - **A comparison across very different times of day says so.** Impedance is
    read through body water, so two visits four or more hours apart in the
    clinic's day are not cleanly comparable; `clockDrift` finds that pair and
    the panel prints the caveat under the sentence. This is what
    `measured_at_minute` is for now that the form no longer asks for a time —
    reports still carry their own clock.
- `notifications`: the in-app notification feed and browser notification state
- `portal`: client dashboard, appointments, profile, settings, and published
  plan access. `portal/pwa/` is the installable app and its service worker;
  `portal/push/` is Web Push — device subscriptions, the send funnel, and the
  reminder tick
- `requests`: the staff-side inbox for client-raised appointment and profile
  requests, kept free of database imports so its cards stay client components
- `settings`: the staff settings workspace that composes the other features'
  panels
- `user-guide`: the guided in-app tour, its anchors, and its step definitions
- `weekly-plans`: dish-based generation, review, publish, and the shared
  nutrition arithmetic over the `catalog_foods` reference table.

  `clinical.ts` is where a client's ticked conditions become planning rules: one
  constraint sentence per condition (the type system refuses a condition
  without one), the DRI energy increments for pregnancy and lactation, the
  catalogue narrowing a prescribed pattern applies — and `plannerCaveats`, which
  is the honest half: what this catalogue *cannot* do for this client, said
  before the week is generated rather than after it is read.
- `whatsapp`: gateway configuration, messages, reminders, and inbound replies
- `app-pwa` / `pwa`: service-worker registration and install-prompt capture for
  the staff application

## External services

- PostgreSQL is required for the application and tests.
- OpenWA is optional and self-hosted separately under `infra/openwa/`.
- Web Push is optional: with no VAPID keypair set the portal hides its
  "notifications on this device" switch and sends nothing. There is no third
  party — the browser's own push service is the only endpoint, and no Firebase
  or other SDK is involved.
- Resend is optional; console mail is the local default.
- OpenAI is optional; console generation is available for local work and tests.
- Google OAuth is optional and hidden when its credentials are absent.

External failures should produce an ordinary, visible application outcome. Do
not let an optional integration make unrelated local development unavailable.

## Deeper design records

Feature design records live in `docs/superpowers/specs/`. They explain why a
large feature was built a certain way. They are historical context, not the
first onboarding step and not a replacement for the current code.
