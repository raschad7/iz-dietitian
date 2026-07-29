# Authentication Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give staff three ways to sign in — passkey, Google, email + password — behind a verified email address, real transactional email, and rate-limited attempts.

**Architecture:** Better Auth plugins own the protocol (passkey, Google OAuth, verification and reset tokens). This codebase owns what the library cannot reach: rate limiting at the server-action layer, safe redirect resolution, and unverified-account cleanup. Auth logic moves from `src/components/auth/` to `src/features/auth/`, matching the architecture rule the rest of the repo follows.

**Tech Stack:** Next.js 16 (App Router), Better Auth 1.6.25, `@better-auth/passkey`, Drizzle ORM + PostgreSQL, Resend, Zod 4, next-intl, Bun (runtime, package manager, test runner).

**Spec:** `docs/superpowers/specs/2026-07-29-authentication-hardening-design.md`

---

## Conventions this codebase enforces

Read these before writing a line. Violating any of them fails lint, typecheck, or review.

1. **Logical properties only.** `pl-*`, `ml-*`, `text-left`, `left-*`, `border-l-*` are lint **errors**. Use `ps-*`, `ms-*`, `text-start`, `start-*`, `border-s-*`. The rule understands variants (`md:pl-8`) and `cn()` arguments.
2. **`ar.json` is the source of truth** and types the message catalogue. Add a key to `ar.json` first, then `en.json`. A key present only in English is a type error.
3. **A `"use server"` module may only export async functions.** State shapes and constants go in a sibling module. Exporting an object from an action module fails at *runtime*, confusingly — Next replaces it with a server reference.
4. **Types crossing to client components import nothing.** `verbatimModuleSyntax` means `import { type X } from './queries'` still emits a real import, dragging the pg driver into the browser bundle.
5. **snake_case columns, `gen_random_uuid()` primary keys, `created_at`/`updated_at` as `timestamptz`** on every new table. Write the column name explicitly even though `casing: 'snake_case'` is configured.
6. **Never pass a bare `'ar'` to an `Intl` constructor.** Use the helpers in `src/lib/format.ts`.
7. **Business logic never lives in `src/app/**`.** Route files resolve params, call a guard, render.
8. **Modules that need testing import nothing from Next.js.** `bun test` cannot run `revalidatePath` outside a request scope.

## Two findings that shape this plan

**Better Auth's rate limiter cannot protect this app.** It runs in the router's `onRequest` hook (`node_modules/better-auth/dist/api/index.mjs`, `router()`). This app calls `auth.api.*()` directly from server actions, bypassing the router. Setting `rateLimit` in the config would look like protection and provide none. That is why Task 4 exists.

**Better Auth already blocks OAuth pre-hijacking.** `account.accountLinking.requireLocalEmailVerified` defaults to `true` (`dist/oauth2/link-account.mjs:22`). Never set it to `false`. Do not write a custom mitigation.

---

## File Structure

**Created:**

| File | Responsibility |
| --- | --- |
| `src/lib/mail/index.ts` | `Mailer` interface, transport selection, `sendMail` |
| `src/lib/mail/console.ts` | Development transport — logs to server console |
| `src/lib/mail/resend.ts` | Production transport |
| `src/lib/mail/templates.ts` | Subject + html + text per mail type, ar and en |
| `src/lib/mail/templates.test.ts` | Template selection and direction |
| `src/features/auth/actions.ts` | `"use server"` — every auth mutation |
| `src/features/auth/form-state.ts` | State shapes and initial values |
| `src/features/auth/schema.ts` | Zod input schemas |
| `src/features/auth/rate-limit.ts` | Attempt recording, throttling — no Next imports |
| `src/features/auth/rate-limit.test.ts` | Policy and integration tests |
| `src/features/auth/redirect.ts` | Safe post-login destination — pure |
| `src/features/auth/redirect.test.ts` | Open-redirect rejection tests |
| `src/features/auth/cleanup.ts` | Expiry of unverified accounts |
| `src/features/auth/cleanup.test.ts` | Expiry integration tests |
| `src/features/auth/components/*.tsx` | Forms, moved and extended |
| `src/app/[locale]/forgot-password/page.tsx` | Request a reset link |
| `src/app/[locale]/reset-password/page.tsx` | Set a new password |
| `src/app/[locale]/app/settings/security/page.tsx` | Passkeys, password, methods |

**Modified:** `src/db/schema/auth.ts` (two tables), `src/lib/auth.ts` (config), `src/lib/auth-constants.ts`, `src/proxy.ts` (new public paths), `src/app/[locale]/{login,signup,client-login}/page.tsx` (imports), `src/components/layout/sign-out-button.tsx` (import), `src/i18n/messages/{ar,en}.json`, `.env.example`, `README.md`, `package.json`.

**Deleted:** `src/components/auth/` in its entirety (moved).

---

## Task 1: Dependencies and environment

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `src/lib/auth-constants.ts`

- [ ] **Step 1: Install the two new packages**

```bash
bun add @better-auth/passkey@1.6.25 resend
```

Expected: `package.json` gains both under `dependencies`. `@better-auth/passkey` must match the installed `better-auth` version (1.6.25) — a mismatch causes duplicate-context bugs that surface as "no session" at runtime.

- [ ] **Step 2: Add the new environment variables to `.env.example`**

Append to `.env.example`:

```bash
# Transactional email. "console" prints mail to the server console and needs no
# account — that is the development default, and it is what magic links already
# did. "resend" actually sends, and requires the two values below.
MAIL_TRANSPORT=console
RESEND_API_KEY=
EMAIL_FROM="Dietitian Clinic <noreply@example.com>"

# Google sign-in for staff. Create an OAuth client at
# https://console.cloud.google.com/apis/credentials and set the authorised
# redirect URI to: http://localhost:3000/api/auth/callback/google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

- [ ] **Step 3: Add the new constants**

Append to `src/lib/auth-constants.ts`:

```ts
const HOUR_IN_SECONDS = 60 * MINUTE_IN_SECONDS;

/** How long a "verify your email" link stays valid. */
export const EMAIL_VERIFICATION_TTL_SECONDS = HOUR_IN_SECONDS;

/** How long a password-reset link stays valid. Shorter than verification: it is the more dangerous token. */
export const PASSWORD_RESET_TTL_SECONDS = HOUR_IN_SECONDS;

/**
 * An account that never verified its address is deleted after this long.
 *
 * Deliberately short. Better Auth refuses to link a Google identity into an
 * unverified local account, so an address squatted by an unverified sign-up
 * blocks its real owner from signing in with Google until this expires. An
 * unverified account has nothing to lose — under the hard gate it cannot sign
 * in at all.
 */
export const UNVERIFIED_ACCOUNT_TTL_SECONDS = 24 * HOUR_IN_SECONDS;
```

- [ ] **Step 4: Verify the install typechecks**

Run: `bun run typecheck`
Expected: PASS (no source changes yet).

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock .env.example src/lib/auth-constants.ts
git commit -m "Add passkey and Resend dependencies, and their configuration"
```

---

## Task 2: The mailer seam

Everything that sends email goes through one function. Two transports, chosen by env.

**Files:**
- Create: `src/lib/mail/index.ts`, `src/lib/mail/console.ts`, `src/lib/mail/resend.ts`, `src/lib/mail/templates.ts`
- Test: `src/lib/mail/templates.test.ts`

- [ ] **Step 1: Write the failing template test**

Create `src/lib/mail/templates.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { renderMail } from './templates';

describe('renderMail', () => {
  test('renders Arabic with an RTL document direction', () => {
    const mail = renderMail('verifyEmail', 'ar', { url: 'https://example.test/v?token=abc', name: 'سارة' });

    expect(mail.html).toContain('dir="rtl"');
    expect(mail.html).toContain('lang="ar"');
    expect(mail.html).toContain('https://example.test/v?token=abc');
  });

  test('renders English with an LTR document direction', () => {
    const mail = renderMail('verifyEmail', 'en', { url: 'https://example.test/v?token=abc', name: 'Sara' });

    expect(mail.html).toContain('dir="ltr"');
    expect(mail.subject).not.toBe('');
  });

  test('always includes a plain-text alternative containing the url', () => {
    const mail = renderMail('resetPassword', 'en', { url: 'https://example.test/r?token=xyz', name: 'Sara' });

    expect(mail.text).toContain('https://example.test/r?token=xyz');
  });

  test('escapes a name containing HTML so it cannot inject markup', () => {
    const mail = renderMail('verifyEmail', 'en', { url: 'https://example.test/v', name: '<script>alert(1)</script>' });

    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test src/lib/mail/templates.test.ts`
Expected: FAIL — `Cannot find module './templates'`.

- [ ] **Step 3: Implement the templates**

Create `src/lib/mail/templates.ts`:

