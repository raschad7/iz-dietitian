import { boolean, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

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
