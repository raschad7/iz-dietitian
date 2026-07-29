# Client Portal Credentials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace magic-link portal sign-in with credentials the dietitian issues — an editable name-based username and a temporary password the client must replace at first sign-in.

**Architecture:** Better Auth's built-in `username` plugin provides `/sign-in/username`. Portal accounts carry a synthetic non-routable `@portal.invalid` address to satisfy the `NOT NULL UNIQUE` constraint on `users.email`. Credential issuing lives in `src/features/clients/portal-credentials.ts` (Next-free, so `bun test` drives it directly); the actions layer wraps it.

**Tech Stack:** Next.js 16 App Router, Better Auth 1.6.25, Drizzle + PostgreSQL, Zod 4, next-intl, Bun.

**Spec:** `docs/superpowers/specs/2026-07-29-client-portal-credentials-design.md`

---

## Conventions this codebase enforces

1. **Logical CSS properties only.** `pl-*`, `ml-*`, `text-left`, `left-*`, `border-l-*` are lint **errors**. Use `ps-*`, `ms-*`, `text-start`, `start-*`, `border-s-*`.
2. **`ar.json` is the source of truth** and types the catalogue. Add there first, then `en.json`. A key only in English is a type error.
3. **A `"use server"` module may only export async functions.** State shapes live in `form-state.ts`.
4. **Types crossing to client components import nothing** — see `src/features/clients/types.ts`.
5. **snake_case columns, `timestamptz`, explicit column names.**
6. **Business logic never in `src/app/**`.**
7. **Modules under test import nothing from Next.js.**

## Three facts that will bite an implementer

**Portal accounts must be created with `emailVerified: true`.** `requireEmailVerification` is global, so an unverified account cannot sign in at all — and a `.invalid` address can never be verified. `purgeUnverifiedAccounts` is already scoped to `role = 'staff'`, but the verification gate alone is fatal.

**Better Auth has ONE global `minPasswordLength`.** It drops to 6 for clients; the staff minimum of 10 is enforced in the staff Zod schema instead. Never raise the global back to 10.

**`users.email` is `NOT NULL UNIQUE`.** Family members share inboxes, which is why `clients.email` is nullable and non-unique. Portal accounts therefore never reuse the client's real address.

---

## File Structure

**Created:**

| File | Responsibility |
| --- | --- |
| `src/features/clients/transliterate.ts` | Arabic → Latin, username suggestion |
| `src/features/clients/transliterate.test.ts` | Unit tests |
| `src/features/clients/portal-credentials.ts` | Issue / re-issue / revoke — no Next imports |
| `src/features/clients/portal-credentials.test.ts` | Integration tests |
| `src/features/auth/password-policy.ts` | Client minimum + common-password blocklist |
| `src/features/auth/password-policy.test.ts` | Unit tests |
| `src/app/[locale]/portal/set-password/page.tsx` | Forced first-sign-in change |
| `src/features/auth/components/set-password-form.tsx` | That form |
| `src/features/clients/components/portal-credentials-card.tsx` | Replaces `portal-access-card.tsx` |

**Modified:** `src/db/schema/auth.ts`, `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/lib/session.ts`, `src/features/auth/{actions,schema,form-state,rate-limit}.ts`, `src/features/auth/components/client-login-form.tsx`, `src/features/clients/{mutations,actions}.ts`, `src/app/[locale]/portal/layout.tsx`, `src/app/[locale]/app/clients/[clientId]/page.tsx`, `src/i18n/messages/{ar,en}.json`, `scripts/seed.ts`.

**Deleted:** `src/features/clients/components/portal-access-card.tsx`, the `magicLink` template case, `MAGIC_LINK_TTL_*`.

---

## Task 1: Schema

**Files:** Modify `src/db/schema/auth.ts`; generate a migration.

- [ ] **Step 1: Add the three columns to the `users` table**

Inside the existing `user = pgTable('users', {...})` definition, after `locale`:

```ts
  /**
   * Portal sign-in identifier, issued by a dietitian. Null for staff, who sign
   * in with an email address. Required by Better Auth's `username` plugin.
   */
  username: text('username').unique(),

  /** The plugin stores the pre-normalisation form here for display. */
  displayUsername: text('display_username'),

  /**
   * Forces a client to replace the temporary password they were handed before
   * they can reach the portal. Cleared once they set their own — after which
   * nobody at the clinic knows it.
   */
  mustChangePassword: boolean('must_change_password').notNull().default(false),
```

- [ ] **Step 2: Generate the migration**

Run: `bun run db:generate`
Expected: a new file in `drizzle/` adding three columns and a unique index on `username`.

- [ ] **Step 3: Read the SQL before applying**

Open the generated file. It must only ADD columns and one index. If it drops or retypes anything, STOP and report.

- [ ] **Step 4: Apply to both databases**

```bash
bun run db:migrate
```

```bash
bun run db:migrate:test
```

- [ ] **Step 5: Verify**