```ts
import { getLocaleDirection, type Locale } from '@/i18n/routing';

/**
 * Mail bodies are built here rather than in a message catalogue.
 *
 * next-intl's catalogue is for UI strings resolved inside a request scope; mail
 * is sent from Better Auth callbacks that have no such scope. Keeping the two
 * separate also means an email template can carry markup without teaching the
 * catalogue about HTML.
 */

export type MailKind = 'verifyEmail' | 'resetPassword' | 'magicLink';

export type MailVariables = { url: string; name: string };

export type RenderedMail = { subject: string; html: string; text: string };

const COPY = {
  verifyEmail: {
    ar: {
      subject: 'تأكيد بريدك الإلكتروني',
      heading: 'أهلاً {name}',
      body: 'اضغط الزر أدناه لتأكيد بريدك الإلكتروني وتفعيل حسابك.',
      cta: 'تأكيد البريد الإلكتروني',
      footer: 'إذا لم تنشئ هذا الحساب، تجاهل هذه الرسالة.',
    },
    en: {
      subject: 'Confirm your email address',
      heading: 'Hello {name}',
      body: 'Click the button below to confirm your email address and activate your account.',
      cta: 'Confirm email address',
      footer: 'If you did not create this account, you can ignore this message.',
    },
  },
  resetPassword: {
    ar: {
      subject: 'إعادة تعيين كلمة المرور',
      heading: 'أهلاً {name}',
      body: 'وصلنا طلب لإعادة تعيين كلمة المرور. اضغط الزر أدناه لاختيار كلمة مرور جديدة.',
      cta: 'إعادة تعيين كلمة المرور',
      footer: 'إذا لم تطلب ذلك، تجاهل هذه الرسالة ولن يتغير شيء.',
    },
    en: {
      subject: 'Reset your password',
      heading: 'Hello {name}',
      body: 'We received a request to reset your password. Click the button below to choose a new one.',
      cta: 'Reset password',
      footer: 'If you did not request this, ignore this message and nothing will change.',
    },
  },
  magicLink: {
    ar: {
      subject: 'رابط الدخول الخاص بك',
      heading: 'أهلاً {name}',
      body: 'اضغط الزر أدناه للدخول إلى حسابك. الرابط صالح لمرة واحدة فقط.',
      cta: 'الدخول',
      footer: 'إذا لم تطلب هذا الرابط، تجاهل هذه الرسالة.',
    },
    en: {
      subject: 'Your sign-in link',
      heading: 'Hello {name}',
      body: 'Click the button below to sign in. The link works once and then expires.',
      cta: 'Sign in',
      footer: 'If you did not request this link, ignore this message.',
    },
  },
} as const satisfies Record<MailKind, Record<Locale, Record<string, string>>>;

/**
 * Mail bodies interpolate a user-supplied name, and mail clients render HTML.
 * Escaping is therefore not optional.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMail(kind: MailKind, locale: Locale, variables: MailVariables): RenderedMail {
  const copy = COPY[kind][locale];
  const direction = getLocaleDirection(locale);

  const safeName = escapeHtml(variables.name);
  const heading = copy.heading.replace('{name}', safeName);

  // Inline styles only: every meaningful mail client strips <style> blocks.
  const html = `<!doctype html>
<html lang="${locale}" dir="${direction}">
  <body style="margin:0;padding:24px;background:#f6f6f6;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">${heading}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">${copy.body}</p>
      <p style="margin:0 0 24px;">
        <a href="${variables.url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;">${copy.cta}</a>
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">${copy.footer}</p>
    </div>
  </body>
</html>`;

  const text = `${heading}\n\n${copy.body}\n\n${variables.url}\n\n${copy.footer}\n`;

  return { subject: copy.subject, html, text };
}
```

- [ ] **Step 4: Run the template tests**

Run: `bun test src/lib/mail/templates.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Implement the console transport**

Create `src/lib/mail/console.ts`:

```ts
import type { Mail, Mailer } from './index';

/**
 * Development transport. Prints the mail to the server console instead of
 * sending it, which is exactly what `sendMagicLink` already did — so local
 * development needs no account, no API key and no domain.
 *
 * The URL is printed on its own line so it can be clicked or copied out of the
 * terminal without fighting the surrounding text.
 */
