import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { clinics } from './clinics';

/**
 * Better Auth's required tables — the ONLY tables in this repository.
 *
 * These are owned by Better Auth: the column set is dictated by the library, so
 * they are the one deliberate exception to the domain conventions documented in
 * the README (Better Auth generates the text primary keys itself rather than
 * relying on `gen_random_uuid()`).
 *
 * Do not add domain tables to this file. Each feature gets its own module under
 * `src/db/schema/` re-exported from `./index.ts`.
 */

export const user = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),

  /**
   * `staff` reaches `/[locale]/app/**`, `client` reaches `/[locale]/portal/**`.
   * Kept as text (not a pg enum) so roles can be extended without a migration
   * dance while the product is still taking shape.
   */
  role: text('role').notNull().default('staff'),

  /** Preferred UI locale, used to pick a locale when a session is created. */
  locale: text('locale').notNull().default('ar'),

  /**
   * The clinic this account belongs to — the tenant boundary.
   *
   * Set for `staff` when the account is created (see the `user.create.before`
   * hook in `src/lib/auth.ts`). Null for `client` accounts: a client reaches the
   * portal, which shows only their own records, so it needs no clinic scope of
   * its own — the `clients` row already carries one.
   */
  clinicId: uuid('clinic_id').references(() => clinics.id, { onDelete: 'set null' }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),

    /** Locale this session was established in; see `src/lib/auth.ts`. */
    locale: text('locale').notNull().default('ar'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('sessions_token_idx').on(table.token)],
);

export const account = pgTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  /** Hashed by Better Auth (scrypt); never written to directly. */
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Backing store for magic-link tokens (and email verification). Rows are
 * consumed on first use, which is what makes the client magic links single-use.
 */
export const verification = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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