Run: `bun test tests/smoke.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/auth.ts drizzle
git commit -m "Add username and must_change_password to users"
```

---

## Task 2: Transliteration and username suggestion

**Files:** Create `src/features/clients/transliterate.ts` and its test.

- [ ] **Step 1: Write the failing tests**

Create `src/features/clients/transliterate.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { suggestUsername, transliterateArabic } from './transliterate';

describe('transliterateArabic', () => {
  test('maps a common Arabic name to Latin letters', () => {
    expect(transliterateArabic('أحمد')).toBe('ahmd');
  });

  test('folds alef variants and taa marbuta before mapping', () => {
    expect(transliterateArabic('سارة')).toBe('sarh');
  });

  test('strips tashkeel rather than transliterating it', () => {
    expect(transliterateArabic('مُحَمَّد')).toBe('mhmd');
  });

  test('maps digraphs to their two-letter forms', () => {
    expect(transliterateArabic('خالد')).toBe('khald');
    expect(transliterateArabic('شادي')).toBe('shady');
  });

  test('leaves Latin input untouched', () => {
    expect(transliterateArabic('Layla')).toBe('Layla');
  });
});

describe('suggestUsername', () => {
  test('produces lowercase latin with a four-digit suffix', () => {
    const suggestion = suggestUsername('Layla Haddad');
    expect(suggestion).toMatch(/^layla-haddad-\d{4}$/);
  });

  test('transliterates an Arabic name', () => {
    expect(suggestUsername('أحمد خليل')).toMatch(/^ahmd-khlyl-\d{4}$/);
  });

  test('contains only lowercase letters, digits and hyphens', () => {
    expect(suggestUsername("O'Brien  Anne-Marie")).toMatch(/^[a-z0-9-]+$/);
  });

  test('collapses runs of separators rather than leaving doubles', () => {
    expect(suggestUsername('Anne   --  Marie')).not.toContain('--');
  });

  test('falls back to "client" when nothing usable survives', () => {
    expect(suggestUsername('!!! ???')).toMatch(/^client-\d{4}$/);
  });

  test('never starts or ends with a hyphen', () => {
    const suggestion = suggestUsername('-- Sara --');
    expect(suggestion.startsWith('-')).toBe(false);
    expect(suggestion.endsWith('-')).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test src/features/clients/transliterate.test.ts`
Expected: FAIL — `Cannot find module './transliterate'`.

- [ ] **Step 3: Implement**

Create `src/features/clients/transliterate.ts`:

```ts
import { normalizeForSearch } from './search';

/**
 * Arabic → Latin, for suggesting portal usernames.
 *
 * APPROXIMATE BY NATURE, and that is why the dietitian can edit the result.
 * Arabic script does not write short vowels, so `أحمد` maps to `ahmd` and not
 * `ahmad`. No mapping recovers them; a human reading the suggestion fixes it in
 * seconds. Do not add heuristics that guess vowels — they are wrong more often
 * than they are right, and a wrong guess is worse than an obviously terse one.
 */
const LETTERS: Record<string, string> = {
  ا: 'a', ب: 'b', ت: 't', ث: 'th', ج: 'j', ح: 'h', خ: 'kh',
  د: 'd', ذ: 'dh', ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 's',
  ض: 'd', ط: 't', ظ: 'z', ع: 'a', غ: 'gh', ف: 'f', ق: 'q',
  ك: 'k', ل: 'l', م: 'm', ن: 'n', ه: 'h', و: 'w', ي: 'y',
};

export function transliterateArabic(value: string): string {
  // Reuse the folding already used for search, so the two never disagree about
  // what counts as the "same" letter: alef variants, taa marbuta, tashkeel.
  const folded = normalizeForSearch(value);

  let out = '';
  for (const char of folded) {
    if (char === 'ء') continue; // hamza carries no Latin letter of its own
    out += LETTERS[char] ?? char;
  }
  return out;
}

const USERNAME_FALLBACK = 'client';

/** Four digits, so a suggestion is unique often enough to rarely need a redraw. */
function randomSuffix(): string {
  return String(Math.floor(Math.random() * 10_000)).padStart(4, '0');
}

/**
 * Suggests a portal username from a client's name. The dietitian edits it before
 * the account is created, so this optimises for "recognisable", not "correct".
 */
export function suggestUsername(fullName: string): string {
  const base = transliterateArabic(fullName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `${base || USERNAME_FALLBACK}-${randomSuffix()}`;
}
```

Note: `transliterateArabic('Layla')` must return `Layla` unchanged, but `normalizeForSearch` lowercases. Adjust `normalizeForSearch` usage so casing is preserved here — apply only the Arabic folding, not the lowercasing, or lowercase later in `suggestUsername`. If the test for Latin input fails, extract the Arabic-folding half of `normalizeForSearch` into a shared helper rather than duplicating the regexes.

- [ ] **Step 4: Run them to verify they pass**

