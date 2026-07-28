# Clients module — design

Date: 2026-07-28
Status: approved, ready for implementation planning

## Context

The repository is a foundation build: stack, i18n, auth and folder structure, with
no domain features and no domain tables. `src/features/` is empty. The message
catalogues already carry unused nav keys for `clients`, `plans`, `appointments`
and `payments`, so the intended roadmap is written down but unbuilt.

Clients is the first module. Every other module points at a client, and the
magic-link login already built in `src/lib/auth.ts` is unusable until client
records exist — `disableSignUp: true` means a user row must exist before a link
can be requested.

## Goal

A dietitian can register a client, find them again, record the intake facts
needed to plan for them, and optionally grant that client access to the portal.

## Scope

In:

- `clients` table and its migration
- List with search, status filter and pagination
- Create, edit, archive, restore
- Client detail page showing contact and intake profile
- Portal access: invite and revoke
- Arabic and English throughout, RTL-correct
- Seed data
- Test runner and tests

Out, deliberately:

- Measurement/weight history — its own module with its own UI surface
- Plans, appointments, payments
- Bulk import, file attachments, client photos
- Multi-practitioner assignment UI (the column exists; nothing reads it yet)
- Hard delete

## Decisions

Four decisions were settled during brainstorming and are recorded here so the
implementation does not relitigate them.

**A client is a separate record from an auth user.** `clients` is its own table
with a nullable `user_id` referencing `users.id`. A client exists as a clinic
record first; portal access is a second, optional, revocable step. Rejected
alternatives: making clients *be* users with a profile side table (forces a real
or placeholder email on every client and puts domain growth on a Better Auth
owned table), and matching client to user by email (breaks silently when an email
changes).

**Single dietitian, room to grow.** No ownership scoping in queries or UI. The
`assigned_dietitian_id` column is written into the schema now so that adding a
team later is a UI change rather than a migration plus backfill.

**Registry plus intake profile.** Contact details and the intake facts a
dietitian needs on day one, not a measurement log.

**Bun's built-in test runner, with a test database.** No new dependency; Bun is
already the pinned runtime.

## Data model

New file `src/db/schema/clients.ts`, re-exported from `src/db/schema/index.ts`.

```ts
export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Identity
    fullName: text('full_name').notNull(),
    searchName: text('search_name').notNull(),
    phone: text('phone'),
    email: text('email'),

    // Portal link — null until invited, null again after revoke
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),

    // Ownership: written, not yet read
    assignedDietitianId: text('assigned_dietitian_id').references(() => user.id, {
      onDelete: 'set null',
    }),

    status: text('status').notNull().default('active'), // active | archived

    // Locale for this client's portal account and magic-link emails
    preferredLocale: text('preferred_locale').notNull().default('ar'), // ar | en

    // Intake profile
    dateOfBirth: date('date_of_birth'),
    sex: text('sex'), // female | male
    heightCm: integer('height_cm'),
    goal: text('goal'), // weight_loss | weight_gain | maintenance | medical | sports
    activityLevel: text('activity_level'), // sedentary | light | moderate | active | very_active
    medicalNotes: text('medical_notes'),
    allergies: text('allergies'),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('clients_user_id_idx').on(t.userId),
    index('clients_status_idx').on(t.status),
  ],
);
```

No index on `search_name`: search is a leading-wildcard `ilike '%…%'`, which a
btree index cannot serve. At one clinic's scale — hundreds of rows — a sequential
scan is the correct plan. The upgrade path, if the table ever grows enough to
matter, is a `pg_trgm` GIN index; adding one now would be an index that is never
used.

Rationale for the non-obvious choices:

**`date_of_birth` is `date`, not `timestamptz`.** The README's "store instants in
UTC" rule governs instants. A birthday is a calendar date; stored as a timestamp
it shifts across time zones and renders as the previous day.

**Enums are `text` validated by Zod, not `pgEnum`.** This follows the precedent
set for `users.role`, and for the same reason: `goal` and `activity_level` are
the columns most likely to be extended. Allowed values live in
`src/features/clients/schema.ts`; changing them is a code edit.

**`email` is nullable and not unique.** Family members share inboxes. Uniqueness
matters only where it is enforced anyway — `users.email` at invite time — and
that conflict is reported as a specific, actionable error.

**`user_id` is unique with `on delete set null`.** One portal login maps to at
most one client. PostgreSQL unique indexes permit multiple NULLs, so uninvited
clients are unconstrained. Deleting the auth user revokes access and never
deletes the clinical record.