export const consoleMailer: Mailer = {
  async send(mail: Mail): Promise<void> {
    const url = mail.text.match(/https?:\/\/\S+/)?.[0];

    console.info(
      [
        '',
        '─────────── mail (console transport) ───────────',
        `to:      ${mail.to}`,
        `subject: ${mail.subject}`,
        url ? `link:    ${url}` : '',
        '────────────────────────────────────────────────',
        '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  },
};
```

- [ ] **Step 6: Implement the Resend transport**

Create `src/lib/mail/resend.ts`:

```ts
import { Resend } from 'resend';

import type { Mail, Mailer } from './index';

/**
 * Production transport.
 *
 * The client is created once at module scope. Both env vars are read here and
 * not at call time, so a misconfigured deployment fails while the module is
 * first evaluated rather than silently on the first password reset.
 */
export function createResendMailer(apiKey: string, from: string): Mailer {
  const resend = new Resend(apiKey);

  return {
    async send(mail: Mail): Promise<void> {
      const { error } = await resend.emails.send({
        from,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });

      // Resend reports failures in the payload rather than by throwing.
      if (error) {
        throw new Error(`Resend refused the message: ${error.name}: ${error.message}`);
      }
    },
  };
}
```

- [ ] **Step 7: Implement the seam**

Create `src/lib/mail/index.ts`:

```ts
import type { Locale } from '@/i18n/routing';

import { consoleMailer } from './console';
import { createResendMailer } from './resend';
import { renderMail, type MailKind, type MailVariables } from './templates';

export type Mail = { to: string; subject: string; html: string; text: string };

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/**
 * Chooses a transport from the environment.
 *
 * A production deployment that names `resend` without configuring it throws
 * here, at first use, rather than swallowing the mail. A mailer that silently
 * drops password resets is worse than one that refuses to run: the failure is
 * invisible until a locked-out dietitian calls to ask why no email arrived.
 */
function createMailer(): Mailer {
  const transport = process.env.MAIL_TRANSPORT ?? 'console';

  if (transport === 'console') return consoleMailer;

  if (transport !== 'resend') {
    throw new Error(`Unknown MAIL_TRANSPORT "${transport}". Use "console" or "resend".`);
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey) throw new Error('MAIL_TRANSPORT=resend but RESEND_API_KEY is not set.');
  if (!from) throw new Error('MAIL_TRANSPORT=resend but EMAIL_FROM is not set.');

  return createResendMailer(apiKey, from);
}

let cached: Mailer | undefined;

export function getMailer(): Mailer {
  cached ??= createMailer();
  return cached;
}

/** The one function the rest of the app calls. */
export async function sendMail(
  kind: MailKind,
  to: string,
  locale: Locale,
  variables: MailVariables,
): Promise<void> {
  await getMailer().send({ to, ...renderMail(kind, locale, variables) });
}

export { renderMail, type MailKind, type MailVariables } from './templates';
```

- [ ] **Step 8: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: PASS both.

- [ ] **Step 9: Commit**

```bash
git add src/lib/mail
git commit -m "Add a mailer seam with console and Resend transports"
```

---

## Task 3: Database tables

Two tables: one Better Auth's passkey plugin requires, one ours for rate limiting.

**Files:**
- Modify: `src/db/schema/auth.ts`
- Create: a generated migration in `drizzle/`

- [ ] **Step 1: Add both tables**

Append to `src/db/schema/auth.ts`:

```ts
/**
 * Backing store for `@better-auth/passkey`. The column set is dictated by the
 * plugin — this is Better Auth's table, not a domain one, so it follows the
 * same text-primary-key exception as the tables above.
 */
export const passkey = pgTable(
  'passkeys',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull(),
    counter: integer('counter').notNull().default(0),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull().default(false),
    transports: text('transports'),
    aaguid: text('aaguid'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Sign-in looks a credential up by this id, and it must be globally unique.
    uniqueIndex('passkeys_credential_id_idx').on(table.credentialID),
    index('passkeys_user_id_idx').on(table.userId),
  ],
);

/**
 * Every failed authentication attempt, used for throttling and lockout.
 *
 * This table exists because Better Auth's own rate limiter cannot help us: it
 * runs in the router's `onRequest` hook, and every auth call in this app is a
 * direct `auth.api.*()` invocation from a server action that never reaches the
 * router. See `src/features/auth/rate-limit.ts`.
 *
 * Attempts are recorded for addresses that do NOT exist as well. If they were
 * not, a lockout response would confirm an account exists — reintroducing the
 * account-enumeration leak that the deliberately vague sign-in error prevents.
 */
export const authAttempt = pgTable(
  'auth_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** sign_in | sign_up | password_reset | verification_resend | magic_link */
    kind: text('kind').notNull(),

    /** Normalised (trimmed, lowercased) before it is written. Null for IP-only limits. */
    email: text('email'),

    /**
     * Read from `x-forwarded-for`, which is FORGEABLE when no trusted proxy sits
     * in front of the app. The per-email limit is the load-bearing control; this
     * is defence in depth. Do not build anything that assumes it is truthful.
     */
    ipAddress: text('ip_address'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('auth_attempts_kind_email_idx').on(table.kind, table.email, table.createdAt),
    index('auth_attempts_kind_ip_idx').on(table.kind, table.ipAddress, table.createdAt),
  ],
);

export type AuthAttempt = typeof authAttempt.$inferSelect;
```

Extend the import at the top of the file to include `index` and `integer`:

```ts
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
```

- [ ] **Step 2: Generate the migration**

Run: `bun run db:generate`
Expected: a new file in `drizzle/` creating `passkeys` and `auth_attempts`.

- [ ] **Step 3: Read the generated SQL before applying it**

Open the new file in `drizzle/`. Confirm it only *creates* two tables and their indexes. If it drops or alters anything, stop — the schema drifted and applying it would lose data.

- [ ] **Step 4: Apply to both databases**

```bash
bun run db:migrate
```

```bash
bun run db:migrate:test
```

Expected: both report the migration applied.

- [ ] **Step 5: Verify**

Run: `bun run typecheck && bun test tests/smoke.test.ts`
Expected: PASS. The smoke test truncates every table it discovers, so it will now find the two new ones.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/auth.ts drizzle
git commit -m "Add passkeys and auth_attempts tables"
```

---

## Task 4: Rate limiting

The security core of this plan. Pure policy plus a database-backed recorder, both testable without Next.js.

**Files:**
- Create: `src/features/auth/rate-limit.ts`
- Test: `src/features/auth/rate-limit.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/auth/rate-limit.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test';

import { db } from '@/db';
import { authAttempt } from '@/db/schema';

import { resetDatabase } from '../../../tests/helpers';
import {
  AUTH_LIMITS,
  checkRateLimit,
  clearAttempts,
  minutesUntilReset,
  recordAttempt,
} from './rate-limit';

beforeEach(async () => {
  await resetDatabase();
});

describe('minutesUntilReset', () => {
  test('rounds a partial minute up, so "try again in 0 minutes" is impossible', () => {
    const oldest = new Date(Date.now() - 30_000);
    expect(minutesUntilReset(oldest, 15 * 60)).toBe(15);
  });

  test('reports the remaining whole minutes of the window', () => {
    const oldest = new Date(Date.now() - 10 * 60_000);
    expect(minutesUntilReset(oldest, 15 * 60)).toBe(5);
  });

  test('never returns less than one minute', () => {
    const oldest = new Date(Date.now() - 15 * 60_000);
    expect(minutesUntilReset(oldest, 15 * 60)).toBe(1);
  });
});

describe('checkRateLimit for sign_in', () => {
  const email = 'staff@clinic.test';

  test('allows an attempt when nothing has been recorded', async () => {
    const result = await checkRateLimit('sign_in', { email, ipAddress: '1.1.1.1' });
    expect(result.allowed).toBe(true);
  });

  test('allows the attempt that reaches one below the limit', async () => {
    const limit = AUTH_LIMITS.sign_in.email.max;

    for (let i = 0; i < limit - 1; i += 1) {
      await recordAttempt('sign_in', { email, ipAddress: '1.1.1.1' });
    }

    const result = await checkRateLimit('sign_in', { email, ipAddress: '1.1.1.1' });
    expect(result.allowed).toBe(true);
  });

  test('blocks once the email limit is reached, and says how long', async () => {
    const limit = AUTH_LIMITS.sign_in.email.max;

    for (let i = 0; i < limit; i += 1) {
      await recordAttempt('sign_in', { email, ipAddress: '1.1.1.1' });
    }

    const result = await checkRateLimit('sign_in', { email, ipAddress: '1.1.1.1' });

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryInMinutes).toBeGreaterThan(0);
    }
  });

  test('blocks a different email from the same IP once the IP limit is reached', async () => {
    const limit = AUTH_LIMITS.sign_in.ip.max;

    for (let i = 0; i < limit; i += 1) {
      await recordAttempt('sign_in', { email: `person${i}@clinic.test`, ipAddress: '9.9.9.9' });
    }

    const result = await checkRateLimit('sign_in', { email: 'someone-else@clinic.test', ipAddress: '9.9.9.9' });
    expect(result.allowed).toBe(false);
  });

  test('counts attempts for addresses that do not exist, so lockout cannot confirm an account', async () => {
    const limit = AUTH_LIMITS.sign_in.email.max;

    for (let i = 0; i < limit; i += 1) {
      await recordAttempt('sign_in', { email: 'nobody@nowhere.test', ipAddress: '2.2.2.2' });
    }

    const result = await checkRateLimit('sign_in', { email: 'nobody@nowhere.test', ipAddress: '2.2.2.2' });
    expect(result.allowed).toBe(false);
  });

  test('ignores attempts older than the window', async () => {
    const limit = AUTH_LIMITS.sign_in.email.max;
    const longAgo = new Date(Date.now() - (AUTH_LIMITS.sign_in.email.windowSeconds + 60) * 1000);

    await db.insert(authAttempt).values(
      Array.from({ length: limit }, () => ({
        kind: 'sign_in',
        email,
        ipAddress: '1.1.1.1',
        createdAt: longAgo,
      })),
    );

    const result = await checkRateLimit('sign_in', { email, ipAddress: '1.1.1.1' });
    expect(result.allowed).toBe(true);
  });

  test('normalises the email, so casing and spacing cannot dodge the limit', async () => {
    const limit = AUTH_LIMITS.sign_in.email.max;

    for (let i = 0; i < limit; i += 1) {
      await recordAttempt('sign_in', { email: '  STAFF@Clinic.TEST ', ipAddress: '1.1.1.1' });
    }

    const result = await checkRateLimit('sign_in', { email, ipAddress: '1.1.1.1' });
    expect(result.allowed).toBe(false);
  });

  test('a kind with no IP rule is unaffected by other IP traffic', async () => {
    for (let i = 0; i < 50; i += 1) {
      await recordAttempt('sign_in', { email: `x${i}@clinic.test`, ipAddress: '3.3.3.3' });
    }

    const result = await checkRateLimit('password_reset', { email, ipAddress: '3.3.3.3' });
    expect(result.allowed).toBe(true);
  });
});

describe('clearAttempts', () => {
  test('a successful sign-in clears that email, and only that email', async () => {
    const limit = AUTH_LIMITS.sign_in.email.max;

    for (let i = 0; i < limit; i += 1) {
      await recordAttempt('sign_in', { email: 'a@clinic.test', ipAddress: '1.1.1.1' });
      await recordAttempt('sign_in', { email: 'b@clinic.test', ipAddress: '1.1.1.1' });
    }

    await clearAttempts('sign_in', 'a@clinic.test');

    const cleared = await checkRateLimit('sign_in', { email: 'a@clinic.test', ipAddress: null });
    const untouched = await checkRateLimit('sign_in', { email: 'b@clinic.test', ipAddress: null });

    expect(cleared.allowed).toBe(true);
    expect(untouched.allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/features/auth/rate-limit.test.ts`
Expected: FAIL — `Cannot find module './rate-limit'`.

- [ ] **Step 3: Implement the rate limiter**

Create `src/features/auth/rate-limit.ts`:

```ts
import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';

import { db } from '@/db';
import { authAttempt } from '@/db/schema';

/**
 * Attempt throttling for the auth server actions.
 *
 * WHY THIS EXISTS: Better Auth ships a rate limiter, and it cannot help us. It
 * runs in the router's `onRequest` hook
 * (`node_modules/better-auth/dist/api/index.mjs`), which only fires for requests
 * that pass through the HTTP handler. Every auth call in this app is a direct
 * `auth.api.*()` invocation from a server action, so it never reaches the
 * router. Turning on `rateLimit` in the Better Auth config would look like
 * protection and provide none.
 *
 * Passkey sign-in is the one exception: WebAuthn must run in the browser, so it
 * goes over HTTP and IS covered by Better Auth's limiter.
 *
 * This module imports nothing from Next.js so `bun test` can drive it directly.
 */

export type AttemptKind = 'sign_in' | 'sign_up' | 'password_reset' | 'verification_resend' | 'magic_link';

type Rule = { max: number; windowSeconds: number };

const MINUTE = 60;
const HOUR = 60 * MINUTE;

/**
 * Per-kind limits. A rule may be omitted when it does not apply — sign-up has
 * no email rule, because the whole point is that the address is new.
 */
export const AUTH_LIMITS = {
  sign_in: {
    email: { max: 5, windowSeconds: 15 * MINUTE },
    ip: { max: 20, windowSeconds: 15 * MINUTE },
  },
  sign_up: {
    ip: { max: 3, windowSeconds: HOUR },
  },
  password_reset: {
    email: { max: 3, windowSeconds: HOUR },
    ip: { max: 10, windowSeconds: HOUR },
  },
  verification_resend: {
    email: { max: 3, windowSeconds: HOUR },
    ip: { max: 10, windowSeconds: HOUR },
  },
  magic_link: {
    email: { max: 3, windowSeconds: 15 * MINUTE },
    ip: { max: 10, windowSeconds: HOUR },
  },
} as const satisfies Record<AttemptKind, { email?: Rule; ip?: Rule }>;

export type RateLimitResult = { allowed: true } | { allowed: false; retryInMinutes: number };

export type AttemptIdentity = { email: string | null; ipAddress: string | null };

/** The same normalisation the auth schemas apply, so a limit cannot be dodged by casing. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Whole minutes until the oldest attempt in the window falls out of it.
 *
 * Always at least 1: telling someone to "try again in 0 minutes" reads as a bug,
 * and rounding up never under-reports the wait.
 */
export function minutesUntilReset(oldestAttempt: Date, windowSeconds: number): number {
  const freeAt = oldestAttempt.getTime() + windowSeconds * 1000;
  const remainingMs = freeAt - Date.now();

  return Math.max(1, Math.ceil(remainingMs / 60_000));
}

async function countAndOldest(
  kind: AttemptKind,
  column: 'email' | 'ipAddress',
  value: string,
  windowSeconds: number,
): Promise<{ total: number; oldest: Date | null }> {
  const since = new Date(Date.now() - windowSeconds * 1000);
  const target = column === 'email' ? authAttempt.email : authAttempt.ipAddress;

  const rows = await db
    .select({ createdAt: authAttempt.createdAt })
    .from(authAttempt)
    .where(and(eq(authAttempt.kind, kind), eq(target, value), gte(authAttempt.createdAt, since)))
    .orderBy(asc(authAttempt.createdAt));

  return { total: rows.length, oldest: rows[0]?.createdAt ?? null };
}

/**
 * Checks both rules for a kind WITHOUT recording anything. Call before the
 * attempt; call `recordAttempt` after it fails.
 */
export async function checkRateLimit(kind: AttemptKind, identity: AttemptIdentity): Promise<RateLimitResult> {
  const rules: { email?: Rule; ip?: Rule } = AUTH_LIMITS[kind];

  if (rules.email && identity.email) {
    const { total, oldest } = await countAndOldest(kind, 'email', normalizeEmail(identity.email), rules.email.windowSeconds);

    if (total >= rules.email.max && oldest) {
      return { allowed: false, retryInMinutes: minutesUntilReset(oldest, rules.email.windowSeconds) };
    }
  }

  if (rules.ip && identity.ipAddress) {
    const { total, oldest } = await countAndOldest(kind, 'ipAddress', identity.ipAddress, rules.ip.windowSeconds);

    if (total >= rules.ip.max && oldest) {
      return { allowed: false, retryInMinutes: minutesUntilReset(oldest, rules.ip.windowSeconds) };
    }
  }

  return { allowed: true };
}

/**
 * Records one failed attempt, and opportunistically deletes rows that have aged
 * out of every window. Housekeeping rides along with writes so no scheduled job
 * is needed to keep the table small.
 */
export async function recordAttempt(kind: AttemptKind, identity: AttemptIdentity): Promise<void> {
  await db.insert(authAttempt).values({
    kind,
    email: identity.email ? normalizeEmail(identity.email) : null,
    ipAddress: identity.ipAddress,
  });

  const longestWindow = Math.max(
    ...Object.values(AUTH_LIMITS).flatMap((rules: { email?: Rule; ip?: Rule }) =>
      [rules.email?.windowSeconds, rules.ip?.windowSeconds].filter((value): value is number => value !== undefined),
    ),
  );

  await db.delete(authAttempt).where(lt(authAttempt.createdAt, new Date(Date.now() - longestWindow * 1000)));
}

/** Called after a success, so a correct password wipes the failures that preceded it. */
export async function clearAttempts(kind: AttemptKind, email: string): Promise<void> {
  await db.delete(authAttempt).where(and(eq(authAttempt.kind, kind), eq(authAttempt.email, normalizeEmail(email))));
}

/**
 * Best-effort client address.
 *
 * `x-forwarded-for` is set by whatever proxy sits in front of the app, and is
 * trivially forged when none does. Treat the result as a hint: the per-email
 * limit is what actually protects an account.
 */
export function readClientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();

  return first || headers.get('x-real-ip') || null;
}
```

Note: the unused `sql` import above must be removed if lint flags it — include only what the final code uses.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/features/auth/rate-limit.test.ts`
Expected: PASS — all tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/rate-limit.ts src/features/auth/rate-limit.test.ts
git commit -m "Add action-layer rate limiting for auth attempts"
```

---

## Task 5: Safe redirect resolution

`src/proxy.ts` already writes `?redirect=`. Nothing reads it. Reading it naively is an open redirect.

**Files:**
- Create: `src/features/auth/redirect.ts`
- Test: `src/features/auth/redirect.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/auth/redirect.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { resolveSafeRedirect } from './redirect';

describe('resolveSafeRedirect', () => {
  test('accepts a path inside the staff area for the current locale', () => {
    expect(resolveSafeRedirect('/ar/app/clients', 'ar', 'staff')).toBe('/ar/app/clients');
  });

  test('accepts a path inside the portal for a client', () => {
    expect(resolveSafeRedirect('/en/portal', 'en', 'client')).toBe('/en/portal');
  });

  test('falls back to the area home when nothing was requested', () => {
    expect(resolveSafeRedirect(null, 'ar', 'staff')).toBe('/ar/app');
    expect(resolveSafeRedirect(null, 'en', 'client')).toBe('/en/portal');
  });

  test('rejects an absolute URL', () => {
    expect(resolveSafeRedirect('https://evil.test/ar/app', 'ar', 'staff')).toBe('/ar/app');
  });

  test('rejects a protocol-relative URL, which a naive startsWith("/") check would allow', () => {
    expect(resolveSafeRedirect('//evil.test', 'ar', 'staff')).toBe('/ar/app');
    expect(resolveSafeRedirect('//evil.test/ar/app', 'ar', 'staff')).toBe('/ar/app');
  });

  test('rejects a backslash-prefixed URL, which some browsers normalise to //', () => {
    expect(resolveSafeRedirect('\\\\evil.test', 'ar', 'staff')).toBe('/ar/app');
    expect(resolveSafeRedirect('/\\evil.test', 'ar', 'staff')).toBe('/ar/app');
  });

  test('rejects another locale, so a redirect cannot silently switch language', () => {
    expect(resolveSafeRedirect('/en/app/clients', 'ar', 'staff')).toBe('/ar/app');
  });

  test('rejects the other role’s area', () => {
    expect(resolveSafeRedirect('/ar/portal', 'ar', 'staff')).toBe('/ar/app');
    expect(resolveSafeRedirect('/ar/app/clients', 'ar', 'client')).toBe('/ar/portal');
  });

  test('rejects a sibling path that merely shares the prefix', () => {
    expect(resolveSafeRedirect('/ar/apple', 'ar', 'staff')).toBe('/ar/app');
  });

  test('accepts the area root exactly', () => {
    expect(resolveSafeRedirect('/ar/app', 'ar', 'staff')).toBe('/ar/app');
  });

  test('strips a query string and hash rather than trusting them through', () => {
    expect(resolveSafeRedirect('/ar/app/clients?q=x#y', 'ar', 'staff')).toBe('/ar/app/clients');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/features/auth/redirect.test.ts`
Expected: FAIL — `Cannot find module './redirect'`.

- [ ] **Step 3: Implement it**

Create `src/features/auth/redirect.ts`:

```ts
import type { Locale } from '@/i18n/routing';
import type { UserRole } from '@/lib/auth';

/**
 * Resolves where to send someone after they sign in.
 *
 * `src/proxy.ts` appends `?redirect=<pathname>` when it turns an anonymous
 * request away, so the value arrives from the URL and is entirely attacker
 * controlled. Anything other than an allow-list here is an open redirect — the
 * classic phishing primitive, where a link on the real domain bounces the victim
 * to a copy of the sign-in page.
 *
 * Pure: no Next.js import, so `bun test` drives it directly.
 */

const AREA_BY_ROLE = {
  staff: 'app',
  client: 'portal',
} as const satisfies Record<UserRole, string>;

export function resolveSafeRedirect(
  requested: string | null | undefined,
  locale: Locale,
  role: UserRole,
): string {
  const home = `/${locale}/${AREA_BY_ROLE[role]}`;

  if (!requested) return home;

  // Reject anything that is not a plain, single-slash-rooted path. `//host` and
  // `/\host` are both read as protocol-relative URLs by browsers, and a
  // `startsWith('/')` check alone lets them straight through.
  if (!requested.startsWith('/')) return home;
  if (requested.startsWith('//')) return home;
  if (requested.includes('\\')) return home;

  // Drop the query and hash: only the path is being validated, so carrying the
  // rest through would smuggle unvalidated input into the destination.
  const path = requested.split('?')[0]?.split('#')[0] ?? '';

  // Exact match on the area root, or a real child of it. A plain `startsWith`
  // would accept `/ar/apple` as living inside `/ar/app`.
  if (path === home || path.startsWith(`${home}/`)) return path;

  return home;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/features/auth/redirect.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/redirect.ts src/features/auth/redirect.test.ts
git commit -m "Add safe post-sign-in redirect resolution"
```

---

## Task 6: Unverified account cleanup

**Files:**
- Create: `src/features/auth/cleanup.ts`
- Test: `src/features/auth/cleanup.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/auth/cleanup.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { clients, clinics, user } from '@/db/schema';

import { resetDatabase } from '../../../tests/helpers';
import { purgeUnverifiedAccounts } from './cleanup';

const DAY_MS = 24 * 60 * 60 * 1000;

async function makeUnverifiedStaff(email: string, createdAt: Date): Promise<{ userId: string; clinicId: string }> {
  const [clinic] = await db.insert(clinics).values({ name: 'Pending Clinic' }).returning({ id: clinics.id });
  if (!clinic) throw new Error('insert into clinics returned no row');

  const userId = crypto.randomUUID();

  await db.insert(user).values({
    id: userId,
    name: 'Pending',
    email,
    emailVerified: false,
    role: 'staff',
    clinicId: clinic.id,
    createdAt,
  });

  return { userId, clinicId: clinic.id };
}

beforeEach(async () => {
  await resetDatabase();
});

describe('purgeUnverifiedAccounts', () => {
  test('deletes an unverified account older than the cutoff, and its empty clinic', async () => {
    const { userId, clinicId } = await makeUnverifiedStaff('stale@clinic.test', new Date(Date.now() - 2 * DAY_MS));

    const removed = await purgeUnverifiedAccounts();

    expect(removed).toBe(1);
    expect(await db.select().from(user).where(eq(user.id, userId))).toHaveLength(0);
    expect(await db.select().from(clinics).where(eq(clinics.id, clinicId))).toHaveLength(0);
  });

  test('keeps an unverified account that is still inside the window', async () => {
    const { userId } = await makeUnverifiedStaff('fresh@clinic.test', new Date(Date.now() - 60_000));

    const removed = await purgeUnverifiedAccounts();

    expect(removed).toBe(0);
    expect(await db.select().from(user).where(eq(user.id, userId))).toHaveLength(1);
  });

  test('never touches a verified account, however old', async () => {
    const [clinic] = await db.insert(clinics).values({ name: 'Real Clinic' }).returning({ id: clinics.id });
    if (!clinic) throw new Error('insert into clinics returned no row');

    const userId = crypto.randomUUID();
    await db.insert(user).values({
      id: userId,
      name: 'Real',
      email: 'real@clinic.test',
      emailVerified: true,
      role: 'staff',
      clinicId: clinic.id,
      createdAt: new Date(Date.now() - 400 * DAY_MS),
    });

    const removed = await purgeUnverifiedAccounts();

    expect(removed).toBe(0);
    expect(await db.select().from(user).where(eq(user.id, userId))).toHaveLength(1);
  });

  test('keeps a clinic that holds clients, even when its only staff account expires', async () => {
    const { clinicId } = await makeUnverifiedStaff('stale2@clinic.test', new Date(Date.now() - 2 * DAY_MS));

    await db.insert(clients).values({
      clinicId,
      fullName: 'Recorded Patient',
      searchName: 'recorded patient',
    });

    await purgeUnverifiedAccounts();

    // The account goes; the clinical records it created must not.
    expect(await db.select().from(clinics).where(eq(clinics.id, clinicId))).toHaveLength(1);
    expect(await db.select().from(clients).where(eq(clients.clinicId, clinicId))).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/features/auth/cleanup.test.ts`
Expected: FAIL — `Cannot find module './cleanup'`.

- [ ] **Step 3: Implement it**

Create `src/features/auth/cleanup.ts`:

```ts
import { and, eq, inArray, lt, notInArray } from 'drizzle-orm';

import { db } from '@/db';
import { clients, clinics, user } from '@/db/schema';
import { UNVERIFIED_ACCOUNT_TTL_SECONDS } from '@/lib/auth-constants';

/**
 * Deletes accounts that never verified their email, and the clinics they left
 * behind.
 *
 * Two reasons this matters more than ordinary housekeeping:
 *
 * 1. A mistyped address at sign-up is unrecoverable under the hard verification
 *    gate — no session exists and the mail went elsewhere. Those rows would
 *    otherwise accumulate forever.
 * 2. Better Auth refuses to link a Google identity into an unverified local
 *    account (`dist/oauth2/link-account.mjs`). So an address squatted by an
 *    unverified sign-up blocks its genuine owner from using Google until the
 *    squatter expires. That is why the TTL is 24 hours and not a week.
 *
 * A clinic is only removed when it holds no clients. Deleting a clinic cascades
 * to its clients, and a clinical record must never be collateral damage of a
 * housekeeping pass.
 *
 * Imports nothing from Next.js so `bun test` can drive it directly.
 */
export async function purgeUnverifiedAccounts(): Promise<number> {
  const cutoff = new Date(Date.now() - UNVERIFIED_ACCOUNT_TTL_SECONDS * 1000);

  const expired = await db
    .select({ id: user.id, clinicId: user.clinicId })
    .from(user)
    .where(and(eq(user.emailVerified, false), lt(user.createdAt, cutoff)));

  if (expired.length === 0) return 0;

  await db.delete(user).where(
    inArray(
      user.id,
      expired.map((row) => row.id),
    ),
  );

  const clinicIds = [...new Set(expired.map((row) => row.clinicId).filter((id): id is string => id !== null))];

  if (clinicIds.length > 0) {
    // Only clinics with no clients, and no remaining staff, are removed.
    const withClients = await db
      .select({ clinicId: clients.clinicId })
      .from(clients)
      .where(inArray(clients.clinicId, clinicIds));

    const withStaff = await db
      .select({ clinicId: user.clinicId })
      .from(user)
      .where(inArray(user.clinicId, clinicIds));

    const keep = new Set<string>([
      ...withClients.map((row) => row.clinicId),
      ...withStaff.map((row) => row.clinicId).filter((id): id is string => id !== null),
    ]);

    const removable = clinicIds.filter((id) => !keep.has(id));

    if (removable.length > 0) {
      await db.delete(clinics).where(inArray(clinics.id, removable));
    }
  }

  return expired.length;
}
```

Remove `notInArray` from the import if lint reports it unused.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/features/auth/cleanup.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/cleanup.ts src/features/auth/cleanup.test.ts
git commit -m "Expire unverified accounts after 24 hours"
```

---

## Task 7: Better Auth configuration

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/auth-client.ts`

- [ ] **Step 1: Rewrite the Better Auth server config**

In `src/lib/auth.ts`, add the imports:

```ts
import { passkey } from '@better-auth/passkey';

import { sendMail } from '@/lib/mail';

import {
  EMAIL_VERIFICATION_TTL_SECONDS,
  PASSWORD_RESET_TTL_SECONDS,
} from './auth-constants';
```

Add a helper next to `resolveRequestLocale`:

```ts
/**
 * The locale a mail should be written in. Better Auth hands us the user row, and
 * `users.locale` is exactly the preference captured at sign-up.
 */
function userLocale(value: unknown): Locale {
  return locales.includes(value as Locale) ? (value as Locale) : defaultLocale;
}
```

Replace the `emailAndPassword` block:

```ts
  /**
   * Dietitian and staff accounts. Client accounts never get a password.
   *
   * `autoSignIn` is OFF and `requireEmailVerification` is ON: signing up creates
   * the account but issues no session. That is the hard gate — an address must
   * be proven real before it can hold a clinic, and before a password reset
   * would have anywhere to go.
   */
  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    requireEmailVerification: true,
    autoSignIn: false,
    resetPasswordTokenExpiresIn: PASSWORD_RESET_TTL_SECONDS,
    sendResetPassword: async ({ user: recipient, url }) => {
      await sendMail('resetPassword', recipient.email, userLocale(recipient.locale), {
        url,
        name: recipient.name,
      });
    },
    /**
     * A reset is what someone does when they believe another person holds their
     * password. Leaving that person's sessions alive would defeat the point.
     *
     * Better Auth does this itself when the flag is set — see
     * `dist/api/routes/password.mjs`, which calls
     * `internalAdapter.deleteUserSessions(userId)` right after the reset. Do not
     * hand-roll it: `auth.api.revokeUserSessions` does NOT exist in the base API
     * (it ships with the admin plugin), and a custom `onPasswordReset` callback
     * that reaches for `auth` would reference the binding during its own
     * initialisation.
     */
    revokeSessionsOnPasswordReset: true,
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: EMAIL_VERIFICATION_TTL_SECONDS,
    sendVerificationEmail: async ({ user: recipient, url }) => {
      await sendMail('verifyEmail', recipient.email, userLocale(recipient.locale), {
        url,
        name: recipient.name,
      });
    },
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
  },

  account: {
    accountLinking: {
      enabled: true,
      /**
       * Google has verified the address it asserts, so an identity it vouches
       * for may join an existing account.
       */
      trustedProviders: ['google'],

      /**
       * DO NOT SET `requireLocalEmailVerified: false`.
       *
       * It defaults to true, and that default is what blocks OAuth
       * pre-hijacking: an attacker signs up with the victim's address and a
       * password of their choosing, never verifies, then waits for the victim to
       * sign in with Google — which would otherwise link the two and hand the
       * attacker a working password on the victim's account. Better Auth refuses
       * the link instead (`dist/oauth2/link-account.mjs`).
       *
       * The option is marked deprecated pending the gate becoming unconditional.
       * When it is removed, nothing needs doing here; until then, leaving it
       * unset is deliberate, not an oversight.
       */
    },
  },
```

Add the passkey plugin to the `plugins` array, **before** `nextCookies()`:

```ts
    /**
     * WebAuthn. Registration and sign-in must run in the browser, so these are
     * the only auth paths that go over HTTP rather than through a server action
     * — which also means they are the only ones Better Auth's own rate limiter
     * actually covers.
     */
    passkey({
      rpID: new URL(process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').hostname,
      rpName: 'Dietitian Clinic',
      origin: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    }),
```

Update the `magicLink` plugin's `sendMagicLink` to use the mailer instead of throwing:

```ts
      sendMagicLink: async ({ email, url }) => {
        // The recipient may not exist as a user yet, so the locale comes from the
        // client record where possible and falls back to the default.
        await sendMail('magicLink', email, defaultLocale, { url, name: email });
      },
```

Extend the drizzle adapter schema to include the passkey table:

```ts
  database: drizzleAdapter(db, {
    provider: 'pg',
    // Better Auth's model names on the left, our Drizzle tables on the right.
    schema: { user, session, account, verification, passkey: passkeyTable },
  }),
```

with `import { account, passkey as passkeyTable, session, user, verification } from '@/db/schema/auth';`.

- [ ] **Step 2: Add the passkey client plugin**

In `src/lib/auth-client.ts`:

```ts
import { passkeyClient } from '@better-auth/passkey/client';
```

and add `passkeyClient(),` to the `plugins` array.

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS. If Better Auth complains that the `passkey` model is missing, the adapter schema key in Step 1 is wrong — it must be exactly `passkey`.

- [ ] **Step 4: Verify the app still boots**

Run: `bun run dev`, open `http://localhost:3000/ar`, confirm the landing page renders, then stop the server.
Expected: no startup error. `MAIL_TRANSPORT` is unset, so the console transport is selected.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/auth-client.ts
git commit -m "Configure verification, password reset, Google and passkeys"
```

---

## Task 8: Move auth into a feature folder

Pure relocation. No behaviour changes — that keeps the diff reviewable before Task 9 changes logic.

**Files:**
- Move: `src/components/auth/*` → `src/features/auth/`
- Modify: `src/app/[locale]/{login,signup,client-login}/page.tsx`, `src/components/layout/sign-out-button.tsx`

- [ ] **Step 1: Move the files with git so history follows**

```bash
git mv src/components/auth/actions.ts src/features/auth/actions.ts
```

```bash
git mv src/components/auth/client-login-form.tsx src/features/auth/components/client-login-form.tsx
```

```bash
git mv src/components/auth/form-parts.tsx src/features/auth/components/form-parts.tsx
```

```bash
git mv src/components/auth/password-input.tsx src/features/auth/components/password-input.tsx
```

```bash
git mv src/components/auth/staff-login-form.tsx src/features/auth/components/staff-login-form.tsx
```

```bash
git mv src/components/auth/staff-signup-form.tsx src/features/auth/components/staff-signup-form.tsx
```

- [ ] **Step 2: Extract the state shapes out of the action module**

Create `src/features/auth/form-state.ts` and move `AuthFormState` into it verbatim, adding the new variants this plan needs:

```ts
/**
 * State shapes for the auth forms.
 *
 * These live outside `actions.ts` because a `"use server"` module may only
 * export async functions. Exporting a type is erased and would be harmless, but
 * the initial-value constants below are not — Next would replace them with
 * server references and `state.status` would read as `undefined` at runtime.
 */

export type AuthFormState =
  | { status: 'idle' }
  | {
      status: 'error';
      messageKey:
        | 'genericError'
        | 'emailTaken'
        | 'passwordMismatch'
        | 'passwordTooShort'
        | 'nameRequired'
        | 'invalidEmail'
        | 'verifyEmailFirst'
        | 'accountNotLinked';
    }
  | { status: 'rateLimited'; messageKey: 'rateLimited'; minutes: number }
  | { status: 'sent'; messageKey: 'magicLinkSent' | 'verificationSent' | 'resetLinkSent' }
  | { status: 'success'; messageKey: 'passwordChanged' };

export const initialAuthState: AuthFormState = { status: 'idle' };
```

- [ ] **Step 3: Update every import of the moved modules**

Search and replace `@/components/auth/` with `@/features/auth/` across `src/`, then fix the component paths to include `components/`:

Run: `bun run typecheck`
Expected: FAIL initially, listing each unresolved import. Fix them until it passes. The known callers are the three login route files and `src/components/layout/sign-out-button.tsx`.

- [ ] **Step 4: Confirm the old directory is gone**

Run: `ls src/components/auth`
Expected: no such directory.

- [ ] **Step 5: Lint and typecheck**

Run: `bun run typecheck && bun run lint`
Expected: PASS both.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "Move auth from components to a feature folder"
```

---

## Task 9: Wire rate limiting and safe redirect into the actions

**Files:**
- Modify: `src/features/auth/actions.ts`
- Create: `src/features/auth/schema.ts`

- [ ] **Step 1: Extract the Zod schemas**

Create `src/features/auth/schema.ts` and move the existing schemas out of `actions.ts` into it, adding the reset schema:

```ts
import { z } from 'zod';

import { defaultLocale, locales } from '@/i18n/routing';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-constants';

export const localeSchema = z.enum(locales).catch(defaultLocale);

/**
 * Normalise as a plain string, THEN validate as an email.
 *
 * `z.email().trim()` does not work: in Zod 4 the format check is baked in at
 * construction, so it runs before the trim and rejects "  a@b.co " outright.
 */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  locale: localeSchema,
  redirectTo: z.string().optional(),
});

export const magicLinkSchema = z.object({
  email: emailSchema,
  locale: localeSchema,
});

export const signUpSchema = z
  .object({
    name: z.string().trim().min(2),
    email: emailSchema,
    password: z.string().min(MIN_PASSWORD_LENGTH),
    confirmPassword: z.string(),
    locale: localeSchema,
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: emailSchema,
  locale: localeSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(MIN_PASSWORD_LENGTH),
    confirmPassword: z.string(),
    locale: localeSchema,
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
  });
```

- [ ] **Step 2: Add the guard helper to `actions.ts`**

```ts
/**
 * Every action below re-checks the limit before acting and records a failure
 * after. A server action is a public endpoint: the page guard protects the
 * render, never the mutation.
 */
async function guard(kind: AttemptKind, email: string | null): Promise<AuthFormState | null> {
  const ipAddress = readClientIp(await headers());
  const result = await checkRateLimit(kind, { email, ipAddress });

  if (result.allowed) return null;

  return { status: 'rateLimited', messageKey: 'rateLimited', minutes: result.retryInMinutes };
}

async function penalise(kind: AttemptKind, email: string | null): Promise<void> {
  await recordAttempt(kind, { email, ipAddress: readClientIp(await headers()) });
}
```

- [ ] **Step 3: Rewrite `signInWithPassword`**

```ts
export async function signInWithPassword(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    locale: formData.get('locale'),
    redirectTo: formData.get('redirectTo'),
  });

  if (!parsed.success) {
    return { status: 'error', messageKey: 'genericError' };
  }

  const { email, password, locale, redirectTo } = parsed.data;

  const limited = await guard('sign_in', email);
  if (limited) return limited;

  try {
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch (error) {
    await penalise('sign_in', email);

    /**
     * The one case worth distinguishing. Better Auth refuses an unverified
     * account with FORBIDDEN; telling that person "wrong email or password"
     * would send them to the reset flow, which cannot help them. Everything
     * else stays deliberately vague so the response never reveals whether an
     * address is registered.
     */
    if (error instanceof APIError && error.status === 'FORBIDDEN') {
      return { status: 'error', messageKey: 'verifyEmailFirst' };
    }

    return { status: 'error', messageKey: 'genericError' };
  }

  await clearAttempts('sign_in', email);

  // Outside the try/catch — `redirect` signals by throwing.
  redirect(resolveSafeRedirect(redirectTo, locale, 'staff'));
}
```

- [ ] **Step 4: Rewrite `signUpStaff` to stop at "check your inbox"**

Replace the redirect at the end of `signUpStaff`, and add the limit check after parsing:

```ts
  const limited = await guard('sign_up', null);
  if (limited) return limited;

  // Housekeeping rides along with sign-up rather than a scheduler. It also frees
  // an address squatted by an unverified account, which would otherwise block
  // its real owner from signing in with Google.
  await purgeUnverifiedAccounts().catch((error: unknown) => {
    console.error('[auth] unverified-account purge failed', error);
  });
```

and, replacing the trailing `redirect(...)`:

```ts
  // No redirect and no session: `autoSignIn` is off and verification is
  // required. The form shows a "check your inbox" screen from this state.
  return { status: 'sent', messageKey: 'verificationSent' };
```

The `catch` block keeps its `emailTaken` branch, and gains `await penalise('sign_up', null);` before returning.

- [ ] **Step 5: Add the remaining actions**

```ts
export async function resendVerification(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get('email'),
    locale: formData.get('locale'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'genericError' };

  const { email, locale } = parsed.data;

  const limited = await guard('verification_resend', email);
  if (limited) return limited;

  await penalise('verification_resend', email);

  try {
    await auth.api.sendVerificationEmail({
      body: { email, callbackURL: `/${locale}/app` },
      headers: await headers(),
    });
  } catch (error) {
    // Swallowed: the response must not depend on whether the address exists.
    console.error('[auth] verification resend failed', error);
  }

  return { status: 'sent', messageKey: 'verificationSent' };
}

export async function requestPasswordReset(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get('email'),
    locale: formData.get('locale'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'genericError' };

  const { email, locale } = parsed.data;

  const limited = await guard('password_reset', email);
  if (limited) return limited;

  await penalise('password_reset', email);

  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: `/${locale}/reset-password` },
      headers: await headers(),
    });
  } catch (error) {
    // Swallowed on purpose — same reason as the magic link.
    console.error('[auth] password reset request failed', error);
  }

  // Always the same answer, whether or not the address is registered.
  return { status: 'sent', messageKey: 'resetLinkSent' };
}

export async function resetPassword(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    locale: formData.get('locale'),
  });

  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;
    if (fieldErrors.confirmPassword) return { status: 'error', messageKey: 'passwordMismatch' };
    if (fieldErrors.password) return { status: 'error', messageKey: 'passwordTooShort' };
    return { status: 'error', messageKey: 'genericError' };
  }

  const { token, password, locale } = parsed.data;

  try {
    await auth.api.resetPassword({ body: { token, newPassword: password }, headers: await headers() });
  } catch (error) {
    console.error('[auth] password reset failed', error);
    return { status: 'error', messageKey: 'genericError' };
  }

  redirect(`/${locale}/login`);
}

/**
 * Starts the Google flow. Kept as a server action rather than a client-side
 * `signIn.social` call so the entry point sits in the same layer as everything
 * else and can be rate limited.
 */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const locale = localeSchema.parse(formData.get('locale'));

  const { url } = await auth.api.signInSocial({
    body: { provider: 'google', callbackURL: `/${locale}/app` },
    headers: await headers(),
  });

  if (!url) throw new Error('Google sign-in did not return a consent URL');

  redirect(url);
}
```

Add the imports these need at the top of `actions.ts`:

```ts
import { resolveSafeRedirect } from './redirect';
import { purgeUnverifiedAccounts } from './cleanup';
import {
  checkRateLimit,
  clearAttempts,
  readClientIp,
  recordAttempt,
  type AttemptKind,
} from './rate-limit';
import { type AuthFormState } from './form-state';
import {
  credentialsSchema,
  forgotPasswordSchema,
  localeSchema,
  magicLinkSchema,
  resetPasswordSchema,
  signUpSchema,
} from './schema';
```

- [ ] **Step 6: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/auth
git commit -m "Rate limit the auth actions and honour the redirect parameter"
```

---

## Task 10: Sign-up, verification and login UI

**Files:**
- Modify: `src/features/auth/components/staff-signup-form.tsx`, `staff-login-form.tsx`, `form-parts.tsx`
- Create: `src/features/auth/components/google-button.tsx`, `passkey-button.tsx`
- Modify: `src/proxy.ts`

- [ ] **Step 1: Teach `form-parts.tsx` the new state variants**

`AuthFormMessage` currently renders `t(state.messageKey)`. The `rateLimited` variant carries a `minutes` value, so it needs its own branch:

```tsx
export function AuthFormMessage({ state }: { state: AuthFormState }) {
  const t = useTranslations('login');

  if (state.status === 'idle') return null;

  if (state.status === 'rateLimited') {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t('rateLimited', { minutes: state.minutes })}
      </p>
    );
  }

  const tone = state.status === 'error' ? 'text-destructive' : 'text-muted-foreground';

  return (
    <p role={state.status === 'error' ? 'alert' : 'status'} className={`text-sm ${tone}`}>
      {t(state.messageKey)}
    </p>
  );
}
```

- [ ] **Step 2: Create the Google button**

Create `src/features/auth/components/google-button.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { signInWithGoogle } from '@/features/auth/actions';
import { type Locale } from '@/i18n/routing';

/**
 * Staff pages only. Patients sign in with a single-use emailed link; offering
 * them Google here would invite them to try a door that is not theirs.
 */
export function GoogleButton({ locale }: { locale: Locale }) {
  const t = useTranslations('login');

  return (
    <form action={signInWithGoogle}>
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="outline" className="w-full">
        {t('continueWithGoogle')}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Create the passkey button**

Create `src/features/auth/components/passkey-button.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { type Locale } from '@/i18n/routing';

/**
 * The one auth path that is NOT a server action.
 *
 * WebAuthn needs `navigator.credentials`, which only exists in the browser, so
 * this calls Better Auth over HTTP at /api/auth/*. A side effect worth knowing:
 * this is therefore the only path Better Auth's own rate limiter covers, since
 * that limiter runs in the router and never sees a server action.
 */
export function PasskeyButton({ locale }: { locale: Locale }) {
  const t = useTranslations('login');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    setError(null);

    const result = await authClient.signIn.passkey();

    setPending(false);

    if (result?.error) {
      // Includes the ordinary "user dismissed the browser prompt" case, so this
      // stays a quiet inline message rather than anything alarming.
      setError(t('passkeyFailed'));
      return;
    }

    router.push(`/${locale}/app`);
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" className="w-full" disabled={pending} onClick={signIn}>
        {t('continueWithPasskey')}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Put both above the password form**

In `staff-login-form.tsx`, inside `<CardContent>` before the existing `<form>`:

```tsx
        {/* Passkey first: it is the fastest and the safest, and order drives adoption. */}
        <div className="space-y-3">
          <PasskeyButton locale={locale} />
          <GoogleButton locale={locale} />
        </div>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          {t('orUsePassword')}
          <span className="h-px flex-1 bg-border" />
        </div>
```

Also add a hidden field carrying the redirect parameter into the form, and a link to `/forgot-password`:

```tsx
          <input type="hidden" name="redirectTo" value={redirectTo ?? ''} />
```

`redirectTo` comes in as a prop from the login route, which reads it from `searchParams`.

- [ ] **Step 5: Show "check your inbox" after sign-up**

In `staff-signup-form.tsx`, before rendering the form:

```tsx
  if (state.status === 'sent') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('checkInboxHeading')}</CardTitle>
          <CardDescription>{t('checkInboxDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>{t('checkInboxSpam')}</p>
          {/*
            A mistyped address cannot be corrected from here: there is no session
            and the mail went elsewhere. Signing up again is the only way out, so
            say so plainly rather than leaving a dead end.
          */}
          <p>
            {t('checkInboxWrongAddress')}{' '}
            <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
              {t('signUpLink')}
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }
```

- [ ] **Step 6: Let anonymous visitors reach the new pages**

`src/proxy.ts` only guards `app` and `portal`, so `/forgot-password` and `/reset-password` are already public. Confirm by reading `PROTECTED_AREAS` — no change should be needed. If a change is needed, do not add these paths to `PROTECTED_AREAS`.

- [ ] **Step 7: Lint and typecheck**

Run: `bun run typecheck && bun run lint`
Expected: PASS both. Watch for the RTL rule on any new class strings.

- [ ] **Step 8: Commit**

```bash
git add src/features/auth src/app
git commit -m "Add passkey and Google buttons, and the check-your-inbox screen"
```

---

## Task 11: Forgot and reset password pages

**Files:**
- Create: `src/app/[locale]/forgot-password/page.tsx`, `src/app/[locale]/reset-password/page.tsx`
- Create: `src/features/auth/components/forgot-password-form.tsx`, `reset-password-form.tsx`

- [ ] **Step 1: Create the forgot-password form**

Create `src/features/auth/components/forgot-password-form.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { AuthFormMessage, AuthSubmitButton } from '@/features/auth/components/form-parts';
import { requestPasswordReset } from '@/features/auth/actions';
import { initialAuthState } from '@/features/auth/form-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type Locale } from '@/i18n/routing';

export function ForgotPasswordForm({ locale }: { locale: Locale }) {
  const t = useTranslations('login');
  const tCommon = useTranslations('common');
  const [state, formAction] = useActionState(requestPasswordReset, initialAuthState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('forgotHeading')}</CardTitle>
        <CardDescription>{t('forgotDescription')}</CardDescription>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />

          <div className="space-y-2">
            <Label htmlFor="forgot-email">{tCommon('email')}</Label>
            <Input id="forgot-email" name="email" type="email" autoComplete="email" dir="ltr" required />
          </div>

          <AuthFormMessage state={state} />

          <AuthSubmitButton label={t('forgotSubmit')} />
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create the reset-password form**

Create `src/features/auth/components/reset-password-form.tsx`. Same shape, using `resetPassword`, two `PasswordInput`s (`password` and `confirmPassword`, both `autoComplete="new-password"`), and a hidden `token` field whose value is passed in as a prop.

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { AuthFormMessage, AuthSubmitButton } from '@/features/auth/components/form-parts';
import { PasswordInput } from '@/features/auth/components/password-input';
import { resetPassword } from '@/features/auth/actions';
import { initialAuthState } from '@/features/auth/form-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-constants';
import { type Locale } from '@/i18n/routing';

export function ResetPasswordForm({ locale, token }: { locale: Locale; token: string }) {
  const t = useTranslations('login');
  const tCommon = useTranslations('common');
  const [state, formAction] = useActionState(resetPassword, initialAuthState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('resetHeading')}</CardTitle>
        <CardDescription>{t('resetDescription')}</CardDescription>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="token" value={token} />

          <PasswordInput
            name="password"
            label={tCommon('password')}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            hint={t('passwordHint', { count: MIN_PASSWORD_LENGTH })}
          />

          <PasswordInput
            name="confirmPassword"
            label={t('confirmPassword')}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
          />

          <AuthFormMessage state={state} />

          <AuthSubmitButton label={t('resetSubmit')} />
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create both routes**

Create `src/app/[locale]/forgot-password/page.tsx`, mirroring the structure of the existing `src/app/[locale]/login/page.tsx` exactly — resolve the locale, set metadata from the `login` namespace, render the form centred. Do the same for `reset-password/page.tsx`, which additionally reads `searchParams` for `token`:

```tsx
export default async function ResetPasswordPage({ params, searchParams }: ResetPasswordPageProps) {
  const locale = await resolveLocale(params);
  const { token } = await searchParams;

  // A reset link with no token is a link someone edited or a mail client mangled.
  if (typeof token !== 'string' || token === '') {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <ResetPasswordForm locale={locale} token={token} />
    </main>
  );
}
```

- [ ] **Step 4: Link to the reset flow from the login form**

Under the password field in `staff-login-form.tsx`:

```tsx
          <p className="text-sm">
            <Link href="/forgot-password" className="text-muted-foreground underline-offset-4 hover:underline">
              {t('forgotLink')}
            </Link>
          </p>
```

- [ ] **Step 5: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: PASS both.

- [ ] **Step 6: Commit**

```bash
git add src/app src/features/auth
git commit -m "Add forgot-password and reset-password pages"
```

---

## Task 12: Settings → Security

**Files:**
- Create: `src/app/[locale]/app/settings/security/page.tsx`
- Create: `src/features/auth/components/security-settings.tsx`
- Modify: `src/features/auth/actions.ts`, `src/app/[locale]/app/layout.tsx`

- [ ] **Step 1: Add the sign-in-method query and actions**

Add to `src/features/auth/actions.ts`:

```ts
/**
 * Removing a passkey is refused when it is the only way into the account.
 *
 * Without this the page offers a two-click path to permanent lockout: a
 * passkey-only account whose passkey is deleted has no password, no linked
 * provider, and — with no email flow able to prove ownership of an account that
 * cannot be signed into — no way back.
 */
export async function removePasskeyAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const locale = localeSchema.parse(formData.get('locale'));
  const session = await requireStaffSession(locale);

  const id = z.string().min(1).parse(formData.get('passkeyId'));

  const [passkeys, accounts] = await Promise.all([
    auth.api.listPasskeys({ headers: await headers() }),
    auth.api.listUserAccounts({ headers: await headers() }),
  ]);

  const otherMethods = accounts.length + passkeys.length - 1;

  if (otherMethods < 1) {
    return { status: 'error', messageKey: 'lastSignInMethod' };
  }

  await auth.api.deletePasskey({ body: { id }, headers: await headers() });

  revalidatePath(`/${locale}/app/settings/security`);

  return { status: 'success', messageKey: 'passkeyRemoved' };
}
```

`session` is unused beyond the guard; name it `_session` or drop the binding to satisfy the lint rule.

- [ ] **Step 2: Build the page**

`src/app/[locale]/app/settings/security/page.tsx` resolves the locale, calls `requireStaffSession`, fetches `listPasskeys` and `listUserAccounts`, and renders `SecuritySettings` with both. Follow the shape of `src/app/[locale]/app/clients/page.tsx`.

- [ ] **Step 3: Build the component**

`src/features/auth/components/security-settings.tsx` renders three cards: registered passkeys (each with a remove button, disabled when it is the last method, showing `lastSignInMethod` as the reason), an "add a passkey" button calling `authClient.passkey.addPasskey()`, and whether Google is connected.

- [ ] **Step 4: Add it to the sidebar**

In `src/app/[locale]/app/layout.tsx`, add to `NAV_ITEMS`:

```ts
  { href: '/app/settings/security', labelKey: 'security' },
```

and extend the `NavItem` union in `src/components/layout/sidebar.tsx` to include both the new `href` and the new `labelKey`.

- [ ] **Step 5: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: PASS both.

- [ ] **Step 6: Commit**

```bash
git add src/app src/features/auth src/components/layout
git commit -m "Add a security settings page for passkeys and sign-in methods"
```

---

## Task 13: Messages

**Files:**
- Modify: `src/i18n/messages/ar.json`, then `src/i18n/messages/en.json`

- [ ] **Step 1: Add every new key to `ar.json` first**

`ar.json` types the catalogue, so it must lead. Add to the `login` namespace:

```json
    "continueWithGoogle": "المتابعة باستخدام Google",
    "continueWithPasskey": "المتابعة باستخدام مفتاح المرور",
    "passkeyFailed": "تعذّر الدخول بمفتاح المرور. جرّب طريقة أخرى.",
    "orUsePassword": "أو",
    "forgotLink": "نسيت كلمة المرور؟",
    "forgotHeading": "إعادة تعيين كلمة المرور",
    "forgotDescription": "أدخل بريدك الإلكتروني وسنرسل لك رابطاً لتعيين كلمة مرور جديدة.",
    "forgotSubmit": "أرسل الرابط",
    "resetHeading": "كلمة مرور جديدة",
    "resetDescription": "اختر كلمة مرور جديدة. سيتم إنهاء جلساتك الأخرى.",
    "resetSubmit": "حفظ كلمة المرور",
    "resetLinkSent": "إذا كان هذا البريد مسجّلاً لدينا، فقد أرسلنا إليه رابطاً.",
    "verificationSent": "أرسلنا رسالة تأكيد إلى بريدك الإلكتروني.",
    "verifyEmailFirst": "يرجى تأكيد بريدك الإلكتروني قبل الدخول.",
    "accountNotLinked": "يوجد حساب غير مؤكَّد بهذا البريد الإلكتروني.",
    "rateLimited": "محاولات كثيرة. حاول مرة أخرى بعد {minutes} دقيقة.",
    "checkInboxHeading": "تحقّق من بريدك",
    "checkInboxDescription": "أرسلنا رابط تأكيد إلى بريدك الإلكتروني.",
    "checkInboxSpam": "إن لم تجد الرسالة، تحقّق من مجلد البريد غير المرغوب فيه.",
    "checkInboxWrongAddress": "أدخلت بريداً خاطئاً؟",
    "passwordChanged": "تم تغيير كلمة المرور.",
    "lastSignInMethod": "لا يمكن حذف طريقة الدخول الوحيدة لحسابك.",
    "passkeyRegistered": "تمت إضافة مفتاح المرور.",
    "passkeyRemoved": "تم حذف مفتاح المرور."
```

Add `"security": "الأمان"` to the `nav` namespace.

- [ ] **Step 2: Add the matching keys to `en.json`**

```json
    "continueWithGoogle": "Continue with Google",
    "continueWithPasskey": "Continue with a passkey",
    "passkeyFailed": "That passkey did not work. Try another method.",
    "orUsePassword": "or",
    "forgotLink": "Forgot your password?",
    "forgotHeading": "Reset your password",
    "forgotDescription": "Enter your email address and we will send you a link to set a new password.",
    "forgotSubmit": "Send the link",
    "resetHeading": "New password",
    "resetDescription": "Choose a new password. Your other sessions will be signed out.",
    "resetSubmit": "Save password",
    "resetLinkSent": "If that address has an account, we have sent it a link.",
    "verificationSent": "We have sent a confirmation message to your email address.",
    "verifyEmailFirst": "Please confirm your email address before signing in.",
    "accountNotLinked": "An unverified account already exists for this email address.",
    "rateLimited": "Too many attempts. Try again in {minutes} minutes.",
    "checkInboxHeading": "Check your inbox",
    "checkInboxDescription": "We have sent a confirmation link to your email address.",
    "checkInboxSpam": "If it has not arrived, check your spam folder.",
    "checkInboxWrongAddress": "Entered the wrong address?",
    "passwordChanged": "Your password has been changed.",
    "lastSignInMethod": "You cannot remove your only way to sign in.",
    "passkeyRegistered": "Passkey added.",
    "passkeyRemoved": "Passkey removed."
```

Add `"security": "Security"` to `nav`.

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS. A key present in only one file is a type error — that is the check working.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages
git commit -m "Add Arabic and English messages for the new auth flows"
```

---

## Task 14: Seed and documentation

**Files:**
- Modify: `scripts/seed.ts`, `README.md`, `src/features/README.md`

- [ ] **Step 1: Confirm the seeded staff account is verified**

`scripts/seed.ts` already sets `emailVerified: true`. With `requireEmailVerification: true` this is now load-bearing rather than cosmetic — add a comment saying so:

```ts
      // Load-bearing: `requireEmailVerification` is on, so an unverified seed
      // account could not sign in at all.
      emailVerified: true,
```

- [ ] **Step 2: Rewrite the auth section of `README.md`**

Delete the "⚠️ Staff sign-up is currently open to anyone" warning — it is no longer true. Replace the auth section with the three sign-in methods, the verification gate, the mailer and its two transports, the rate limits table, and the note that Better Auth's own limiter does not cover server actions.

- [ ] **Step 3: Correct the two stale claims**

`README.md` still says "There are no features yet" and "the only tables that exist are the four Better Auth requires". Both were false before this branch. Update them to describe the clients feature and the current table list.

`src/features/README.md` says the directory is intentionally empty. Correct it.

- [ ] **Step 4: Commit**

```bash
git add README.md src/features/README.md scripts/seed.ts
git commit -m "Update the docs to match the auth the app now has"
```

---

## Task 15: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `bun test`
Expected: PASS, with no skipped suites.

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: no errors. Any `pl-*`/`ml-*`/`text-left` in new markup fails here.

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Production build**

Run: `bun run build`
Expected: PASS. This is the step that catches a client component importing a server-only module.

- [ ] **Step 5: Manual pass**

Reset and reseed, then walk the flows:

```bash
bun run db:reset && bun run db:seed
```

- Sign up with a new address → no session, "check your inbox" appears, the verification URL is printed to the server console
- Follow that URL → signed in, landing on `/ar/app`
- Sign out, try to sign in before verifying with a second new account → "please confirm your email address"
- Six wrong passwords in a row → "too many attempts, try again in N minutes"
- `/ar/forgot-password` with the seeded address → link printed to the console; follow it, set a new password, confirm the old one no longer works
- Register a passkey from Settings → Security, sign out, sign in with it
- Try to remove that passkey on an account with no password → refused
- Visit `/ar/app/clients` while signed out → bounced to login with `?redirect=`, and after signing in you land on `/ar/app/clients`
- Try `/ar/login?redirect=https://example.com` → after signing in you land on `/ar/app`, not the external site
- Repeat the sign-up flow in English and confirm the mail renders LTR

- [ ] **Step 6: Commit anything outstanding**

```bash
git status
```

Expected: clean.

---

## Notes for the implementer

**The two rules that must not be relaxed.** Never set `requireLocalEmailVerified: false`, and never rely on Better Auth's `rateLimit` option to protect a server action. Both are explained in comments at the point of use; if you find yourself deleting one of those comments, stop.

**Sign-in errors stay vague on purpose.** `verifyEmailFirst` is the single deliberate exception, because that person is already known to hold the address — they just gave it to a form that told them to check it. Every other failure returns `genericError`.

**Attempts are recorded for addresses that do not exist.** This looks wasteful and is not: skipping them would make a lockout response prove an account exists.

**Google's callback error is not a crash.** `"account not linked"` means an unverified local account is squatting the address. Surface `accountNotLinked`, not a 500.