Run: `bun test src/features/clients/transliterate.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/clients/transliterate.ts src/features/clients/transliterate.test.ts
git commit -m "Suggest portal usernames from client names"
```

---

## Task 3: Password policy

**Files:** Create `src/features/auth/password-policy.ts` and its test.

- [ ] **Step 1: Write the failing tests**

Create `src/features/auth/password-policy.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import {
  CLIENT_MIN_PASSWORD_LENGTH,
  generateTemporaryPassword,
  isCommonPassword,
} from './password-policy';

describe('isCommonPassword', () => {
  test('rejects the obvious ones', () => {
    expect(isCommonPassword('123456')).toBe(true);
    expect(isCommonPassword('password')).toBe(true);
    expect(isCommonPassword('qwerty')).toBe(true);
  });

  test('ignores case and surrounding whitespace', () => {
    expect(isCommonPassword('  PassWord  ')).toBe(true);
  });

  test('accepts something ordinary', () => {
    expect(isCommonPassword('tuffah-7')).toBe(false);
  });
});

describe('generateTemporaryPassword', () => {
  test('avoids glyphs that are misread when written down or read aloud', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateTemporaryPassword()).not.toMatch(/[0O1lI]/);
    }
  });

  test('is long enough to resist guessing while it is in circulation', () => {
    expect(generateTemporaryPassword().length).toBeGreaterThanOrEqual(10);
  });

  test('does not repeat', () => {
    const seen = new Set(Array.from({ length: 100 }, () => generateTemporaryPassword()));
    expect(seen.size).toBe(100);
  });

  test('is never itself a common password', () => {
    expect(isCommonPassword(generateTemporaryPassword())).toBe(false);
  });
});

describe('CLIENT_MIN_PASSWORD_LENGTH', () => {
  test('is six, matching the Better Auth global floor', () => {
    expect(CLIENT_MIN_PASSWORD_LENGTH).toBe(6);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test src/features/auth/password-policy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/features/auth/password-policy.ts`:

```ts
/**
 * Password rules that differ between staff and clients.
 *
 * Better Auth exposes a single global `minPasswordLength`, so it cannot express
 * two minimums. The global floor is the CLIENT minimum (6); the staff minimum
 * (10) is enforced in the staff Zod schema. The asymmetry matches the exposure:
 * a client sees one record, a staff account sees every client's medical notes.
 */

export const CLIENT_MIN_PASSWORD_LENGTH = 6;

/**
 * At six characters this matters more than length does. Throttling defeats a
 * brute-force search, but it does nothing about `123456`, which is guessed on
 * the first attempt. Short list on purpose — it targets the handful of values a
 * person actually types when asked to invent a six-character password.
 */
const COMMON_PASSWORDS = new Set([
  '123456', '1234567', '12345678', '123456789', '111111', '000000',
  'password', 'passwor', 'qwerty', 'abc123', 'abcdef', 'letmein',
  'iloveyou', 'admin', 'welcome', '123123', '654321', 'monkey',
]);

export function isCommonPassword(value: string): boolean {
  return COMMON_PASSWORDS.has(value.trim().toLowerCase());
}

/**
 * Alphabet with the confusable glyphs removed: no 0/O, no 1/l/I.
 *
 * This password is read aloud in a clinic or written on paper, so a character
 * that is ambiguous in handwriting is a support call, not a security issue.
 */
const SAFE_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const TEMPORARY_PASSWORD_LENGTH = 10;

/**
 * `crypto.getRandomValues`, not `Math.random`: this value is a credential, and
 * `Math.random` is predictable enough to enumerate.
 *
 * The modulo below is very slightly biased toward the first characters of the
 * alphabet. With a 57-character alphabet and 10 characters the bias is
 * irrelevant to guessing difficulty, and the alternative is rejection sampling
 * that buys nothing here.
 */
export function generateTemporaryPassword(): string {
  const bytes = new Uint8Array(TEMPORARY_PASSWORD_LENGTH);
  crypto.getRandomValues(bytes);

  let out = '';
  for (const byte of bytes) {
    out += SAFE_ALPHABET[byte % SAFE_ALPHABET.length];
  }
  return out;
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `bun test src/features/auth/password-policy.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/password-policy.ts src/features/auth/password-policy.test.ts
git commit -m "Add client password policy and temporary password generation"
```

---

## Task 4: Better Auth configuration

**Files:** Modify `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/lib/auth-constants.ts`.

- [ ] **Step 1: Add the username plugin, remove magic links**

In `src/lib/auth.ts`:

Remove `import { magicLink } from 'better-auth/plugins';` and add:

```ts
import { username } from 'better-auth/plugins';
```

Delete the entire `magicLink({...})` entry from `plugins`, and add in its place:

```ts
    /**
     * Portal sign-in for clients. They are issued a username and a temporary
     * password by their dietitian and never hold an email address here — see
     * `src/features/clients/portal-credentials.ts`.
     */
    username({
      minUsernameLength: 3,
      maxUsernameLength: 60,
    }),
