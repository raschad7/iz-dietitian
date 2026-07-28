# Clients Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first domain feature — a client registry with intake profile, search, archive, and optional portal access — on top of the existing Next.js 16 / Drizzle / Better Auth foundation.

**Architecture:** A `clients` table with a nullable `user_id` linking to Better Auth's `users`. Database work lives in plain modules (`queries.ts`, `mutations.ts`) that import nothing from Next.js, so `bun test` can call them directly; `actions.ts` is a thin `"use server"` layer that guards, parses, calls those modules, then revalidates and redirects. UI is server components except where `useActionState` requires a client component.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Drizzle ORM + postgres.js, Zod 4, next-intl, Tailwind v4 + shadcn (base-ui), Bun (runtime, package manager, test runner).

**Spec:** `docs/superpowers/specs/2026-07-28-clients-module-design.md`

---

## Conventions this codebase enforces

Read these before starting. Violating any of them fails `bun run lint` or `bun run typecheck`.

- **Logical properties only.** `pl-*`, `ml-*`, `text-left`, `left-*`, `border-l*` are lint **errors**. Use `ps-*`, `ms-*`, `text-start`, `start-*`, `border-s*`.
- **Inline type imports.** `import { type Foo } from './bar'`, not `import type { Foo }` in a separate statement, per `@typescript-eslint/consistent-type-imports` with `fixStyle: 'inline-type-imports'`.
- **`noUncheckedIndexedAccess: true`.** `rows[0]` is `T | undefined`. Always destructure-and-check: `const [row] = ...; if (!row) ...`.
- **`verbatimModuleSyntax: true`.** Type-only imports must be marked.
- **`ar.json` is the type source.** Add a key to `ar.json` first, then `en.json`. A key present only in `en.json` is a type error.
- **Never call `Intl` directly.** Use `src/lib/format.ts` helpers or next-intl named formats, or Arabic silently renders Eastern digits.
- **snake_case columns, English identifiers, `timestamptz` timestamps.**
- **Never import from `queries.ts` or `mutations.ts` inside a `'use client'` file, even for a type.** With `verbatimModuleSyntax`, `import { type X } from './queries'` still emits `import {} from './queries'`, which pulls `@/db` and the Postgres driver into the browser bundle. Shared shapes go in `src/features/clients/types.ts`.
- **`Button` is Base UI, not Radix.** There is no `asChild` prop. To render a link that looks like a button, style the link directly: `<Link href="…" className={buttonVariants({ variant: 'outline' })}>`. `buttonVariants` is exported from `@/components/ui/button`. This also keeps the link a pure server component.

---

## File Structure

**Created:**

| File | Responsibility |
| --- | --- |
| `bunfig.toml` | Points `bun test` at the preload that redirects the DB to the test database |
| `.env.test.local` | Git-ignored; holds `TEST_DATABASE_URL`, loaded by Bun under `NODE_ENV=test` |
| `tests/setup.ts` | Preload: sets `DATABASE_URL` from `TEST_DATABASE_URL` before any import of `@/db` |
| `tests/helpers.ts` | `resetDatabase()` and client/user factories shared by integration tests |
| `scripts/db-migrate-test.ts` | Applies `drizzle/` migrations to the test database |
| `src/db/schema/clients.ts` | The `clients` table |
| `src/features/clients/search.ts` | `normalizeForSearch` — Arabic orthographic folding |
| `src/features/clients/age.ts` | `calculateAge` from a `YYYY-MM-DD` string |
| `src/features/clients/schema.ts` | Zod enums, form schema, list-filter schema |
| `src/features/clients/types.ts` | Plain data shapes safe to import from client components |
| `src/features/clients/queries.ts` | `listClients`, `getClient` — no Next imports |
| `src/features/clients/mutations.ts` | create/update/archive/restore/invite/revoke — no Next imports |
| `src/features/clients/actions.ts` | `"use server"` glue |
| `src/features/clients/components/*.tsx` | 8 focused components, listed in Tasks 11–14 |
| `src/components/ui/{textarea,select,badge}.tsx` | Three small primitives in the existing style |
| `src/app/[locale]/app/clients/**` | Four routes plus `not-found.tsx` |

**Modified:** `package.json`, `.env.example`, `src/db/schema/index.ts`, `src/components/layout/sidebar.tsx`, `src/app/[locale]/app/layout.tsx`, `src/i18n/messages/{ar,en}.json`, `scripts/seed.ts`.

---

## Task 1: Test infrastructure

No test runner exists yet. This task adds one and proves it works, before any feature code.

**Files:**
- Create: `bunfig.toml`, `tests/setup.ts`, `tests/helpers.ts`, `scripts/db-migrate-test.ts`, `tests/smoke.test.ts`
- Modify: `package.json`, `.env.example`

- [ ] **Step 1: Create the test database**

```bash
createdb dietitian_test
```

Expected: no output on success. If it already exists, that error is fine — continue.

- [ ] **Step 2: Put `TEST_DATABASE_URL` in `.env.test.local`**

Create `.env.test.local` (git-ignored via the existing `.env.*.local` rule):

```bash
# Integration tests truncate every table in this database between tests.
# It must NOT be the same database as DATABASE_URL. Create it with:
#   createdb dietitian_test
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dietitian_test
```

**Not `.env.local`.** `bun test` sets `NODE_ENV=test`, and Bun deliberately skips
`.env.local` when `NODE_ENV=test` so development secrets cannot leak into a test
run. Verified in this environment:

```
NODE_ENV unset       → .env.local loaded
NODE_ENV=test        → .env.local NOT loaded
NODE_ENV=production  → .env.local loaded
```

`.env.test.local` *is* loaded under `NODE_ENV=test`, so the value arrives without
any hand-rolled parsing. Document it in `.env.example` as a comment pointing at
the separate file — `.env.example` is committed, so it must not contain a real
credential.

- [ ] **Step 3: Create the test-database migrator**

Create `scripts/db-migrate-test.ts`:

```ts
/**
 * Applies `drizzle/` to the test database. Run with `bun run db:migrate:test`
 * after every `bun run db:generate`, or the integration tests run against a
 * stale schema.
 *
 * This is a script rather than an env-prefixed drizzle-kit invocation so that it
 * behaves identically on Windows and POSIX shells.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error('TEST_DATABASE_URL is not set. Add it to .env.test.local and run: createdb dietitian_test');
}

const client = postgres(url, { max: 1 });

await migrate(drizzle(client), { migrationsFolder: './drizzle' });
await client.end();

console.info('test database migrated');
```

- [ ] **Step 4: Create the test preload**

Create `tests/setup.ts`:

```ts
/**
 * Preloaded by `bun test` (see bunfig.toml).
 *
 * `src/db/index.ts` reads DATABASE_URL at module-evaluation time, so this must
 * run before anything imports `@/db` — that is exactly what a preload is for.
 *
 * TEST_DATABASE_URL comes from `.env.test.local`, which Bun loads automatically
 * under NODE_ENV=test. See Step 2 for why it cannot live in `.env.local`.
 */
const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error('TEST_DATABASE_URL is not set. Add it to .env.test.local and run: createdb dietitian_test');
}

/**
 * `resetDatabase()` truncates every table in `public`. Pointing this at a
 * development database would destroy real work, so require the name to end in
 * `_test` and refuse otherwise.
 *
 * Comparing against DATABASE_URL would NOT work as a guard: under NODE_ENV=test
 * `.env.local` is never loaded, so DATABASE_URL is undefined here and any such
 * comparison silently passes.
 */
if (!/_test$/.test(new URL(url).pathname.slice(1))) {
  throw new Error(
    `Refusing to run tests against "${new URL(url).pathname.slice(1)}": the database name must end in _test, because the tests truncate every table.`,
  );
}

process.env.DATABASE_URL = url;
```

- [ ] **Step 5: Create `bunfig.toml`**

```toml
[test]
preload = ["./tests/setup.ts"]
```

- [ ] **Step 6: Create the shared test helpers**

Create `tests/helpers.ts`:

