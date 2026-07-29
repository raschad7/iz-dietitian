import { and, asc, eq, gte, lt } from 'drizzle-orm';

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