```

Change `minPasswordLength`:

```ts
    /**
     * The CLIENT minimum. Better Auth has one global value, so this is the floor
     * for everyone; the staff minimum of 10 is enforced in the staff Zod schema
     * (`src/features/auth/schema.ts`). Do not raise this back to 10 — it would
     * lock every client out of setting their own password.
     */
    minPasswordLength: CLIENT_MIN_PASSWORD_LENGTH,
```

with `import { CLIENT_MIN_PASSWORD_LENGTH } from '@/features/auth/password-policy';`.

Add to `user.additionalFields`:

```ts
      /**
       * Set when a dietitian issues or re-issues credentials, cleared when the
       * client chooses their own. Never accepted from a payload.
       */
      mustChangePassword: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false,
      },
```

Add `passkey` is already in the adapter schema; extend it to keep the plugin's table mapping intact — no change needed for `username`, which lives on the existing `users` table.

- [ ] **Step 2: Update the client**

In `src/lib/auth-client.ts`, replace `magicLinkClient()` with `usernameClient()` from `better-auth/client/plugins`.

- [ ] **Step 3: Remove the dead constants**

Delete `MAGIC_LINK_TTL_MINUTES` and `MAGIC_LINK_TTL_SECONDS` from `src/lib/auth-constants.ts`.

- [ ] **Step 4: Remove the magic-link mail template**

In `src/lib/mail/templates.ts`, remove `'magicLink'` from `MailKind` and delete its entry from `COPY`. Remove the corresponding test if one references it.

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: errors listing every remaining magic-link reference. Task 5 removes them; if the only errors are in `src/features/auth/actions.ts` and `client-login-form.tsx`, that is expected — proceed and fix them there.

- [ ] **Step 6: Commit**

```bash
git add src/lib
git commit -m "Swap the magic-link plugin for username sign-in"
```

---

## Task 5: Issuing credentials

**Files:** Create `src/features/clients/portal-credentials.ts` and its test. Modify `src/features/clients/mutations.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/clients/portal-credentials.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { account, clients, user } from '@/db/schema';
import { auth } from '@/lib/auth';

import { createTestClinic, resetDatabase } from '../../../tests/helpers';
import { createClient } from './mutations';
import { issuePortalCredentials, revokePortalAccess } from './portal-credentials';

let clinicId: string;

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
});

async function makeClient(fullName = 'أحمد خليل') {
  return createClient(clinicId, { fullName, preferredLocale: 'ar' });
}

describe('issuePortalCredentials', () => {
  test('creates exactly one user and one account, and links the client', async () => {
    const client = await makeClient();

    const result = await issuePortalCredentials(clinicId, client.id, 'ahmd-khlyl-1234');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [row] = await db.select().from(clients).where(eq(clients.id, client.id));
    expect(row?.userId).not.toBeNull();

    const users = await db.select().from(user).where(eq(user.username, 'ahmd-khlyl-1234'));
    expect(users).toHaveLength(1);
    expect(users[0]?.role).toBe('client');

    const accounts = await db.select().from(account).where(eq(account.userId, users[0]!.id));
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.providerId).toBe('credential');
  });

  test('marks the account verified, or the global gate would lock it out forever', async () => {
    const client = await makeClient();
    await issuePortalCredentials(clinicId, client.id, 'verified-0001');

    const [row] = await db.select().from(user).where(eq(user.username, 'verified-0001'));
    expect(row?.emailVerified).toBe(true);
  });

  test('requires the client to change the password it hands out', async () => {
    const client = await makeClient();
    await issuePortalCredentials(clinicId, client.id, 'mustchange-0001');

    const [row] = await db.select().from(user).where(eq(user.username, 'mustchange-0001'));
    expect(row?.mustChangePassword).toBe(true);
  });

  test('the temporary password it returns actually authenticates', async () => {
    const client = await makeClient();
    const result = await issuePortalCredentials(clinicId, client.id, 'signin-0001');
    if (!result.ok) throw new Error('issuing failed');

    const signedIn = await auth.api.signInUsername({
      body: { username: 'signin-0001', password: result.temporaryPassword },
    });

    expect(signedIn).toBeTruthy();
  });

  test('gives the account a non-routable synthetic address', async () => {
    const client = await makeClient();
    await issuePortalCredentials(clinicId, client.id, 'synthetic-0001');

    const [row] = await db.select().from(user).where(eq(user.username, 'synthetic-0001'));
    expect(row?.email).toBe('synthetic-0001@portal.invalid');
  });

  test('refuses a username that is already taken', async () => {
    const first = await makeClient('First Client');
    const second = await makeClient('Second Client');

    await issuePortalCredentials(clinicId, first.id, 'taken-0001');
    const result = await issuePortalCredentials(clinicId, second.id, 'taken-0001');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('username_taken');
  });

  test('refuses a client that already has portal access', async () => {
    const client = await makeClient();
    await issuePortalCredentials(clinicId, client.id, 'already-0001');

    const result = await issuePortalCredentials(clinicId, client.id, 'already-0002');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('already_issued');
  });

  test('cannot issue credentials for another clinic’s client', async () => {
    const otherClinic = await createTestClinic('Other Clinic');
    const client = await makeClient();

    const result = await issuePortalCredentials(otherClinic, client.id, 'crosstenant-0001');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('not_found');
  });
});