```ts
import { sql } from 'drizzle-orm';

import { db } from '@/db';

/**
 * Truncates every table in `public`, discovered at runtime rather than listed,
 * so adding a table never silently leaves data behind between tests.
 */
export async function resetDatabase(): Promise<void> {
  const rows = await db.execute<{ tablename: string }>(sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `);

  const names = rows.map((row) => `"${row.tablename}"`).join(', ');
  if (names.length === 0) return;

  await db.execute(sql.raw(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`));
}
```

- [ ] **Step 7: Add the scripts to `package.json`**

Add to the `scripts` block, after `"typecheck"`:

```json
    "test": "bun test",
    "db:migrate:test": "bun --env-file=.env.test.local run scripts/db-migrate-test.ts",
```

The `--env-file` flag is required: this script runs under plain `bun run`, where
`NODE_ENV` is not `test`, so Bun does not load `.env.test.local` automatically
the way it does for `bun test`. Any future script that needs the test database
must pass the same flag.

- [ ] **Step 8: Write a smoke test**

Create `tests/smoke.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { db } from '@/db';

import { resetDatabase } from './helpers';

describe('test harness', () => {
  test('connects to the test database, not the dev database', async () => {
    const rows = await db.execute<{ current_database: string }>(sql`SELECT current_database()`);
    expect(rows[0]?.current_database).toBe('dietitian_test');
  });

  test('resetDatabase runs without error', async () => {
    await resetDatabase();
  });
});
```

- [ ] **Step 9: Migrate the test database and run the smoke test**

```bash
bun run db:migrate:test
```

```bash
bun test tests/smoke.test.ts
```

Expected: `2 pass, 0 fail`. If the first test reports `dietitian_dev`, the preload is not being applied — check `bunfig.toml` is at the repository root.

- [ ] **Step 10: Commit**

```bash
git add bunfig.toml tests scripts/db-migrate-test.ts package.json .env.example
git commit -m "test: add bun test harness with a dedicated test database"
```

---

## Task 2: Pure helpers — Arabic search folding and age

Two pure functions, no database. TDD: tests first.

**Files:**
- Create: `src/features/clients/search.ts`, `src/features/clients/search.test.ts`, `src/features/clients/age.ts`, `src/features/clients/age.test.ts`

- [ ] **Step 1: Write the failing search tests**

Create `src/features/clients/search.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { normalizeForSearch } from './search';

describe('normalizeForSearch', () => {
  test('folds every alef variant to bare alef', () => {
    expect(normalizeForSearch('أحمد')).toBe('احمد');
    expect(normalizeForSearch('إبراهيم')).toBe('ابراهيم');
    expect(normalizeForSearch('آدم')).toBe('ادم');
  });

  test('folds alef maqsura to yaa', () => {
    expect(normalizeForSearch('مصطفى')).toBe('مصطفي');
  });

  test('folds taa marbuta to haa', () => {
    expect(normalizeForSearch('فاطمة')).toBe('فاطمه');
  });

  test('strips tashkeel', () => {
    expect(normalizeForSearch('سُمَيَّة')).toBe('سميه');
  });

  test('a typed query and the stored name converge on the same value', () => {
    expect(normalizeForSearch('احمد')).toBe(normalizeForSearch('أحمد'));
  });

  test('trims and lowercases Latin input, leaving letters intact', () => {
    expect(normalizeForSearch('  Ahmad Khalil  ')).toBe('ahmad khalil');
  });

  test('handles an empty string', () => {
    expect(normalizeForSearch('')).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
bun test src/features/clients/search.test.ts
```

Expected: FAIL — `Cannot find module './search'`.

- [ ] **Step 3: Implement `search.ts`**

Create `src/features/clients/search.ts`:

```ts
/**
 * Arabic orthographic folding for search.
 *
 * `ilike '%احمد%'` does not match a name stored as `أحمد`. Arabic is the default
 * locale here, so a search that misses the most common spelling variant is a
 * broken feature rather than an edge case.
 *
 * The same function normalises both what is written to `clients.search_name` and
 * what is typed into the search box, so the two can never drift apart. That is
 * also why this is TypeScript rather than a PostgreSQL generated column: one
 * implementation, one language.
 */

/** Tashkeel (U+064B–U+0652) plus superscript alef (U+0670). */
const ARABIC_DIACRITICS = /[ً-ْٰ]/gu;

/** أ إ آ ٱ → ا */
const ALEF_VARIANTS = /[أإآٱ]/gu;

/** ى → ي */
const ALEF_MAQSURA = /ى/gu;

/** ة → ه */
const TAA_MARBUTA = /ة/gu;

export function normalizeForSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(ARABIC_DIACRITICS, '')
    .replace(ALEF_VARIANTS, 'ا')
    .replace(ALEF_MAQSURA, 'ي')
    .replace(TAA_MARBUTA, 'ه');
}
```

- [ ] **Step 4: Run the search tests to verify they pass**

```bash
bun test src/features/clients/search.test.ts
```

Expected: `7 pass, 0 fail`.

- [ ] **Step 5: Write the failing age tests**

Create `src/features/clients/age.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { calculateAge } from './age';

const TODAY = new Date(2026, 6, 28); // 2026-07-28, local time

describe('calculateAge', () => {
  test('counts a birthday already passed this year', () => {
    expect(calculateAge('1990-06-15', TODAY)).toBe(36);
  });

  test('does not count a birthday still ahead this year', () => {
    expect(calculateAge('1990-08-15', TODAY)).toBe(35);
  });

  test('counts the birthday itself', () => {
    expect(calculateAge('1990-07-28', TODAY)).toBe(36);
  });

  test('returns 0 for an infant born this year', () => {
    expect(calculateAge('2026-01-10', TODAY)).toBe(0);
  });

  test('returns null for a malformed date', () => {
    expect(calculateAge('15/06/1990', TODAY)).toBeNull();
    expect(calculateAge('', TODAY)).toBeNull();
  });

  test('returns null for an implausible age', () => {
    expect(calculateAge('1800-01-01', TODAY)).toBeNull();
    expect(calculateAge('2030-01-01', TODAY)).toBeNull();
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

```bash
bun test src/features/clients/age.test.ts
```

Expected: FAIL — `Cannot find module './age'`.

- [ ] **Step 7: Implement `age.ts`**

Create `src/features/clients/age.ts`:

```ts
/**
 * Age from a `YYYY-MM-DD` calendar date.
 *
 * Deliberately does not construct a Date from the input: `new Date('1990-06-15')`
 * parses as UTC midnight and can render as the previous day in Asia/Hebron. The
 * stored value is a calendar date, so it is compared as one.
 */
export function calculateAge(dateOfBirth: string, today: Date = new Date()): number | null {
  const parts = dateOfBirth.split('-');
  if (parts.length !== 3) return null;

  const [yearPart, monthPart, dayPart] = parts;
  if (!yearPart || !monthPart || !dayPart) return null;

  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const currentMonth = today.getMonth() + 1;
  const hadBirthdayThisYear =
    currentMonth > month || (currentMonth === month && today.getDate() >= day);

  const age = today.getFullYear() - year - (hadBirthdayThisYear ? 0 : 1);

  return age >= 0 && age < 130 ? age : null;
}
```

- [ ] **Step 8: Run all tests so far**

```bash
bun test
```

Expected: `15 pass, 0 fail`.

- [ ] **Step 9: Commit**

```bash
git add src/features/clients/search.ts src/features/clients/search.test.ts src/features/clients/age.ts src/features/clients/age.test.ts
git commit -m "feat(clients): add Arabic search folding and age helpers"
```

---

## Task 3: The `clients` table

**Files:**
- Create: `src/db/schema/clients.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create the schema module**

Create `src/db/schema/clients.ts`:

```ts
import { date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth';

/**
 * A client of the clinic.
 *
 * A client is a clinical record first and an account second: `user_id` stays
 * null until staff grants portal access, so clients with no email address — walk
 * ins, children, anyone whose relative books for them — are first class.
 *
 * Enum-like columns are `text` validated by Zod rather than `pgEnum`, following
 * the precedent set by `users.role`: `goal` and `activity_level` are exactly the
 * columns a practising dietitian will want to extend.
 */
export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    fullName: text('full_name').notNull(),

    /**
     * `full_name` run through `normalizeForSearch`. Written on every create and
     * update; never edited by hand. See `src/features/clients/search.ts`.
     */
    searchName: text('search_name').notNull(),

    phone: text('phone'),

    /**
     * Nullable and NOT unique — family members share inboxes. Uniqueness is
     * enforced where it actually matters, on `users.email`, at invite time.
     */
    email: text('email'),

    /**
     * Portal account, null until invited. `set null` means deleting the auth
     * user revokes access without touching the clinical record.
     */
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),

    /** Written today, read by nobody: makes adding a team a UI change, not a migration. */
    assignedDietitianId: text('assigned_dietitian_id').references(() => user.id, { onDelete: 'set null' }),

    /** active | archived. Clients are archived, never deleted — they own history. */
    status: text('status').notNull().default('active'),

    /** Locale for this client's portal account and magic-link emails. ar | en */
    preferredLocale: text('preferred_locale').notNull().default('ar'),

    /**
     * A birthday is a calendar date, not an instant. Stored as `date` and read
     * as a string, so it cannot shift a day across time zones.
     */
    dateOfBirth: date('date_of_birth', { mode: 'string' }),

    /** female | male */
    sex: text('sex'),

    heightCm: integer('height_cm'),

    /** weight_loss | weight_gain | maintenance | medical | sports */
    goal: text('goal'),

    /** sedentary | light | moderate | active | very_active */
    activityLevel: text('activity_level'),

    medicalNotes: text('medical_notes'),
    allergies: text('allergies'),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One portal login maps to at most one client. PostgreSQL permits many NULLs
    // in a unique index, so uninvited clients are unconstrained.
    uniqueIndex('clients_user_id_idx').on(table.userId),
    index('clients_status_idx').on(table.status),
    // No index on search_name: `ilike '%…%'` cannot use a btree. At one clinic's
    // scale a sequential scan is the right plan; pg_trgm is the upgrade path.
  ],
);

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
```

- [ ] **Step 2: Re-export from the barrel**

In `src/db/schema/index.ts`, replace the final line `export * from './auth';` with:

```ts
export * from './auth';
export * from './clients';
```

- [ ] **Step 3: Generate the migration**

```bash
bun run db:generate
```

Expected: a new file under `drizzle/`, e.g. `0001_*.sql`. Open it and confirm it contains `CREATE TABLE "clients"`, both foreign keys to `users`, and the two indexes. Do not hand-edit it.

- [ ] **Step 4: Apply the migration to both databases**

```bash
bun run db:migrate
```

```bash
bun run db:migrate:test
```

Expected: both report success.

- [ ] **Step 5: Verify the schema typechecks**

```bash
bun run typecheck
```

Expected: no output (success).

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/clients.ts src/db/schema/index.ts drizzle
git commit -m "feat(clients): add the clients table"
```

---

## Task 4: Zod schemas

**Files:**
- Create: `src/features/clients/schema.ts`, `src/features/clients/schema.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/clients/schema.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';

import { clientFormSchema, listClientsSchema } from './schema';

const minimal = { fullName: 'أحمد خليل' };

describe('clientFormSchema', () => {
  test('accepts a client with only a name', () => {
    const result = clientFormSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    expect(result.data?.fullName).toBe('أحمد خليل');
  });

  test('rejects a name shorter than two characters', () => {
    expect(clientFormSchema.safeParse({ fullName: 'ا' }).success).toBe(false);
  });

  test('treats blank optional fields as absent', () => {
    const result = clientFormSchema.safeParse({
      ...minimal,
      phone: '',
      email: '',
      heightCm: '',
      goal: '',
      dateOfBirth: '',
    });
    expect(result.success).toBe(true);
    expect(result.data?.phone).toBeUndefined();
    expect(result.data?.email).toBeUndefined();
    expect(result.data?.heightCm).toBeUndefined();
    expect(result.data?.goal).toBeUndefined();
  });

  test('coerces a numeric string height', () => {
    const result = clientFormSchema.safeParse({ ...minimal, heightCm: '172' });
    expect(result.data?.heightCm).toBe(172);
  });

  test('rejects an implausible height', () => {
    expect(clientFormSchema.safeParse({ ...minimal, heightCm: '500' }).success).toBe(false);
  });

  test('lowercases and trims email', () => {
    const result = clientFormSchema.safeParse({ ...minimal, email: '  Sara@Clinic.PS ' });
    expect(result.data?.email).toBe('sara@clinic.ps');
  });

  test('rejects a malformed email', () => {
    expect(clientFormSchema.safeParse({ ...minimal, email: 'not-an-email' }).success).toBe(false);
  });

  test('rejects an unknown enum value', () => {
    expect(clientFormSchema.safeParse({ ...minimal, goal: 'become_taller' }).success).toBe(false);
  });

  test('rejects a malformed date of birth', () => {
    expect(clientFormSchema.safeParse({ ...minimal, dateOfBirth: '15/06/1990' }).success).toBe(false);
  });

  test('defaults preferredLocale to Arabic', () => {
    expect(clientFormSchema.safeParse(minimal).data?.preferredLocale).toBe('ar');
  });

  test('reports the offending field so the form can highlight it', () => {
    const result = clientFormSchema.safeParse({ fullName: '', heightCm: '999' });
    expect(result.success).toBe(false);
    const fieldErrors = result.error ? Object.keys(z.flattenError(result.error).fieldErrors) : [];
    expect(fieldErrors).toContain('fullName');
    expect(fieldErrors).toContain('heightCm');
  });
});

describe('listClientsSchema', () => {
  test('defaults to active clients on page one', () => {
    const result = listClientsSchema.parse({});
    expect(result.status).toBe('active');
    expect(result.page).toBe(1);
    expect(result.q).toBeUndefined();
  });

  test('falls back to defaults instead of throwing on junk input', () => {
    const result = listClientsSchema.parse({ status: 'nonsense', page: 'abc' });
    expect(result.status).toBe('active');
    expect(result.page).toBe(1);
  });

  test('accepts the all filter and a page number', () => {
    const result = listClientsSchema.parse({ status: 'all', page: '3', q: '  أحمد ' });
    expect(result.status).toBe('all');
    expect(result.page).toBe(3);
    expect(result.q).toBe('أحمد');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
bun test src/features/clients/schema.test.ts
```

Expected: FAIL — `Cannot find module './schema'`.

- [ ] **Step 3: Implement `schema.ts`**

Create `src/features/clients/schema.ts`:

```ts
import { z } from 'zod';

import { defaultLocale, locales } from '@/i18n/routing';

/**
 * Allowed values for the enum-like text columns. These live here rather than in
 * the database so extending them is a code change, not a migration.
 */
export const CLIENT_STATUSES = ['active', 'archived'] as const;
export const CLIENT_SEXES = ['female', 'male'] as const;
export const CLIENT_GOALS = ['weight_loss', 'weight_gain', 'maintenance', 'medical', 'sports'] as const;
export const CLIENT_ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export type ClientSex = (typeof CLIENT_SEXES)[number];
export type ClientGoal = (typeof CLIENT_GOALS)[number];
export type ClientActivityLevel = (typeof CLIENT_ACTIVITY_LEVELS)[number];

/**
 * An untouched optional input arrives from FormData as `''`, which is not the
 * same thing as "not provided". Every optional field passes through here first.
 */
function blankToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

function optionalText(max: number) {
  return z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
}

function optionalEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(blankToUndefined, z.enum(values).optional());
}

export const clientIdSchema = z.uuid();

export const localeSchema = z.enum(locales).catch(defaultLocale);

export const clientFormSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: optionalText(40),
  email: z.preprocess(blankToUndefined, z.email().trim().toLowerCase().optional()),
  preferredLocale: localeSchema,
  dateOfBirth: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
      .optional(),
  ),
  sex: optionalEnum(CLIENT_SEXES),
  heightCm: z.preprocess(blankToUndefined, z.coerce.number().int().min(30).max(280).optional()),
  goal: optionalEnum(CLIENT_GOALS),
  activityLevel: optionalEnum(CLIENT_ACTIVITY_LEVELS),
  medicalNotes: optionalText(2000),
  allergies: optionalText(1000),
  notes: optionalText(2000),
});

export type ClientFormInput = z.infer<typeof clientFormSchema>;

/**
 * List filters. Every field uses `.catch()` so a hand-edited query string
 * degrades to the default view instead of throwing a 500 at the user.
 */
export const listClientsSchema = z.object({
  q: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
  status: z.enum([...CLIENT_STATUSES, 'all']).catch('active'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type ListClientsInput = z.infer<typeof listClientsSchema>;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
bun test src/features/clients/schema.test.ts
```

Expected: `14 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add src/features/clients/schema.ts src/features/clients/schema.test.ts
git commit -m "feat(clients): add Zod schemas for the client form and list filters"
```

---

## Task 5: Write mutations — create, update, archive, restore

Mutations come before queries so the query tests have something to create rows with.

**Files:**
- Create: `src/features/clients/mutations.ts`, `src/features/clients/mutations.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/clients/mutations.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { clients } from '@/db/schema';

import { resetDatabase } from '../../../tests/helpers';
import { archiveClient, createClient, restoreClient, updateClient } from './mutations';

beforeEach(async () => {
  await resetDatabase();
});

async function readClient(id: string) {
  const [row] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return row;
}

describe('createClient', () => {
  test('stores a client and returns its id', async () => {
    const { id } = await createClient({ fullName: 'أحمد خليل', preferredLocale: 'ar' });
    const row = await readClient(id);

    expect(row?.fullName).toBe('أحمد خليل');
    expect(row?.status).toBe('active');
    expect(row?.userId).toBeNull();
  });

  test('writes the normalised search name', async () => {
    const { id } = await createClient({ fullName: 'أحمد', preferredLocale: 'ar' });
    expect((await readClient(id))?.searchName).toBe('احمد');
  });

  test('stores the optional intake fields', async () => {
    const { id } = await createClient({
      fullName: 'سارة',
      preferredLocale: 'en',
      email: 'sara@clinic.ps',
      dateOfBirth: '1994-03-02',
      heightCm: 165,
      goal: 'weight_loss',
      activityLevel: 'moderate',
      allergies: 'الفول السوداني',
    });

    const row = await readClient(id);
    expect(row?.dateOfBirth).toBe('1994-03-02');
    expect(row?.heightCm).toBe(165);
    expect(row?.goal).toBe('weight_loss');
    expect(row?.preferredLocale).toBe('en');
  });
});

describe('updateClient', () => {
  test('keeps the search name in sync when the name changes', async () => {
    const { id } = await createClient({ fullName: 'أحمد', preferredLocale: 'ar' });
    await updateClient(id, { fullName: 'إبراهيم', preferredLocale: 'ar' });

    const row = await readClient(id);
    expect(row?.fullName).toBe('إبراهيم');
    expect(row?.searchName).toBe('ابراهيم');
  });

  test('clears a field that was emptied', async () => {
    const { id } = await createClient({ fullName: 'سارة', preferredLocale: 'ar', phone: '0599000000' });
    await updateClient(id, { fullName: 'سارة', preferredLocale: 'ar' });

    expect((await readClient(id))?.phone).toBeNull();
  });

  test('returns false for an unknown id', async () => {
    expect(await updateClient('00000000-0000-4000-8000-000000000000', {
      fullName: 'لا أحد',
      preferredLocale: 'ar',
    })).toBe(false);
  });
});

describe('archiveClient / restoreClient', () => {
  test('round-trips the status', async () => {
    const { id } = await createClient({ fullName: 'أحمد', preferredLocale: 'ar' });

    expect(await archiveClient(id)).toBe(true);
    expect((await readClient(id))?.status).toBe('archived');

    expect(await restoreClient(id)).toBe(true);
    expect((await readClient(id))?.status).toBe('active');
  });

  test('archiving never deletes the row', async () => {
    const { id } = await createClient({ fullName: 'أحمد', preferredLocale: 'ar' });
    await archiveClient(id);
    expect(await readClient(id)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
bun test src/features/clients/mutations.test.ts
```

Expected: FAIL — `Cannot find module './mutations'`.

- [ ] **Step 3: Implement the create/update/archive/restore half of `mutations.ts`**

Create `src/features/clients/mutations.ts`:

```ts
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { clients } from '@/db/schema';

import { normalizeForSearch } from './search';
import { type ClientFormInput } from './schema';

/**
 * Every write to the clients table.
 *
 * This module imports nothing from Next.js on purpose: `bun test` can call it
 * directly, whereas a `"use server"` module calling `revalidatePath` cannot run
 * outside a request scope. `actions.ts` is the thin layer that adds the Next.js
 * concerns on top.
 */

/** Maps validated form input onto columns. Optional fields become NULL, not skipped. */
function toColumns(input: ClientFormInput) {
  return {
    fullName: input.fullName,
    searchName: normalizeForSearch(input.fullName),
    phone: input.phone ?? null,
    email: input.email ?? null,
    preferredLocale: input.preferredLocale,
    dateOfBirth: input.dateOfBirth ?? null,
    sex: input.sex ?? null,
    heightCm: input.heightCm ?? null,
    goal: input.goal ?? null,
    activityLevel: input.activityLevel ?? null,
    medicalNotes: input.medicalNotes ?? null,
    allergies: input.allergies ?? null,
    notes: input.notes ?? null,
  };
}

export async function createClient(input: ClientFormInput): Promise<{ id: string }> {
  const [row] = await db.insert(clients).values(toColumns(input)).returning({ id: clients.id });

  if (!row) {
    throw new Error('insert into clients returned no row');
  }

  return row;
}

/** Returns false when no client has that id. */
export async function updateClient(id: string, input: ClientFormInput): Promise<boolean> {
  const rows = await db
    .update(clients)
    .set({ ...toColumns(input), updatedAt: new Date() })
    .where(eq(clients.id, id))
    .returning({ id: clients.id });

  return rows.length > 0;
}

async function setStatus(id: string, status: 'active' | 'archived'): Promise<boolean> {
  const rows = await db
    .update(clients)
    .set({ status, updatedAt: new Date() })
    .where(eq(clients.id, id))
    .returning({ id: clients.id });

  return rows.length > 0;
}

/** Hides a client from the default list. Never deletes — clients own history. */
export function archiveClient(id: string): Promise<boolean> {
  return setStatus(id, 'archived');
}

export function restoreClient(id: string): Promise<boolean> {
  return setStatus(id, 'active');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
bun test src/features/clients/mutations.test.ts
```

Expected: `8 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add src/features/clients/mutations.ts src/features/clients/mutations.test.ts
git commit -m "feat(clients): add create, update, archive and restore mutations"
```

---

## Task 6: Portal access — invite and revoke

The riskiest code in the module: it is the only place domain code writes to `users`, and a half-applied invite leaves an auth account belonging to nobody.

**Files:**
- Modify: `src/features/clients/mutations.ts`, `src/features/clients/mutations.test.ts`

- [ ] **Step 1: Write the failing tests**

First extend the two existing imports at the top of `src/features/clients/mutations.test.ts` — do not add a second import statement for the same module, ESLint rejects it:

```ts
import { clients, user } from '@/db/schema';
import {
  archiveClient,
  createClient,
  invitePortalAccess,
  restoreClient,
  revokePortalAccess,
  updateClient,
} from './mutations';
```

Then append to the same file:

```ts
async function readUsers() {
  return db.select().from(user);
}

describe('invitePortalAccess', () => {
  test('creates a client-role user and links it', async () => {
    const { id } = await createClient({ fullName: 'سارة', preferredLocale: 'en', email: 'sara@clinic.ps' });

    const result = await invitePortalAccess(id);
    expect(result.ok).toBe(true);

    const users = await readUsers();
    expect(users).toHaveLength(1);
    expect(users[0]?.email).toBe('sara@clinic.ps');
    expect(users[0]?.role).toBe('client');
    expect(users[0]?.locale).toBe('en');

    expect((await readClient(id))?.userId).toBe(users[0]?.id ?? '');
  });

  test('refuses a client with no email and writes nothing', async () => {
    const { id } = await createClient({ fullName: 'أحمد', preferredLocale: 'ar' });

    const result = await invitePortalAccess(id);
    expect(result).toEqual({ ok: false, code: 'no_email' });
    expect(await readUsers()).toHaveLength(0);
  });

  test('refuses when the email already belongs to a user, and writes nothing', async () => {
    await db.insert(user).values({
      id: 'existing-user',
      name: 'Existing',
      email: 'taken@clinic.ps',
      role: 'staff',
    });

    const { id } = await createClient({ fullName: 'سارة', preferredLocale: 'ar', email: 'taken@clinic.ps' });

    const result = await invitePortalAccess(id);
    expect(result).toEqual({ ok: false, code: 'email_taken' });

    // The pre-existing user is untouched and no second row appeared.
    expect(await readUsers()).toHaveLength(1);
    expect((await readClient(id))?.userId).toBeNull();
  });

  test('refuses a second invite for an already-linked client', async () => {
    const { id } = await createClient({ fullName: 'سارة', preferredLocale: 'ar', email: 'sara@clinic.ps' });
    await invitePortalAccess(id);

    expect(await invitePortalAccess(id)).toEqual({ ok: false, code: 'already_invited' });
    expect(await readUsers()).toHaveLength(1);
  });

  test('refuses an unknown client', async () => {
    expect(await invitePortalAccess('00000000-0000-4000-8000-000000000000')).toEqual({
      ok: false,
      code: 'not_found',
    });
  });
});

describe('revokePortalAccess', () => {
  test('deletes the user and leaves the client record intact', async () => {
    const { id } = await createClient({ fullName: 'سارة', preferredLocale: 'ar', email: 'sara@clinic.ps' });
    await invitePortalAccess(id);

    expect(await revokePortalAccess(id)).toBe(true);
    expect(await readUsers()).toHaveLength(0);

    const row = await readClient(id);
    expect(row).toBeDefined();
    expect(row?.userId).toBeNull();
    expect(row?.fullName).toBe('سارة');
  });

  test('returns false for a client with no portal access', async () => {
    const { id } = await createClient({ fullName: 'أحمد', preferredLocale: 'ar' });
    expect(await revokePortalAccess(id)).toBe(false);
  });

  test('a client can be re-invited after a revoke', async () => {
    const { id } = await createClient({ fullName: 'سارة', preferredLocale: 'ar', email: 'sara@clinic.ps' });
    await invitePortalAccess(id);
    await revokePortalAccess(id);

    expect((await invitePortalAccess(id)).ok).toBe(true);
    expect(await readUsers()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
bun test src/features/clients/mutations.test.ts
```

Expected: FAIL — `invitePortalAccess` is not exported.

- [ ] **Step 3: Implement invite and revoke**

Append to `src/features/clients/mutations.ts` (and add `user` to the existing `@/db/schema` import):

```ts
export type InviteFailureCode = 'not_found' | 'no_email' | 'email_taken' | 'already_invited';

/**
 * The success case carries the email back to the caller, so the action can send
 * the magic link without trusting a value round-tripped through the form.
 */
export type InviteResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; code: InviteFailureCode };

/** PostgreSQL unique_violation. */
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;
}

/**
 * Grants a client access to the portal.
 *
 * The `users` row and the `clients.user_id` link are written in ONE transaction.
 * That is the whole reason this is a direct Drizzle insert rather than an
 * `auth.api.createUser` call: the Better Auth API cannot enlist in our
 * transaction, so a failure between the two steps would leave an orphaned auth
 * account that can sign in and belongs to no client.
 *
 * This is the only place domain code writes to the `users` table.
 *
 * No `accounts` row is created: clients authenticate by magic link and never
 * hold a password.
 */
export async function invitePortalAccess(clientId: string): Promise<InviteResult> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);

  if (!client) return { ok: false, code: 'not_found' };
  if (client.userId) return { ok: false, code: 'already_invited' };

  const email = client.email;
  if (!email) return { ok: false, code: 'no_email' };

  const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (taken) return { ok: false, code: 'email_taken' };

  const userId = crypto.randomUUID();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: userId,
        name: client.fullName,
        email,
        emailVerified: false,
        role: 'client',
        locale: client.preferredLocale,
      });

      await tx.update(clients).set({ userId, updatedAt: new Date() }).where(eq(clients.id, clientId));
    });
  } catch (error) {
    // The check above is a fast path, not a guarantee — two staff members can
    // invite the same address concurrently. The unique constraint is the real
    // arbiter, and the transaction means nothing was written.
    if (isUniqueViolation(error)) return { ok: false, code: 'email_taken' };
    throw error;
  }

  return { ok: true, userId, email };
}

/**
 * Removes portal access. Deleting the `users` row cascades to sessions and
 * accounts, and `clients.user_id` returns to null via `on delete set null`, so
 * the clinical record survives untouched.
 */
export async function revokePortalAccess(clientId: string): Promise<boolean> {
  const [client] = await db.select({ userId: clients.userId }).from(clients).where(eq(clients.id, clientId)).limit(1);

  if (!client?.userId) return false;

  await db.delete(user).where(eq(user.id, client.userId));
  return true;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
bun test src/features/clients/mutations.test.ts
```

Expected: `16 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add src/features/clients/mutations.ts src/features/clients/mutations.test.ts
git commit -m "feat(clients): add transactional portal invite and revoke"
```

---

## Task 7: Read queries

**Files:**
- Create: `src/features/clients/queries.ts`, `src/features/clients/queries.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/clients/queries.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test';

import { resetDatabase } from '../../../tests/helpers';
import { archiveClient, createClient, invitePortalAccess } from './mutations';
import { getClient, listClients } from './queries';
import { listClientsSchema } from './schema';

const filters = (overrides: Record<string, unknown> = {}) => listClientsSchema.parse(overrides);

beforeEach(async () => {
  await resetDatabase();
});

describe('listClients', () => {
  test('returns an empty result set for an empty table', async () => {
    const result = await listClients(filters());
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.pageCount).toBe(1);
  });

  test('finds a client written with hamza when searching without it', async () => {
    await createClient({ fullName: 'أحمد خليل', preferredLocale: 'ar' });

    const result = await listClients(filters({ q: 'احمد' }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.fullName).toBe('أحمد خليل');
  });

  test('finds a client written without hamza when searching with it', async () => {
    await createClient({ fullName: 'احمد خليل', preferredLocale: 'ar' });
    expect((await listClients(filters({ q: 'أحمد' }))).items).toHaveLength(1);
  });

  test('searches phone and email as typed', async () => {
    await createClient({ fullName: 'سارة', preferredLocale: 'ar', phone: '0599123456', email: 'sara@clinic.ps' });

    expect((await listClients(filters({ q: '99123' }))).items).toHaveLength(1);
    expect((await listClients(filters({ q: 'sara@' }))).items).toHaveLength(1);
  });

  test('returns nothing for a query that matches nobody', async () => {
    await createClient({ fullName: 'سارة', preferredLocale: 'ar' });
    expect((await listClients(filters({ q: 'زياد' }))).items).toHaveLength(0);
  });

  test('hides archived clients by default and reveals them on request', async () => {
    const { id } = await createClient({ fullName: 'أحمد', preferredLocale: 'ar' });
    await createClient({ fullName: 'سارة', preferredLocale: 'ar' });
    await archiveClient(id);

    expect((await listClients(filters())).items).toHaveLength(1);
    expect((await listClients(filters({ status: 'archived' }))).items).toHaveLength(1);
    expect((await listClients(filters({ status: 'all' }))).items).toHaveLength(2);
  });

  test('reports portal access on each row', async () => {
    const { id } = await createClient({ fullName: 'سارة', preferredLocale: 'ar', email: 'sara@clinic.ps' });
    await invitePortalAccess(id);
    await createClient({ fullName: 'أحمد', preferredLocale: 'ar' });

    const result = await listClients(filters({ q: 'سارة' }));
    expect(result.items[0]?.hasPortalAccess).toBe(true);

    const other = await listClients(filters({ q: 'أحمد' }));
    expect(other.items[0]?.hasPortalAccess).toBe(false);
  });

  test('paginates', async () => {
    for (let index = 0; index < 25; index += 1) {
      await createClient({ fullName: `عميل ${index}`, preferredLocale: 'ar' });
    }

    const first = await listClients(filters());
    expect(first.items).toHaveLength(20);
    expect(first.total).toBe(25);
    expect(first.pageCount).toBe(2);

    const second = await listClients(filters({ page: '2' }));
    expect(second.items).toHaveLength(5);
  });

  test('returns an empty page past the end rather than failing', async () => {
    await createClient({ fullName: 'أحمد', preferredLocale: 'ar' });
    expect((await listClients(filters({ page: '9' }))).items).toEqual([]);
  });
});

describe('getClient', () => {
  test('returns the full record', async () => {
    const { id } = await createClient({ fullName: 'سارة', preferredLocale: 'ar', heightCm: 165 });

    const client = await getClient(id);
    expect(client?.fullName).toBe('سارة');
    expect(client?.heightCm).toBe(165);
    expect(client?.hasPortalAccess).toBe(false);
  });

  test('returns null for an unknown id', async () => {
    expect(await getClient('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  test('returns null for a malformed id instead of throwing', async () => {
    expect(await getClient('not-a-uuid')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
bun test src/features/clients/queries.test.ts
```

Expected: FAIL — `Cannot find module './queries'`.

- [ ] **Step 3: Implement `queries.ts`**

Create `src/features/clients/queries.ts`:

```ts
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { clients, type Client } from '@/db/schema';

import { normalizeForSearch } from './search';
import { clientIdSchema, type ListClientsInput } from './schema';

/**
 * Reads for the clients feature. Imports nothing from Next.js so that the tests
 * can call these directly — see the note at the top of `mutations.ts`.
 */

export const CLIENTS_PAGE_SIZE = 20;

export type ClientListItem = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  status: string;
  hasPortalAccess: boolean;
};

export type ClientListResult = {
  items: ClientListItem[];
  total: number;
  page: number;
  pageCount: number;
};

export type ClientDetail = Client & { hasPortalAccess: boolean };

function buildFilter(input: ListClientsInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.status !== 'all') {
    conditions.push(eq(clients.status, input.status));
  }

  if (input.q) {
    // The name is matched against the normalised column using the same folding
    // applied when it was stored; phone and email are matched as typed.
    const name = `%${normalizeForSearch(input.q)}%`;
    const raw = `%${input.q.trim()}%`;

    const matches = or(ilike(clients.searchName, name), ilike(clients.phone, raw), ilike(clients.email, raw));
    if (matches) conditions.push(matches);
  }

  if (conditions.length === 0) return undefined;

  return and(...conditions);
}

export async function listClients(input: ListClientsInput): Promise<ClientListResult> {
  const where = buildFilter(input);

  const [totals] = await db.select({ value: count() }).from(clients).where(where);
  const total = totals?.value ?? 0;

  const rows = await db
    .select({
      id: clients.id,
      fullName: clients.fullName,
      phone: clients.phone,
      email: clients.email,
      status: clients.status,
      userId: clients.userId,
    })
    .from(clients)
    .where(where)
    .orderBy(desc(clients.createdAt))
    .limit(CLIENTS_PAGE_SIZE)
    .offset((input.page - 1) * CLIENTS_PAGE_SIZE);

  return {
    items: rows.map(({ userId, ...rest }) => ({ ...rest, hasPortalAccess: userId !== null })),
    total,
    page: input.page,
    pageCount: Math.max(1, Math.ceil(total / CLIENTS_PAGE_SIZE)),
  };
}

/**
 * Validates the id before querying, so a malformed route param becomes a 404
 * rather than a PostgreSQL error on the failed uuid cast.
 */
export async function getClient(id: string): Promise<ClientDetail | null> {
  const parsed = clientIdSchema.safeParse(id);
  if (!parsed.success) return null;

  const [row] = await db.select().from(clients).where(eq(clients.id, parsed.data)).limit(1);
  if (!row) return null;

  return { ...row, hasPortalAccess: row.userId !== null };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
bun test src/features/clients/queries.test.ts
```

Expected: `12 pass, 0 fail`.

- [ ] **Step 5: Run the whole suite and typecheck**

```bash
bun test
```

Expected: `57 pass, 0 fail`.

```bash
bun run typecheck
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/features/clients/queries.ts src/features/clients/queries.test.ts
git commit -m "feat(clients): add list and detail queries with Arabic-aware search"
```

---

## Task 8: Server actions

Thin glue: guard, parse, delegate, revalidate, redirect. Not unit tested — it contains no logic worth testing that the layers below do not already cover.

**Files:**
- Create: `src/features/clients/actions.ts`

- [ ] **Step 1: Implement `actions.ts`**

Create `src/features/clients/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { type Locale } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { requireStaffSession } from '@/lib/session';

import {
  archiveClient,
  createClient,
  invitePortalAccess,
  restoreClient,
  revokePortalAccess,
  updateClient,
} from './mutations';
import { clientFormSchema, clientIdSchema, localeSchema } from './schema';

/**
 * A server action is a public endpoint. The layout guard protects the page
 * render, not the mutation, so every action below re-verifies the session.
 *
 * `messageKey` is a key inside the `clients` namespace, following the pattern in
 * `src/components/auth/actions.ts`, so the UI stays translatable.
 */
export type ClientFormState =
  | { status: 'idle' }
  | {
      status: 'error';
      messageKey: 'errors.invalid' | 'errors.unexpected';
      /** Shaped to match `z.flattenError`, so no cast is needed at either end. */
      fieldErrors?: Record<string, string[] | undefined>;
    };

export type PortalActionState =
  | { status: 'idle' }
  | { status: 'error'; messageKey: 'errors.noEmail' | 'errors.emailTaken' | 'errors.unexpected' }
  | { status: 'success'; messageKey: 'portal.invited' | 'portal.revoked' };

export const initialFormState: ClientFormState = { status: 'idle' };
export const initialPortalState: PortalActionState = { status: 'idle' };

function readForm(formData: FormData) {
  return {
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
    email: formData.get('email'),
    preferredLocale: formData.get('preferredLocale'),
    dateOfBirth: formData.get('dateOfBirth'),
    sex: formData.get('sex'),
    heightCm: formData.get('heightCm'),
    goal: formData.get('goal'),
    activityLevel: formData.get('activityLevel'),
    medicalNotes: formData.get('medicalNotes'),
    allergies: formData.get('allergies'),
    notes: formData.get('notes'),
  };
}

function readLocale(formData: FormData): Locale {
  return localeSchema.parse(formData.get('locale'));
}

export async function createClientAction(
  _previousState: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const locale = readLocale(formData);
  await requireStaffSession(locale);

  const parsed = clientFormSchema.safeParse(readForm(formData));

  if (!parsed.success) {
    return {
      status: 'error',
      messageKey: 'errors.invalid',
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  let id: string;

  try {
    ({ id } = await createClient(parsed.data));
  } catch (error) {
    console.error('[clients] create failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidatePath(`/${locale}/app/clients`);

  // Outside the try/catch — `redirect` signals by throwing.
  redirect(`/${locale}/app/clients/${id}`);
}

export async function updateClientAction(
  _previousState: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const locale = readLocale(formData);
  await requireStaffSession(locale);

  const id = clientIdSchema.parse(formData.get('clientId'));
  const parsed = clientFormSchema.safeParse(readForm(formData));

  if (!parsed.success) {
    return {
      status: 'error',
      messageKey: 'errors.invalid',
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  try {
    await updateClient(id, parsed.data);
  } catch (error) {
    console.error('[clients] update failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidatePath(`/${locale}/app/clients`);
  revalidatePath(`/${locale}/app/clients/${id}`);

  redirect(`/${locale}/app/clients/${id}`);
}

/** Archive and restore share a form; the intent arrives as a field. */
export async function setClientStatusAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  await requireStaffSession(locale);

  const id = clientIdSchema.parse(formData.get('clientId'));
  const intent = z.enum(['archive', 'restore']).parse(formData.get('intent'));

  if (intent === 'archive') {
    await archiveClient(id);
  } else {
    await restoreClient(id);
  }

  revalidatePath(`/${locale}/app/clients`);
  revalidatePath(`/${locale}/app/clients/${id}`);
}

export async function invitePortalAccessAction(
  _previousState: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const locale = readLocale(formData);
  await requireStaffSession(locale);

  const id = clientIdSchema.parse(formData.get('clientId'));

  let email: string;

  try {
    const result = await invitePortalAccess(id);

    if (!result.ok) {
      if (result.code === 'no_email') return { status: 'error', messageKey: 'errors.noEmail' };
      if (result.code === 'email_taken') return { status: 'error', messageKey: 'errors.emailTaken' };
      return { status: 'error', messageKey: 'errors.unexpected' };
    }

    // Read back from the database, never from the submitted form: the form field
    // is attacker-controlled and would let a caller aim the sign-in link
    // somewhere else.
    email = result.email;
  } catch (error) {
    console.error('[clients] invite failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  try {
    // In development this logs the sign-in URL to the server console; see
    // `sendMagicLink` in src/lib/auth.ts. It throws in production until an email
    // provider is configured — a pre-existing limitation, surfaced in the UI.
    await auth.api.signInMagicLink({
      body: { email, callbackURL: `/${locale}/portal` },
      headers: await headers(),
    });
  } catch (error) {
    // The account exists and is usable; only the notification failed.
    console.error('[clients] magic link send failed', error);
  }

  revalidatePath(`/${locale}/app/clients`);
  revalidatePath(`/${locale}/app/clients/${id}`);

  return { status: 'success', messageKey: 'portal.invited' };
}

export async function revokePortalAccessAction(
  _previousState: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const locale = readLocale(formData);
  await requireStaffSession(locale);

  const id = clientIdSchema.parse(formData.get('clientId'));

  try {
    await revokePortalAccess(id);
  } catch (error) {
    console.error('[clients] revoke failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidatePath(`/${locale}/app/clients`);
  revalidatePath(`/${locale}/app/clients/${id}`);

  return { status: 'success', messageKey: 'portal.revoked' };
}
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/features/clients/actions.ts
git commit -m "feat(clients): add server actions for the clients feature"
```

---

## Task 9: Messages

Both catalogues, Arabic first. Nothing in Tasks 10–14 typechecks until these keys exist.

**Files:**
- Modify: `src/i18n/messages/ar.json`, `src/i18n/messages/en.json`

- [ ] **Step 1: Add the `clients` namespace to `ar.json`**

Insert after the `"dashboard"` block in `src/i18n/messages/ar.json`:

```json
  "clients": {
    "title": "المتابعون",
    "subtitle": "سجلّ متابعي العيادة.",
    "new": "متابع جديد",
    "createTitle": "إضافة متابع",
    "editTitle": "تعديل بيانات المتابع",
    "edit": "تعديل",
    "empty": "لا يوجد متابعون بعد. ابدأ بإضافة أول متابع.",
    "emptyFiltered": "لا نتائج مطابقة لبحثك.",
    "searchPlaceholder": "ابحث بالاسم أو الهاتف أو البريد",
    "resultCount": "{total, number, integer} متابع",
    "notFound": "المتابع غير موجود",
    "notFoundDescription": "قد يكون هذا المتابع قد حُذف، أو أنّ الرابط غير صحيح.",
    "backToList": "العودة إلى قائمة المتابعين",
    "notProvided": "غير مُدخل",
    "yearsOld": "{count, number, integer} سنة",
    "sections": {
      "contact": "بيانات التواصل",
      "intake": "بيانات الحالة",
      "notes": "ملاحظات"
    },
    "fields": {
      "fullName": "الاسم الكامل",
      "phone": "رقم الهاتف",
      "email": "البريد الإلكتروني",
      "preferredLocale": "لغة المراسلة",
      "dateOfBirth": "تاريخ الميلاد",
      "age": "العمر",
      "sex": "الجنس",
      "heightCm": "الطول (سم)",
      "goal": "الهدف",
      "activityLevel": "مستوى النشاط",
      "medicalNotes": "ملاحظات طبية",
      "allergies": "الحساسية",
      "notes": "ملاحظات",
      "status": "الحالة",
      "createdAt": "تاريخ التسجيل",
      "portalAccess": "الدخول إلى البوابة"
    },
    "status": {
      "active": "نشِط",
      "archived": "مؤرشف",
      "all": "الكل"
    },
    "sex": {
      "female": "أنثى",
      "male": "ذكر"
    },
    "goal": {
      "weight_loss": "إنقاص الوزن",
      "weight_gain": "زيادة الوزن",
      "maintenance": "المحافظة على الوزن",
      "medical": "حالة طبية",
      "sports": "أداء رياضي"
    },
    "activity": {
      "sedentary": "خامل",
      "light": "نشاط خفيف",
      "moderate": "نشاط متوسط",
      "active": "نشِط",
      "very_active": "نشِط جدًا"
    },
    "actions": {
      "archive": "أرشفة",
      "restore": "إلغاء الأرشفة",
      "filter": "تصفية"
    },
    "pagination": {
      "previous": "السابق",
      "next": "التالي",
      "position": "صفحة {page, number, integer} من {pageCount, number, integer}"
    },
    "portal": {
      "title": "الدخول إلى البوابة",
      "none": "لا يملك هذا المتابع حسابًا في بوابة المتابعين.",
      "granted": "يستطيع هذا المتابع الدخول إلى البوابة عبر رابط يُرسل إلى بريده.",
      "invite": "منح صلاحية الدخول",
      "revoke": "سحب صلاحية الدخول",
      "invited": "تم إنشاء الحساب وإرسال رابط الدخول.",
      "revoked": "تم سحب صلاحية الدخول.",
      "devNotice": "في بيئة التطوير يُطبع رابط الدخول في سجلّ الخادم بدل إرساله بالبريد."
    },
    "errors": {
      "invalid": "تحقّق من الحقول المميّزة بالأحمر.",
      "noEmail": "أضف بريدًا إلكترونيًا للمتابع قبل منحه صلاحية الدخول.",
      "emailTaken": "هذا البريد مستخدم لحساب آخر.",
      "unexpected": "حدث خطأ غير متوقع. حاول مجددًا."
    }
  },
```

- [ ] **Step 2: Add the matching namespace to `en.json`**

Insert after the `"dashboard"` block in `src/i18n/messages/en.json`:

```json
  "clients": {
    "title": "Clients",
    "subtitle": "The clinic's client register.",
    "new": "New client",
    "createTitle": "Add a client",
    "editTitle": "Edit client",
    "edit": "Edit",
    "empty": "No clients yet. Start by adding your first one.",
    "emptyFiltered": "No clients match your search.",
    "searchPlaceholder": "Search by name, phone or email",
    "resultCount": "{total, number, integer} clients",
    "notFound": "Client not found",
    "notFoundDescription": "This client may have been removed, or the link is incorrect.",
    "backToList": "Back to clients",
    "notProvided": "Not provided",
    "yearsOld": "{count, number, integer} years",
    "sections": {
      "contact": "Contact details",
      "intake": "Intake profile",
      "notes": "Notes"
    },
    "fields": {
      "fullName": "Full name",
      "phone": "Phone",
      "email": "Email",
      "preferredLocale": "Correspondence language",
      "dateOfBirth": "Date of birth",
      "age": "Age",
      "sex": "Sex",
      "heightCm": "Height (cm)",
      "goal": "Goal",
      "activityLevel": "Activity level",
      "medicalNotes": "Medical notes",
      "allergies": "Allergies",
      "notes": "Notes",
      "status": "Status",
      "createdAt": "Registered",
      "portalAccess": "Portal access"
    },
    "status": {
      "active": "Active",
      "archived": "Archived",
      "all": "All"
    },
    "sex": {
      "female": "Female",
      "male": "Male"
    },
    "goal": {
      "weight_loss": "Weight loss",
      "weight_gain": "Weight gain",
      "maintenance": "Weight maintenance",
      "medical": "Medical condition",
      "sports": "Sports performance"
    },
    "activity": {
      "sedentary": "Sedentary",
      "light": "Lightly active",
      "moderate": "Moderately active",
      "active": "Active",
      "very_active": "Very active"
    },
    "actions": {
      "archive": "Archive",
      "restore": "Restore",
      "filter": "Filter"
    },
    "pagination": {
      "previous": "Previous",
      "next": "Next",
      "position": "Page {page, number, integer} of {pageCount, number, integer}"
    },
    "portal": {
      "title": "Portal access",
      "none": "This client does not have a portal account.",
      "granted": "This client can sign in to the portal with a link emailed to them.",
      "invite": "Grant portal access",
      "revoke": "Revoke portal access",
      "invited": "Account created and a sign-in link sent.",
      "revoked": "Portal access revoked.",
      "devNotice": "In development the sign-in link is printed to the server console instead of emailed."
    },
    "errors": {
      "invalid": "Check the fields highlighted in red.",
      "noEmail": "Add an email address for this client before granting portal access.",
      "emailTaken": "That email already belongs to another account.",
      "unexpected": "Something went wrong. Please try again."
    }
  },
```

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```

Expected: no output. A failure here means the two files disagree — `ar.json` is the type source.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/ar.json src/i18n/messages/en.json
git commit -m "feat(clients): add Arabic and English messages for the clients module"
```

---

## Task 10: UI primitives

Three primitives the module needs and the project does not have. Hand-written in the style of `src/components/ui/input.tsx` rather than pulled from the shadcn registry, so the build stays reproducible offline.

**Files:**
- Create: `src/components/ui/textarea.tsx`, `src/components/ui/select.tsx`, `src/components/ui/badge.tsx`

- [ ] **Step 1: Create `textarea.tsx`**

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
```

- [ ] **Step 2: Create `select.tsx`**

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A native <select>. Deliberately not a JavaScript combobox: it is keyboard and
 * screen-reader correct for free, mirrors automatically in RTL, and ships no
 * client bundle. `bg-position` is left to the browser so the arrow follows the
 * document direction.
 */
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export { Select }
```

- [ ] **Step 3: Create `badge.tsx`**

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-primary",
        muted: "border-transparent bg-muted text-muted-foreground",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
```

- [ ] **Step 4: Lint and typecheck**

```bash
bun run lint
```

Expected: no errors. Any `pl-`/`pr-`/`left-` in the classes above is a lint error — there are none, keep it that way.

```bash
bun run typecheck
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/textarea.tsx src/components/ui/select.tsx src/components/ui/badge.tsx
git commit -m "feat(ui): add textarea, native select and badge primitives"
```

---

## Task 11: Clients list — components, route, and navigation

**Files:**
- Create: `src/features/clients/components/status-badge.tsx`, `client-search.tsx`, `client-table.tsx`, `client-pagination.tsx`, `src/app/[locale]/app/clients/page.tsx`
- Modify: `src/components/layout/sidebar.tsx`, `src/app/[locale]/app/layout.tsx`

- [ ] **Step 1: Create `status-badge.tsx`**

Create `src/features/clients/components/status-badge.tsx`:

```tsx
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';

export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('clients');
  const isArchived = status === 'archived';

  return (
    <Badge variant={isArchived ? 'muted' : 'default'}>
      {isArchived ? t('status.archived') : t('status.active')}
    </Badge>
  );
}
```

- [ ] **Step 2: Create `client-search.tsx`**

Create `src/features/clients/components/client-search.tsx`:

```tsx
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { CLIENT_STATUSES, type ListClientsInput } from '@/features/clients/schema';

/**
 * A plain GET form. Submitting it puts the filters in the URL, which is what the
 * page reads — so the filtered list is a shareable address and this component
 * ships no client JavaScript at all.
 */
export function ClientSearch({ input }: { input: ListClientsInput }) {
  const t = useTranslations('clients');

  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1">
        <Input
          name="q"
          type="search"
          defaultValue={input.q ?? ''}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
        />
      </div>

      <Select name="status" defaultValue={input.status} aria-label={t('fields.status')} className="w-40">
        {CLIENT_STATUSES.map((status) => (
          <option key={status} value={status}>
            {t(`status.${status}`)}
          </option>
        ))}
        <option value="all">{t('status.all')}</option>
      </Select>

      <Button type="submit" variant="outline">
        {t('actions.filter')}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Create `client-table.tsx`**

Create `src/features/clients/components/client-table.tsx`:

```tsx
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/features/clients/components/status-badge';
import { type ClientListResult } from '@/features/clients/queries';
import { Link } from '@/i18n/navigation';

export function ClientTable({ result, filtered }: { result: ClientListResult; filtered: boolean }) {
  const t = useTranslations('clients');

  if (result.items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {filtered ? t('emptyFiltered') : t('empty')}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-start font-medium">{t('fields.fullName')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('fields.phone')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('fields.email')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('fields.status')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('fields.portalAccess')}</th>
          </tr>
        </thead>
        <tbody>
          {result.items.map((client) => (
            <tr key={client.id} className="border-t border-border hover:bg-muted/40">
              <td className="px-3 py-2 text-start">
                <Link href={`/app/clients/${client.id}`} className="font-medium underline-offset-4 hover:underline">
                  {client.fullName}
                </Link>
              </td>
              <td className="px-3 py-2 text-start" dir="ltr">
                {client.phone ?? '—'}
              </td>
              <td className="px-3 py-2 text-start" dir="ltr">
                {client.email ?? '—'}
              </td>
              <td className="px-3 py-2 text-start">
                <StatusBadge status={client.status} />
              </td>
              <td className="px-3 py-2 text-start">
                {client.hasPortalAccess ? <Badge variant="outline">{t('portal.title')}</Badge> : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Create `client-pagination.tsx`**

Create `src/features/clients/components/client-pagination.tsx`:

```tsx
import { useTranslations } from 'next-intl';

import { type ClientListResult } from '@/features/clients/queries';
import { type ListClientsInput } from '@/features/clients/schema';
import { Link } from '@/i18n/navigation';

export function ClientPagination({ result, input }: { result: ClientListResult; input: ListClientsInput }) {
  const t = useTranslations('clients');

  if (result.pageCount <= 1) return null;

  const query = (page: number) => ({
    pathname: '/app/clients' as const,
    query: { ...(input.q ? { q: input.q } : {}), status: input.status, page: String(page) },
  });

  return (
    <nav className="flex items-center justify-between gap-4 text-sm" aria-label={t('title')}>
      {result.page > 1 ? (
        <Link href={query(result.page - 1)} className="underline-offset-4 hover:underline">
          {t('pagination.previous')}
        </Link>
      ) : (
        <span className="text-muted-foreground">{t('pagination.previous')}</span>
      )}

      <span className="text-muted-foreground">
        {t('pagination.position', { page: result.page, pageCount: result.pageCount })}
      </span>

      {result.page < result.pageCount ? (
        <Link href={query(result.page + 1)} className="underline-offset-4 hover:underline">
          {t('pagination.next')}
        </Link>
      ) : (
        <span className="text-muted-foreground">{t('pagination.next')}</span>
      )}
    </nav>
  );
}
```

- [ ] **Step 5: Create the list route**

Create `src/app/[locale]/app/clients/page.tsx`:

```tsx
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { buttonVariants } from '@/components/ui/button';
import { ClientPagination } from '@/features/clients/components/client-pagination';
import { ClientSearch } from '@/features/clients/components/client-search';
import { ClientTable } from '@/features/clients/components/client-table';
import { listClients } from '@/features/clients/queries';
import { listClientsSchema } from '@/features/clients/schema';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { requireStaffSession } from '@/lib/session';

type ClientsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: ClientsPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'clients' });
  return { title: t('title') };
}

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export default async function ClientsPage({ params, searchParams }: ClientsPageProps) {
  const locale = await resolveLocale(params);
  await requireStaffSession(locale);

  const raw = await searchParams;
  const input = listClientsSchema.parse({
    q: single(raw.q),
    status: single(raw.status),
    page: single(raw.page),
  });

  const [result, t] = await Promise.all([listClients(input), getTranslations('clients')]);

  return (
    <div className="space-y-6 text-start">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">{t('resultCount', { total: result.total })}</p>
        </div>

        <Link href="/app/clients/new" className={buttonVariants()}>
          {t('new')}
        </Link>
      </div>

      <ClientSearch input={input} />
      <ClientTable result={result} filtered={Boolean(input.q) || input.status !== 'active'} />
      <ClientPagination result={result} input={input} />
    </div>
  );
}
```

- [ ] **Step 6: Add Clients to the sidebar**

In `src/components/layout/sidebar.tsx`, replace the `NavItem` type at lines 5-8 with:

```ts
type NavItem = {
  href: '/app' | '/app/clients' | '/portal';
  labelKey: 'dashboard' | 'clients' | 'portalHome';
};
```

In `src/app/[locale]/app/layout.tsx`, replace line 14 with:

```ts
const NAV_ITEMS = [
  { href: '/app', labelKey: 'dashboard' },
  { href: '/app/clients', labelKey: 'clients' },
] as const;
```

- [ ] **Step 7: Verify**

```bash
bun run lint
```

Expected: no errors.

```bash
bun run typecheck
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/features/clients/components src/app/[locale]/app/clients/page.tsx src/components/layout/sidebar.tsx "src/app/[locale]/app/layout.tsx"
git commit -m "feat(clients): add the clients list screen and sidebar entry"
```

---

## Task 12: Create and edit form

**Files:**
- Create: `src/features/clients/types.ts`, `src/features/clients/components/client-form.tsx`, `src/app/[locale]/app/clients/new/page.tsx`, `src/app/[locale]/app/clients/[clientId]/edit/page.tsx`

- [ ] **Step 1: Create `types.ts`**

Create `src/features/clients/types.ts`:

```ts
/**
 * Plain data shapes shared with client components.
 *
 * This module deliberately imports nothing. `verbatimModuleSyntax` is on, so
 * `import { type X } from './queries'` in a client component still emits a real
 * `import {} from './queries'` — which would pull `@/db`, and with it the
 * Postgres driver, into the browser bundle. Types crossing the server/client
 * boundary live here instead.
 */
export type ClientFormValues = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  preferredLocale: string;
  dateOfBirth: string | null;
  sex: string | null;
  heightCm: number | null;
  goal: string | null;
  activityLevel: string | null;
  medicalNotes: string | null;
  allergies: string | null;
  notes: string | null;
};
```

- [ ] **Step 2: Create `client-form.tsx`**

Create `src/features/clients/components/client-form.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  createClientAction,
  initialFormState,
  updateClientAction,
  type ClientFormState,
} from '@/features/clients/actions';
import {
  CLIENT_ACTIVITY_LEVELS,
  CLIENT_GOALS,
  CLIENT_SEXES,
} from '@/features/clients/schema';
import { type ClientFormValues } from '@/features/clients/types';
import { Link } from '@/i18n/navigation';
import { locales, type Locale } from '@/i18n/routing';

type ClientFormProps = {
  locale: Locale;
  /** Absent when creating. */
  client?: ClientFormValues;
};

export function ClientForm({ locale, client }: ClientFormProps) {
  const t = useTranslations('clients');
  const tCommon = useTranslations('common');

  const [state, formAction] = useActionState(
    client ? updateClientAction : createClientAction,
    initialFormState,
  );

  const errorFor = (field: string) =>
    state.status === 'error' ? state.fieldErrors?.[field]?.[0] : undefined;

  return (
    <form action={formAction} className="max-w-2xl space-y-6 text-start">
      <input type="hidden" name="locale" value={locale} />
      {client ? <input type="hidden" name="clientId" value={client.id} /> : null}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">{t('sections.contact')}</legend>

        <Field id="fullName" label={t('fields.fullName')} error={errorFor('fullName')}>
          <Input id="fullName" name="fullName" required defaultValue={client?.fullName ?? ''} />
        </Field>

        <Field id="phone" label={t('fields.phone')} error={errorFor('phone')}>
          <Input id="phone" name="phone" type="tel" dir="ltr" defaultValue={client?.phone ?? ''} />
        </Field>

        <Field id="email" label={t('fields.email')} error={errorFor('email')}>
          <Input id="email" name="email" type="email" dir="ltr" defaultValue={client?.email ?? ''} />
        </Field>

        <Field id="preferredLocale" label={t('fields.preferredLocale')} error={errorFor('preferredLocale')}>
          <Select id="preferredLocale" name="preferredLocale" defaultValue={client?.preferredLocale ?? locale}>
            {locales.map((value) => (
              <option key={value} value={value}>
                {value === 'ar' ? 'العربية' : 'English'}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">{t('sections.intake')}</legend>

        <Field id="dateOfBirth" label={t('fields.dateOfBirth')} error={errorFor('dateOfBirth')}>
          <Input id="dateOfBirth" name="dateOfBirth" type="date" dir="ltr" defaultValue={client?.dateOfBirth ?? ''} />
        </Field>

        <Field id="sex" label={t('fields.sex')} error={errorFor('sex')}>
          <Select id="sex" name="sex" defaultValue={client?.sex ?? ''}>
            <option value="">{t('notProvided')}</option>
            {CLIENT_SEXES.map((value) => (
              <option key={value} value={value}>
                {t(`sex.${value}`)}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="heightCm" label={t('fields.heightCm')} error={errorFor('heightCm')}>
          <Input
            id="heightCm"
            name="heightCm"
            type="number"
            inputMode="numeric"
            min={30}
            max={280}
            dir="ltr"
            defaultValue={client?.heightCm ?? ''}
          />
        </Field>

        <Field id="goal" label={t('fields.goal')} error={errorFor('goal')}>
          <Select id="goal" name="goal" defaultValue={client?.goal ?? ''}>
            <option value="">{t('notProvided')}</option>
            {CLIENT_GOALS.map((value) => (
              <option key={value} value={value}>
                {t(`goal.${value}`)}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="activityLevel" label={t('fields.activityLevel')} error={errorFor('activityLevel')}>
          <Select id="activityLevel" name="activityLevel" defaultValue={client?.activityLevel ?? ''}>
            <option value="">{t('notProvided')}</option>
            {CLIENT_ACTIVITY_LEVELS.map((value) => (
              <option key={value} value={value}>
                {t(`activity.${value}`)}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">{t('sections.notes')}</legend>

        <Field id="medicalNotes" label={t('fields.medicalNotes')} error={errorFor('medicalNotes')}>
          <Textarea id="medicalNotes" name="medicalNotes" rows={3} defaultValue={client?.medicalNotes ?? ''} />
        </Field>

        <Field id="allergies" label={t('fields.allergies')} error={errorFor('allergies')}>
          <Textarea id="allergies" name="allergies" rows={2} defaultValue={client?.allergies ?? ''} />
        </Field>

        <Field id="notes" label={t('fields.notes')} error={errorFor('notes')}>
          <Textarea id="notes" name="notes" rows={3} defaultValue={client?.notes ?? ''} />
        </Field>
      </fieldset>

      <FormMessage state={state} />

      <div className="flex items-center gap-3">
        <SubmitButton label={tCommon('save')} />
        <Link
          href={client ? `/app/clients/${client.id}` : '/app/clients'}
          className={buttonVariants({ variant: 'outline' })}
        >
          {tCommon('cancel')}
        </Link>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FormMessage({ state }: { state: ClientFormState }) {
  const t = useTranslations('clients');
  if (state.status !== 'error') return null;

  return (
    <p role="status" className="text-sm text-destructive">
      {t(state.messageKey)}
    </p>
  );
}

function SubmitButton({ label }: { label: string }) {
  const tCommon = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? tCommon('loading') : label}
    </Button>
  );
}
```

- [ ] **Step 3: Create the "new client" route**

Create `src/app/[locale]/app/clients/new/page.tsx`:

```tsx
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { ClientForm } from '@/features/clients/components/client-form';
import { resolveLocale } from '@/i18n/params';
import { requireStaffSession } from '@/lib/session';

type NewClientPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: NewClientPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'clients' });
  return { title: t('createTitle') };
}

export default async function NewClientPage({ params }: NewClientPageProps) {
  const locale = await resolveLocale(params);
  await requireStaffSession(locale);

  const t = await getTranslations('clients');

  return (
    <div className="space-y-6 text-start">
      <h2 className="text-2xl font-semibold tracking-tight">{t('createTitle')}</h2>
      <ClientForm locale={locale} />
    </div>
  );
}
```

- [ ] **Step 4: Create the edit route**

Create `src/app/[locale]/app/clients/[clientId]/edit/page.tsx`:

```tsx
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { ClientForm } from '@/features/clients/components/client-form';
import { getClient } from '@/features/clients/queries';
import { resolveLocale } from '@/i18n/params';
import { requireStaffSession } from '@/lib/session';

type EditClientPageProps = {
  params: Promise<{ locale: string; clientId: string }>;
};

export async function generateMetadata({ params }: EditClientPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'clients' });
  return { title: t('editTitle') };
}

export default async function EditClientPage({ params }: EditClientPageProps) {
  const locale = await resolveLocale(params);
  await requireStaffSession(locale);

  const { clientId } = await params;
  const client = await getClient(clientId);

  if (!client) {
    notFound();
  }

  const t = await getTranslations('clients');

  return (
    <div className="space-y-6 text-start">
      <h2 className="text-2xl font-semibold tracking-tight">{t('editTitle')}</h2>
      <ClientForm locale={locale} client={client} />
    </div>
  );
}
```

- [ ] **Step 5: Verify**

```bash
bun run lint
```

Expected: no errors.

```bash
bun run typecheck
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/features/clients/types.ts src/features/clients/components/client-form.tsx "src/app/[locale]/app/clients/new" "src/app/[locale]/app/clients/[clientId]/edit"
git commit -m "feat(clients): add the create and edit client form"
```

---

## Task 13: Client detail, portal access, and not-found

**Files:**
- Create: `src/features/clients/components/client-profile.tsx`, `portal-access-card.tsx`, `archive-button.tsx`, `src/app/[locale]/app/clients/[clientId]/page.tsx`, `src/app/[locale]/app/clients/[clientId]/not-found.tsx`

- [ ] **Step 1: Create `client-profile.tsx`**

Create `src/features/clients/components/client-profile.tsx`:

```tsx
import { useFormatter, useTranslations } from 'next-intl';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { calculateAge } from '@/features/clients/age';
import { type ClientDetail } from '@/features/clients/queries';
import {
  CLIENT_ACTIVITY_LEVELS,
  CLIENT_GOALS,
  CLIENT_SEXES,
} from '@/features/clients/schema';

/**
 * The enum-like columns are `text` in the database, so a value written by an
 * older version of the app — or by hand — may not be a known key. Narrowing here
 * means an unrecognised value renders as "not provided" instead of crashing the
 * page with a missing-message error or, worse, silently displaying the wrong
 * label.
 */
function isMember<T extends string>(values: readonly T[], value: string | null): value is T {
  return value !== null && (values as readonly string[]).includes(value);
}

export function ClientProfile({ client }: { client: ClientDetail }) {
  const t = useTranslations('clients');
  const format = useFormatter();

  const age = client.dateOfBirth ? calculateAge(client.dateOfBirth) : null;

  const sexLabel = isMember(CLIENT_SEXES, client.sex) ? t(`sex.${client.sex}`) : null;
  const goalLabel = isMember(CLIENT_GOALS, client.goal) ? t(`goal.${client.goal}`) : null;
  const activityLabel = isMember(CLIENT_ACTIVITY_LEVELS, client.activityLevel)
    ? t(`activity.${client.activityLevel}`)
    : null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('sections.contact')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label={t('fields.phone')} value={client.phone} ltr />
          <Row label={t('fields.email')} value={client.email} ltr />
          <Row
            label={t('fields.preferredLocale')}
            value={client.preferredLocale === 'ar' ? 'العربية' : 'English'}
          />
          <Row
            label={t('fields.createdAt')}
            value={format.dateTime(client.createdAt, 'date')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('sections.intake')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label={t('fields.dateOfBirth')} value={client.dateOfBirth} ltr />
          <Row label={t('fields.age')} value={age === null ? null : t('yearsOld', { count: age })} />
          <Row label={t('fields.sex')} value={sexLabel} />
          <Row
            label={t('fields.heightCm')}
            value={client.heightCm === null ? null : format.number(client.heightCm, 'integer')}
          />
          <Row label={t('fields.goal')} value={goalLabel} />
          <Row label={t('fields.activityLevel')} value={activityLabel} />
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">{t('sections.notes')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label={t('fields.medicalNotes')} value={client.medicalNotes} />
          <Row label={t('fields.allergies')} value={client.allergies} />
          <Row label={t('fields.notes')} value={client.notes} />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, ltr = false }: { label: string; value: string | null; ltr?: boolean }) {
  const t = useTranslations('clients');

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium whitespace-pre-line" dir={ltr ? 'ltr' : undefined}>
        {value === null || value === '' ? (
          <span className="font-normal text-muted-foreground">{t('notProvided')}</span>
        ) : (
          value
        )}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Create `portal-access-card.tsx`**

Create `src/features/clients/components/portal-access-card.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  initialPortalState,
  invitePortalAccessAction,
  revokePortalAccessAction,
  type PortalActionState,
} from '@/features/clients/actions';
import { type Locale } from '@/i18n/routing';

type PortalAccessCardProps = {
  locale: Locale;
  clientId: string;
  hasPortalAccess: boolean;
};

export function PortalAccessCard({ locale, clientId, hasPortalAccess }: PortalAccessCardProps) {
  const t = useTranslations('clients');

  const [state, formAction] = useActionState(
    hasPortalAccess ? revokePortalAccessAction : invitePortalAccessAction,
    initialPortalState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('portal.title')}</CardTitle>
        <CardDescription>{hasPortalAccess ? t('portal.granted') : t('portal.none')}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="clientId" value={clientId} />

          <Message state={state} />

          <SubmitButton label={hasPortalAccess ? t('portal.revoke') : t('portal.invite')} destructive={hasPortalAccess} />
        </form>

        {!hasPortalAccess ? <p className="text-xs text-muted-foreground">{t('portal.devNotice')}</p> : null}
      </CardContent>
    </Card>
  );
}

function Message({ state }: { state: PortalActionState }) {
  const t = useTranslations('clients');
  if (state.status === 'idle') return null;

  return (
    <p
      role="status"
      className={state.status === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
    >
      {t(state.messageKey)}
    </p>
  );
}

function SubmitButton({ label, destructive }: { label: string; destructive: boolean }) {
  const tCommon = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={destructive ? 'outline' : 'default'} disabled={pending}>
      {pending ? tCommon('loading') : label}
    </Button>
  );
}
```

- [ ] **Step 3: Create `archive-button.tsx`**

Create `src/features/clients/components/archive-button.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { setClientStatusAction } from '@/features/clients/actions';
import { type Locale } from '@/i18n/routing';

export function ArchiveButton({
  locale,
  clientId,
  archived,
}: {
  locale: Locale;
  clientId: string;
  archived: boolean;
}) {
  const t = useTranslations('clients');

  return (
    <form action={setClientStatusAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="intent" value={archived ? 'restore' : 'archive'} />
      <Submit label={archived ? t('actions.restore') : t('actions.archive')} />
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const tCommon = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? tCommon('loading') : label}
    </Button>
  );
}
```

- [ ] **Step 4: Create the detail route**

Create `src/app/[locale]/app/clients/[clientId]/page.tsx`:

```tsx
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { buttonVariants } from '@/components/ui/button';
import { ArchiveButton } from '@/features/clients/components/archive-button';
import { ClientProfile } from '@/features/clients/components/client-profile';
import { PortalAccessCard } from '@/features/clients/components/portal-access-card';
import { StatusBadge } from '@/features/clients/components/status-badge';
import { getClient } from '@/features/clients/queries';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { requireStaffSession } from '@/lib/session';

type ClientPageProps = {
  params: Promise<{ locale: string; clientId: string }>;
};

export async function generateMetadata({ params }: ClientPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const { clientId } = await params;

  const client = await getClient(clientId);
  if (client) return { title: client.fullName };

  const t = await getTranslations({ locale, namespace: 'clients' });
  return { title: t('notFound') };
}

export default async function ClientPage({ params }: ClientPageProps) {
  const locale = await resolveLocale(params);
  await requireStaffSession(locale);

  const { clientId } = await params;
  const client = await getClient(clientId);

  if (!client) {
    notFound();
  }

  const t = await getTranslations('clients');

  return (
    <div className="space-y-6 text-start">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">{client.fullName}</h2>
          <StatusBadge status={client.status} />
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/app/clients/${client.id}/edit`} className={buttonVariants({ variant: 'outline' })}>
            {t('edit')}
          </Link>
          <ArchiveButton locale={locale} clientId={client.id} archived={client.status === 'archived'} />
        </div>
      </div>

      <ClientProfile client={client} />

      <PortalAccessCard locale={locale} clientId={client.id} hasPortalAccess={client.hasPortalAccess} />

      <Link href="/app/clients" className="inline-block text-sm underline-offset-4 hover:underline">
        {t('backToList')}
      </Link>
    </div>
  );
}
```

- [ ] **Step 5: Create the localised not-found boundary**

Create `src/app/[locale]/app/clients/[clientId]/not-found.tsx`:

```tsx
import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default async function ClientNotFound() {
  const t = await getTranslations('clients');

  return (
    <div className="space-y-4 text-start">
      <h2 className="text-2xl font-semibold tracking-tight">{t('notFound')}</h2>
      <p className="text-muted-foreground">{t('notFoundDescription')}</p>
      <Link href="/app/clients" className={buttonVariants({ variant: 'outline' })}>
        {t('backToList')}
      </Link>
    </div>
  );
}
```

- [ ] **Step 6: Verify**

```bash
bun run lint
```

Expected: no errors.

```bash
bun run typecheck
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/features/clients/components "src/app/[locale]/app/clients/[clientId]"
git commit -m "feat(clients): add the client detail screen with portal access"
```

---

## Task 14: Seed data

Without this you cannot exercise a client list, and RTL bugs hide in empty tables.

**Files:**
- Modify: `scripts/seed.ts`

- [ ] **Step 1: Rewrite the seed script**

Replace the whole of `scripts/seed.ts`:

```ts
/**
 * Seed script — run with `bun run db:seed`.
 *
 * Executed directly by Bun; there is no tsx/ts-node in this project.
 *
 * Idempotent: re-running replaces the seeded clients rather than duplicating
 * them. It is for local development only and refuses to run in production.
 */
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { account, clients, user } from '@/db/schema';
import { createClient, invitePortalAccess } from '@/features/clients/mutations';
import { auth } from '@/lib/auth';

const STAFF_EMAIL = 'dietitian@clinic.ps';
const STAFF_PASSWORD = 'clinic-dev-password';

const SEED_CLIENTS = [
  { fullName: 'أحمد خليل', phone: '0599123456', email: 'ahmad@example.ps', preferredLocale: 'ar' as const, dateOfBirth: '1988-04-12', sex: 'male' as const, heightCm: 178, goal: 'weight_loss' as const, activityLevel: 'light' as const, allergies: 'لا يوجد' },
  { fullName: 'سارة عبد الله', phone: '0598222333', email: 'sara@example.ps', preferredLocale: 'ar' as const, dateOfBirth: '1994-11-03', sex: 'female' as const, heightCm: 165, goal: 'maintenance' as const, activityLevel: 'moderate' as const },
  { fullName: 'إبراهيم نصّار', phone: '0597444555', preferredLocale: 'ar' as const, dateOfBirth: '1972-01-20', sex: 'male' as const, heightCm: 170, goal: 'medical' as const, activityLevel: 'sedentary' as const, medicalNotes: 'ارتفاع ضغط الدم' },
  { fullName: 'فاطمة درويش', preferredLocale: 'ar' as const, sex: 'female' as const, goal: 'weight_gain' as const },
  { fullName: 'Layla Haddad', email: 'layla@example.ps', preferredLocale: 'en' as const, dateOfBirth: '2000-07-09', sex: 'female' as const, heightCm: 160, goal: 'sports' as const, activityLevel: 'very_active' as const },
] satisfies Parameters<typeof createClient>[0][];

async function seed(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('refusing to seed a production database');
  }

  const [existingStaff] = await db.select({ id: user.id }).from(user).where(eq(user.email, STAFF_EMAIL)).limit(1);

  if (!existingStaff) {
    /**
     * Not `auth.api.signUpEmail`: `autoSignIn` is on, so signing up tries to set
     * a session cookie through the `nextCookies` plugin, and `cookies()` throws
     * outside a request scope — which a Bun script has none of.
     *
     * Instead the rows are written directly, using Better Auth's own hasher so
     * the password verifies at sign-in. `providerId: 'credential'` is what
     * Better Auth looks for on an email/password account.
     */
    const ctx = await auth.$context;
    const userId = crypto.randomUUID();

    await db.insert(user).values({
      id: userId,
      name: 'أخصائي التغذية',
      email: STAFF_EMAIL,
      emailVerified: true,
      role: 'staff',
      locale: 'ar',
    });

    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: await ctx.password.hash(STAFF_PASSWORD),
    });

    console.info(`staff account created: ${STAFF_EMAIL} / ${STAFF_PASSWORD}`);
  } else {
    console.info(`staff account already present: ${STAFF_EMAIL}`);
  }

  // Clients are replaced wholesale so the script stays idempotent. Their portal
  // accounts go too — `clients.user_id` is `set null`, so deleting only the
  // clients would leave client-role users behind and the next invite would then
  // fail with email_taken.
  await db.delete(clients);
  await db.delete(user).where(eq(user.role, 'client'));

  const created = await Promise.all(SEED_CLIENTS.map((input) => createClient(input)));

  // One client gets portal access so the invited state is visible in the UI.
  const [, second] = created;
  if (second) {
    await invitePortalAccess(second.id);
  }

  // One archived client so the status filter has something to filter.
  const [first] = created;
  if (first) {
    await db.update(clients).set({ status: 'archived' }).where(eq(clients.id, first.id));
  }

  console.info(`seeded ${created.length} clients`);
}

await seed();
process.exit(0);
```

- [ ] **Step 2: Run the seed**

```bash
bun run db:seed
```

Expected: `staff account created: dietitian@clinic.ps / clinic-dev-password` then `seeded 5 clients`.

- [ ] **Step 3: Verify the seeded password actually works**

The direct-insert path above bypasses Better Auth's sign-up, so confirm sign-in before trusting it.

```bash
bun run dev
```

Sign in at <http://localhost:3000/ar/login> with `dietitian@clinic.ps` / `clinic-dev-password`. Expected: you land on `/ar/app`. If sign-in fails, the account row is wrong — check `provider_id` is exactly `credential` and `account_id` equals the user id.

- [ ] **Step 4: Run the seed a second time**

```bash
bun run db:seed
```

Expected: `staff account already present` then `seeded 5 clients` — no duplicate-key error. That is what idempotent means here.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed.ts
git commit -m "feat(clients): seed a staff account and sample clients"
```

---

## Task 15: Full verification

Do not skip. Every claim below must be confirmed by output you actually saw.

- [ ] **Step 1: Run the whole test suite**

```bash
bun test
```

Expected: `57 pass, 0 fail`.

- [ ] **Step 2: Lint**

```bash
bun run lint
```

Expected: no errors. Physical-property violations fail here.

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```

Expected: no output.

- [ ] **Step 4: Production build**

```bash
bun run build
```

Expected: build succeeds, with `/[locale]/app/clients` and its child routes listed.

- [ ] **Step 5: Manual pass against the acceptance criteria**

```bash
bun run dev
```

Sign in at <http://localhost:3000/ar/login> as `dietitian@clinic.ps` / `clinic-dev-password`, then walk the spec's acceptance criteria:

1. Clients appears in the sidebar, in `/ar` and `/en`.
2. Creating a client with only a name succeeds.
3. Searching `احمد` finds `أحمد خليل`.
4. The status filter hides archived clients by default and can reveal them.
5. The detail page shows contact, intake and portal status.
6. Inviting `فاطمة درويش` (no email) is refused with the specific message.
7. Inviting a client whose email already belongs to a user is refused, and no row is written.
8. Inviting a client with an email logs a magic link in the server console; following it lands on `/ar/portal`.
9. Revoking access ends the client's session and leaves the record intact.
10. Every screen reads correctly in Arabic RTL, with Western digits and Gregorian dates.

- [ ] **Step 6: Commit anything outstanding**

```bash
git status --short
```

Expected: clean. If not, review and commit what remains.

---

## Notes for the implementer

**If `bun test` cannot connect:** `TEST_DATABASE_URL` is missing from `.env.test.local`, or `createdb dietitian_test` was never run. The preload fails loudly with the reason. Note that putting the variable in `.env.local` will *not* work — Bun skips that file when `NODE_ENV=test`.

**After any schema change:** run `bun run db:generate`, then **both** `bun run db:migrate` and `bun run db:migrate:test`. Forgetting the second gives integration failures that look like logic bugs.

**Test count drift:** the counts quoted above — 2 smoke, 7 search, 6 age, 14 schema, 16 mutations, 12 queries — total 57. If your count differs you added or dropped a test; reconcile before moving on rather than editing the number.

**Do not add `pl-`, `ml-`, `text-left`, `left-`, or `border-l`** anywhere. The lint rule rejects them, including inside `cn()` and template literals.