**`search_name` is a stored, normalised copy of `full_name`.** See below.

**Archive, never hard delete.** `status: 'archived'` removes a client from the
default list. Clients accumulate plans, appointments and payments; a delete that
orphans them is not offered.

### Arabic search

`ilike '%…%'` on raw Arabic text fails on orthographic variants: a search for
`احمد` does not match `أحمد`. Since Arabic is the default locale, a search that
misses on the most common name form is a broken feature, not an edge case.

One normaliser in TypeScript, applied on both sides:

```ts
// Tashkeel (U+064B–U+0652) plus superscript alef (U+0670). Escapes, not literal
// glyphs: these characters are invisible in an editor and a literal range is
// impossible to review.
const ARABIC_DIACRITICS = /[\u064B-\u0652\u0670]/gu;

export function normalizeForSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا') // أ إ آ ٱ → ا
    .replace(/ى/g, 'ي') // ى → ي
    .replace(/ة/g, 'ه'); // ة → ه
}
```

`actions.ts` writes `search_name = normalizeForSearch(fullName)` on every create
and update; `queries.ts` matches against `search_name` using the same function on
the query string. A stored column rather than a PostgreSQL generated column
keeps a single normalisation implementation in one language, with no risk of the
SQL and TypeScript definitions drifting apart. The cost — recomputing on write —
is paid in one place.

Phone and email are matched raw, in the same `or(...)` as the normalised name.

## Module structure

```
src/features/clients/
  schema.ts       # Zod enums + createClient / updateClient / listClients input
  search.ts       # normalizeForSearch
  queries.ts      # reads: listClients, getClient — no Next imports
  mutations.ts    # writes: create, update, archive, restore, invite, revoke — no Next imports
  actions.ts      # "use server": guard, parse, call mutations, revalidate, redirect
  components/
    client-table.tsx        # list + empty state
    client-search.tsx       # search and status filter, URL-driven
    client-form.tsx         # create + edit, useActionState
    client-profile.tsx      # detail panel
    portal-access-card.tsx  # invite / revoke
    status-badge.tsx
```

## Routes

```
/[locale]/app/clients                  list + search
/[locale]/app/clients/new              create
/[locale]/app/clients/[clientId]       detail
/[locale]/app/clients/[clientId]/edit  edit
```

Each route file resolves its params, calls `requireStaffSession(locale)`, and
renders one feature component. Nothing else, per the architecture rule.

The sidebar gains a clients entry using the existing `nav.clients` key. This
requires widening the hardcoded `NavItem['href']` union in
`src/components/layout/sidebar.tsx` from `'/app' | '/portal'` and extending
`NAV_ITEMS` in `src/app/[locale]/app/layout.tsx`.

## Data flow

**Reads.** The list page parses `?q=&status=&page=` with a Zod schema and passes
the result to `listClients`. Filter state lives in the URL, so a filtered list is
a shareable, server-rendered address rather than hidden client state — free,
since the list is already a server component. Default status filter is `active`;
page size 20.

`getClient` Zod-parses `clientId` as a UUID before querying, so a malformed id
becomes a 404 rather than a driver error on the failed cast.

**Why reads and writes sit outside `actions.ts`.** `queries.ts` and
`mutations.ts` import no Next.js modules, so they can be called directly from
`bun test`. A `"use server"` module that calls `revalidatePath` and `headers()`
cannot — those throw outside a request scope. Keeping the database work in plain
modules is what makes the integration tests below possible; `actions.ts` stays a
thin, deliberately untested layer of glue.

**Writes.** Every action re-verifies the session. A server action is a public
endpoint; the layout guard protects the page render, not the mutation. Actions
take the locale from a hidden form field validated against `locales`, which is
the same value used to build the post-success redirect.

Actions return state rather than throwing at the user:

```ts
type ActionState =
  | { status: 'idle' }
  | { status: 'error'; code?: 'email_taken' | 'no_email'; fieldErrors?: Record<string, string[]> }
  | { status: 'success' };
```

`useActionState` renders Zod's flattened field errors inline. `revalidatePath`
and `redirect` run only on success.

## Portal access

**Invite.** Preconditions: the client has an email, and no `users` row holds it.
Both are checked before any write and reported as specific errors (`no_email`,
`email_taken`).