describe('revokePortalAccess', () => {
  test('removes the account but leaves the clinical record intact', async () => {
    const client = await makeClient();
    await issuePortalCredentials(clinicId, client.id, 'revoke-0001');

    await revokePortalAccess(clinicId, client.id);

    expect(await db.select().from(user).where(eq(user.username, 'revoke-0001'))).toHaveLength(0);

    const [row] = await db.select().from(clients).where(eq(clients.id, client.id));
    expect(row).toBeTruthy();
    expect(row?.userId).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun test src/features/clients/portal-credentials.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/features/clients/portal-credentials.ts`:

```ts
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { account, clients, user } from '@/db/schema';
import { generateTemporaryPassword } from '@/features/auth/password-policy';
import { auth } from '@/lib/auth';

/**
 * Portal credentials, issued by a dietitian.
 *
 * Clients do not sign up and do not receive email. Their dietitian creates the
 * account, hands over a username and a temporary password, and the client
 * replaces the password the first time they sign in — after which nobody at the
 * clinic knows it.
 *
 * Imports nothing from Next.js so `bun test` drives it directly. `actions.ts` is
 * the thin layer that adds revalidation.
 */

/**
 * `.invalid` is reserved by RFC 2606 and can never resolve.
 *
 * `users.email` is NOT NULL UNIQUE, but a client may have no address at all, and
 * families share one — which is exactly why `clients.email` is nullable and NOT
 * unique. Deriving a synthetic address from the username satisfies the
 * constraint, guarantees uniqueness, and makes it impossible to accidentally
 * send mail to a patient.
 */
export function syntheticEmail(username: string): string {
  return `${username}@portal.invalid`;
}

export type IssueFailureCode = 'not_found' | 'already_issued' | 'username_taken';

export type IssueResult =
  | { ok: true; username: string; temporaryPassword: string }
  | { ok: false; code: IssueFailureCode };

function scopedToClinic(clinicId: string, id: string) {
  return and(eq(clients.id, id), eq(clients.clinicId, clinicId));
}

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;
}

export async function issuePortalCredentials(
  clinicId: string,
  clientId: string,
  username: string,
): Promise<IssueResult> {
  const [client] = await db.select().from(clients).where(scopedToClinic(clinicId, clientId)).limit(1);

  if (!client) return { ok: false, code: 'not_found' };
  if (client.userId) return { ok: false, code: 'already_issued' };

  const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.username, username)).limit(1);
  if (taken) return { ok: false, code: 'username_taken' };

  const temporaryPassword = generateTemporaryPassword();

  // Better Auth's own hasher, so the password verifies at sign-in. Same approach
  // as `scripts/seed.ts`, and for the same reason: there is no request scope
  // here, so `auth.api.signUp*` cannot be used.
  const hashed = await (await auth.$context).password.hash(temporaryPassword);

  const userId = crypto.randomUUID();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: userId,
        name: client.fullName,
        email: syntheticEmail(username),
        /**
         * TRUE ON PURPOSE, and required twice over. `requireEmailVerification`
         * is global, so an unverified account cannot sign in at all — and a
         * `.invalid` address can never be verified. Verification means "this
         * address was proven to belong to this person"; this one belongs to
         * nobody and can receive nothing, so there is nothing to prove.
         */
        emailVerified: true,
        username,
        displayUsername: username,
        role: 'client',
        locale: client.preferredLocale,
        mustChangePassword: true,
      });

      await tx.insert(account).values({
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: 'credential',
        userId,
        password: hashed,
      });

      await tx
        .update(clients)
        .set({ userId, updatedAt: new Date() })
        .where(scopedToClinic(clinicId, clientId));
    });
  } catch (error) {
    // The check above is a fast path, not a guarantee: two staff members can
    // submit the same username at once. The unique index is the real arbiter,
    // and the transaction means nothing was written.
    if (isUniqueViolation(error)) return { ok: false, code: 'username_taken' };
    throw error;
  }

  return { ok: true, username, temporaryPassword };
}

/**
 * Issues a fresh temporary password for a client who has forgotten theirs.
 *
 * The username does not change. Existing sessions are revoked: a re-issue is
 * what happens when the old credentials may be in someone else's hands.
 */
export async function reissuePortalPassword(
  clinicId: string,
  clientId: string,
): Promise<IssueResult> {
  const [client] = await db
    .select({ userId: clients.userId })
    .from(clients)
    .where(scopedToClinic(clinicId, clientId))
    .limit(1);

  if (!client?.userId) return { ok: false, code: 'not_found' };

  const [existing] = await db
    .select({ username: user.username })
    .from(user)
    .where(eq(user.id, client.userId))
    .limit(1);

  if (!existing?.username) return { ok: false, code: 'not_found' };

  const temporaryPassword = generateTemporaryPassword();
  const hashed = await (await auth.$context).password.hash(temporaryPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(account)
      .set({ password: hashed, updatedAt: new Date() })
      .where(and(eq(account.userId, client.userId!), eq(account.providerId, 'credential')));

    await tx.update(user).set({ mustChangePassword: true }).where(eq(user.id, client.userId!));

    // Ends any open portal tab immediately.
    await tx.delete(session).where(eq(session.userId, client.userId!));
  });

  return { ok: true, username: existing.username, temporaryPassword };
}

/**
 * Removes portal access. Deleting the `users` row cascades to sessions and
 * accounts, and `clients.user_id` returns to null via `on delete set null`, so
 * the clinical record survives untouched.
 */
export async function revokePortalAccess(clinicId: string, clientId: string): Promise<boolean> {
  const [client] = await db
    .select({ userId: clients.userId })
    .from(clients)
    .where(scopedToClinic(clinicId, clientId))
    .limit(1);

  if (!client?.userId) return false;

  await db.delete(user).where(eq(user.id, client.userId));
  return true;
}
```

Import `session` from `@/db/schema` alongside the others.

- [ ] **Step 4: Delete the old invite path**

Remove `invitePortalAccess`, `revokePortalAccess`, `InviteResult`, `InviteFailureCode`, `isUniqueViolation` and the `UNIQUE_VIOLATION` constant from `src/features/clients/mutations.ts` — they are superseded. Remove the now-unused `user` import if nothing else in that file uses it.

- [ ] **Step 5: Run the tests**

Run: `bun test src/features/clients/portal-credentials.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 6: Commit**

```bash
git add src/features/clients/portal-credentials.ts src/features/clients/portal-credentials.test.ts src/features/clients/mutations.ts
git commit -m "Issue portal credentials instead of magic-link invites"
```

---

## Task 6: Rate limiting the portal

**Files:** Modify `src/features/auth/rate-limit.ts` and its test.

- [ ] **Step 1: Add the kind**

In `AttemptKind`, replace `'magic_link'` with `'portal_sign_in'`. In `AUTH_LIMITS`, replace the `magic_link` entry with:

```ts
  /**
   * Portal sign-in. Tighter per-identifier than staff sign-in because a client
   * password may be only six characters — throttling is what makes that
   * defensible. The `email` rule is keyed by USERNAME here; the column stores
   * whichever identifier was submitted.
   */
  portal_sign_in: {
    email: { max: 5, windowSeconds: 15 * MINUTE },
    ip: { max: 20, windowSeconds: 15 * MINUTE },
  },
```

- [ ] **Step 2: Add a test**

Append to `src/features/auth/rate-limit.test.ts`:

```ts
describe('checkRateLimit for portal_sign_in', () => {
  test('blocks a username after five failures, which is what makes six characters safe', async () => {
    const username = 'ahmd-khlyl-1234';
    const limit = AUTH_LIMITS.portal_sign_in.email.max;

    for (let i = 0; i < limit; i += 1) {
      await recordAttempt('portal_sign_in', { email: username, ipAddress: '5.5.5.5' });
    }

    const result = await checkRateLimit('portal_sign_in', { email: username, ipAddress: '5.5.5.5' });
    expect(result.allowed).toBe(false);
  });

  test('does not share a budget with staff sign-in', async () => {
    const limit = AUTH_LIMITS.portal_sign_in.email.max;

    for (let i = 0; i < limit; i += 1) {
      await recordAttempt('portal_sign_in', { email: 'someone-0001', ipAddress: '6.6.6.6' });
    }

    const staff = await checkRateLimit('sign_in', { email: 'someone-0001', ipAddress: null });
    expect(staff.allowed).toBe(true);
  });
});
```

- [ ] **Step 3: Run**

Run: `bun test src/features/auth/rate-limit.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/auth/rate-limit.ts src/features/auth/rate-limit.test.ts
git commit -m "Rate limit portal sign-in on its own budget"
```

---

## Task 7: Actions

**Files:** Modify `src/features/auth/{actions,schema,form-state}.ts` and `src/features/clients/actions.ts`.

- [ ] **Step 1: Replace the magic-link action with a portal sign-in**

In `src/features/auth/schema.ts`, remove `magicLinkSchema` and add:

```ts
export const portalSignInSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(60),
  password: z.string().min(1),
  locale: localeSchema,
});

export const setPasswordSchema = z
  .object({
    password: z.string().min(CLIENT_MIN_PASSWORD_LENGTH),
    confirmPassword: z.string(),
    locale: localeSchema,
  })
  .refine((values) => values.password === values.confirmPassword, { path: ['confirmPassword'] });
```