In a single transaction: insert a `users` row with `role: 'client'`, the client's
email and name, and `locale` from `clients.preferred_locale`; then set
`clients.user_id` to that row. The transaction is the reason this is a direct
Drizzle insert rather than `auth.api.createUser` — the Better Auth call cannot
enlist in our transaction, so a failure between the two steps would leave an
orphaned auth user who can sign in and belongs to no client. This is the only
place domain code writes to `users`, and it carries a comment saying so.

No `accounts` row is created: clients authenticate by magic link and never hold a
password.

After the transaction commits, the action triggers the magic link. In development
this logs the URL to the console, exactly as `sendMagicLink` does today; in
production it throws until an email provider is configured. That existing
limitation is unchanged by this module and is called out in the UI copy.

**Revoke.** Deletes the `users` row. Sessions and accounts cascade,
`clients.user_id` returns to null via `on delete set null`, and the client record
is untouched. Access is removed; history is not.

## Internationalisation

A `clients` namespace is added to `ar.json` first — it is the type source via
`src/types/i18n.d.ts` — then completed in `en.json`. Not a stub.

Enum values get label keys (`clients.goal.weight_loss`,
`clients.activity.sedentary`, `clients.sex.female`, `clients.status.active`), so
the database stores stable English identifiers while the UI reads Arabic.

Dates and computed ages render through `src/lib/format.ts` named formats. A bare
`Intl` call bypasses the latn/Gregorian settings and Arabic silently gets Eastern
digits.

All markup uses logical properties, which `rtl/no-physical-properties` enforces.
The client table in particular must use `text-start`, not `text-left`.

## Error handling

Four distinct paths, not one catch-all:

| Case | Handling |
| --- | --- |
| Invalid input | Zod field errors in `ActionState`, rendered inline |
| Unknown or malformed `clientId` | `notFound()`, with a localised `not-found.tsx` under the clients segment using the existing `errors.notFound` keys |
| Invite conflict | Typed code (`email_taken`, `no_email`) → specific translated message; the fix is the dietitian's to make |
| Unexpected | Logged server-side, surfaced as `errors.unexpected`; no driver text reaches the browser |

## Testing

`bun test`, added as a `test` script. No new dependency.

**Unit, no database:**

- `schema.ts` — every Zod schema, valid and invalid input, including enum
  rejection and the locale field
- `search.ts` — `normalizeForSearch` across alef variants, taa marbuta, alef
  maqsura, diacritics, and Latin input left intact

**Integration, against a `dietitian_test` database** with migrations applied and
tables truncated between tests:

- `listClients` — search matches Arabic variants, status filter excludes
  archived, pagination boundaries
- `getClient` — found, not found, malformed id
- create / update — `search_name` is written and kept in sync on rename
- archive / restore — round trip, and archived clients drop out of the default
  list
- invite — happy path writes both rows; `email_taken` and `no_email` write
  nothing; a forced failure mid-transaction leaves no orphan user
- revoke — user row gone, sessions gone, client row intact with null `user_id`

The invite transaction and the search normalisation are the two places where a
silent bug is most likely and most costly, so they carry the heaviest coverage.

## Seeding

`scripts/seed.ts` currently logs `nothing to seed yet`. It grows into: one staff
user with a known password, plus a handful of clients with Arabic names, mixed
statuses, and one already invited to the portal. Without seed data a client list
cannot be exercised, and RTL bugs hide in empty tables.

## Migration workflow

Per the README: edit `src/db/schema/clients.ts` → re-export from
`src/db/schema/index.ts` → `bun run db:generate` → review the generated SQL in
`drizzle/` → `bun run db:migrate`. Do not hand-edit an applied migration.

## Acceptance criteria

1. A dietitian signs in and sees Clients in the sidebar, in both locales.
2. Creating a client with only a name succeeds; every other field is optional.
3. Searching `احمد` finds a client stored as `أحمد`.
4. Filtering by status hides archived clients by default and can reveal them.
5. A client detail page shows contact details, intake profile and portal status.
6. Inviting a client without an email is refused with a specific message.
7. Inviting a client whose email already belongs to a user is refused with a
   specific message, and writes nothing.
8. A successful invite logs a magic link in development; following it signs the
   client into `/[locale]/portal`.
9. Revoking access ends the client's session and leaves the client record intact.
10. `bun run lint`, `bun run typecheck` and `bun test` all pass.
11. Every screen is correct in Arabic RTL, with Western digits and Gregorian
    dates in both locales.

## Deferred

- Measurement and weight history
- Email provider for magic links in production — pre-existing, unchanged here
- Multi-practitioner assignment UI
- Client-facing profile editing in the portal