with `import { CLIENT_MIN_PASSWORD_LENGTH } from './password-policy';`.

The staff schemas keep `MIN_PASSWORD_LENGTH` (10) — that asymmetry is the whole point, so do not unify them.

- [ ] **Step 2: Replace `requestMagicLink`**

Delete `requestMagicLink` from `src/features/auth/actions.ts` and add:

```ts
export async function signInToPortal(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = portalSignInSchema.safeParse({
    username: formData.get('username'),
    password: formData.get('password'),
    locale: formData.get('locale'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'genericError' };

  const { username, password, locale } = parsed.data;

  const limited = await guard('portal_sign_in', username);
  if (limited) return limited;

  try {
    await auth.api.signInUsername({ body: { username, password }, headers: await headers() });
  } catch {
    await penalise('portal_sign_in', username);
    // Vague on purpose: never reveal whether a portal number exists.
    return { status: 'error', messageKey: 'wrongCredentials' };
  }

  await clearAttempts('portal_sign_in', username);

  redirect(`/${locale}/portal`);
}

/**
 * The client replaces the temporary password they were handed. Clearing
 * `mustChangePassword` is what unlocks the rest of the portal.
 */
export async function setPortalPassword(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = setPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    locale: formData.get('locale'),
  });

  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;
    if (fieldErrors.confirmPassword) return { status: 'error', messageKey: 'passwordMismatch' };
    return { status: 'error', messageKey: 'passwordTooShort' };
  }

  const { password, locale } = parsed.data;

  if (isCommonPassword(password)) {
    return { status: 'error', messageKey: 'passwordTooCommon' };
  }

  const session = await requireClientSession(locale);

  try {
    await auth.api.setPassword({ body: { newPassword: password }, headers: await headers() });
    await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, session.user.id));
  } catch (error) {
    console.error('[auth] portal password change failed', error);
    return { status: 'error', messageKey: 'genericError' };
  }

  redirect(`/${locale}/portal`);
}
```

- [ ] **Step 3: Replace the client-side portal actions**

In `src/features/clients/actions.ts`, replace `invitePortalAccessAction` and `revokePortalAccessAction` with actions calling `issuePortalCredentials`, `reissuePortalPassword` and `revokePortalAccess`. The issue and re-issue actions must return the credentials so the UI can show them once:

```ts
export type PortalCredentialsState =
  | { status: 'idle' }
  | { status: 'error'; messageKey: 'errors.usernameTaken' | 'errors.unexpected' }
  | { status: 'issued'; username: string; temporaryPassword: string };
```

Put that type in `src/features/clients/form-state.ts`, not in the action module.

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: PASS once the UI in Task 8 is updated; errors confined to `client-login-form.tsx` and `portal-access-card.tsx` are expected at this point.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth src/features/clients
git commit -m "Add portal sign-in and credential issuing actions"
```

---

## Task 8: UI

**Files:** Modify `src/features/auth/components/client-login-form.tsx`; create `set-password-form.tsx`, `src/app/[locale]/portal/set-password/page.tsx`, `src/features/clients/components/portal-credentials-card.tsx`; modify `src/app/[locale]/portal/layout.tsx`, `src/app/[locale]/app/clients/[clientId]/page.tsx`; delete `portal-access-card.tsx`.

- [ ] **Step 1: Rewrite the client login form**

Replace the email field with a username field (`autoComplete="username"`, `dir="ltr"`) and add a `PasswordInput` with `autoComplete="current-password"`. Wire it to `signInToPortal`. Remove every mention of magic links and the TTL.

- [ ] **Step 2: Guard the portal**

In `src/app/[locale]/portal/layout.tsx`, after `requireClientSession`:

```ts
  // A client holding a dietitian-issued temporary password reaches exactly one
  // page until they replace it. The flag rides on the session, so this costs no
  // extra query.
  if (session.user.mustChangePassword) {
    redirect(`/${locale}/portal/set-password`);
  }
```

The `set-password` page must NOT be inside the layout that redirects to it, or it will loop. Put the guard in the layout and give `set-password/page.tsx` its own minimal shell, or check the current pathname before redirecting. Choose the first: create `src/app/[locale]/portal/set-password/layout.tsx` that calls `requireClientSession` without the flag check.

- [ ] **Step 3: Build the credentials card**

`portal-credentials-card.tsx` shows, for a client with no access, a form with the suggested username (editable, `defaultValue` from `suggestUsername(client.fullName)` computed server-side and passed in) and an *Issue credentials* button. On success it shows the username and temporary password in a highlighted block with the warning that it is shown only once. For a client who already has access it shows the username, a *Re-issue password* button that confirms first, and *Revoke access*.

- [ ] **Step 4: Swap the card into the client detail page**

Replace `<PortalAccessCard ... />` with `<PortalCredentialsCard ... />`, passing `suggestedUsername={suggestUsername(client.fullName)}`.

- [ ] **Step 5: Delete the old card**

```bash
git rm src/features/clients/components/portal-access-card.tsx
```

- [ ] **Step 6: Lint and typecheck**

Run: `bun run typecheck && bun run lint`
Expected: PASS both. Watch the RTL rule on new markup.

- [ ] **Step 7: Commit**

```bash
git add -u && git add src/features src/app
git commit -m "Replace the portal invite UI with issued credentials"
```

---

## Task 9: Messages

**Files:** `src/i18n/messages/ar.json` then `en.json`.

- [ ] **Step 1: Add to `ar.json` first, then mirror to `en.json`**

Inside `login`:

| Key | Arabic | English |
| --- | --- | --- |
| `portalHeading` | الدخول إلى بوابة المراجعين | Client portal sign-in |
| `portalDescription` | استخدم اسم المستخدم وكلمة المرور اللذين حصلت عليهما من أخصائي التغذية. | Use the username and password your dietitian gave you. |
| `portalUsername` | اسم المستخدم | Username |
| `portalSubmit` | دخول | Sign in |
| `wrongCredentials` | اسم المستخدم أو كلمة المرور غير صحيحة. | Wrong username or password. |
| `passwordTooCommon` | كلمة المرور هذه شائعة جداً. اختر واحدة أخرى. | That password is too common. Choose another. |
| `setPasswordHeading` | اختر كلمة مرور جديدة | Choose a new password |
| `setPasswordDescription` | كلمة المرور التي حصلت عليها مؤقتة. اختر واحدة خاصة بك للمتابعة. | The password you were given is temporary. Choose your own to continue. |
| `setPasswordSubmit` | حفظ ومتابعة | Save and continue |

Inside `clients`:

| Key | Arabic | English |
| --- | --- | --- |
| `portal.username` | اسم المستخدم | Username |
| `portal.issue` | إنشاء بيانات الدخول | Create sign-in details |
| `portal.reissue` | إصدار كلمة مرور جديدة | Issue a new password |
| `portal.confirmReissue` | سيتم إنهاء جلسات المراجع الحالية. متابعة؟ | This ends the client's current sessions. Continue? |
| `portal.showOnce` | اكتب هذه البيانات الآن — لن تظهر مرة أخرى. | Write these down now — they will not be shown again. |
| `portal.temporaryPassword` | كلمة المرور المؤقتة | Temporary password |
| `errors.usernameTaken` | اسم المستخدم هذا مستخدم بالفعل. | That username is already taken. |

Remove `portal.devNotice`, `portal.invited` and any other magic-link wording.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS. A key in only one file is a type error.

- [ ] **Step 3: Commit**

```bash
git add src/i18n/messages
git commit -m "Add messages for issued portal credentials"
```

---

## Task 10: Seed and docs

**Files:** `scripts/seed.ts`, `README.md`, both spec/plan docs unchanged.

- [ ] **Step 1: Update the seed**

Replace the `invitePortalAccess(clinicId, second.id)` call with `issuePortalCredentials(clinicId, second.id, suggestUsername(secondClientName))`, and `console.info` the resulting username and temporary password so a developer can actually sign in to the portal.

- [ ] **Step 2: Update the README**

Rewrite the client half of the auth section: clients no longer receive magic links; a dietitian issues a username and temporary password, and the client must replace it at first sign-in. Note the 6/10 password split and why. Remove magic links from the sign-in table.

- [ ] **Step 3: Commit**

```bash
git add scripts/seed.ts README.md
git commit -m "Seed portal credentials and update the docs"
```

---

## Task 11: Verification

- [ ] **Step 1: Full suite**

Run: `bun test`
Expected: PASS, no failures.

- [ ] **Step 2: Lint and typecheck**

Run: `bun run lint && bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Production build**

Run: `bun run build`
Expected: PASS.

- [ ] **Step 4: Reseed and walk the flow**

```bash
bun run db:reset && bun run db:seed
```

- Sign in as staff, open a client, issue credentials, confirm the suggested username is editable and the temporary password appears once
- Sign out, sign in at `/ar/client-login` with those credentials
- Confirm you are forced to `/ar/portal/set-password` and cannot reach `/ar/portal`
- Set a 6-character password; confirm `123456` is refused
- Confirm the portal opens afterwards
- Re-issue from the staff side; confirm the old password stops working
- Six wrong passwords in a row; confirm throttling
- Repeat in English and check RTL/LTR

- [ ] **Step 5: Commit anything outstanding**

```bash
git status
```

---

## Notes for the implementer

**`emailVerified: true` on portal accounts is not a shortcut.** Remove it and every client is locked out by the global verification gate, with no way to verify an address that cannot receive mail.

**Do not unify the password minimums.** 6 for clients, 10 for staff, enforced in different places for a reason recorded in `password-policy.ts`.

**Transliteration is approximate and the edit field is the fix.** Do not add vowel-guessing heuristics.
