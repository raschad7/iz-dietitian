/**
 * Auth values that both the server config and client components need.
 * Kept in their own module so a client component never has to import
 * `src/lib/auth.ts` (which pulls in the database client).
 */

const MINUTE_IN_SECONDS = 60;
const DAY_IN_SECONDS = 24 * 60 * MINUTE_IN_SECONDS;

/**
 * Minimum staff password length.
 *
 * ⚠ **Nothing reads this any more.** Staff took the client rule — eight
 * characters with a letter and a digit — so `staffPasswordSchema` is now an
 * alias of the client one and `CLIENT_MIN_PASSWORD_LENGTH` is the only minimum
 * in the product. See the note on that schema for why, and for what restoring
 * the ten-character staff floor would involve.
 *
 * Kept rather than deleted because it is the number to put back.
 */
export const MIN_PASSWORD_LENGTH = 10;

/** The long-lived session a username or password sign-in is exchanged for. */
export const SESSION_TTL_SECONDS = 60 * DAY_IN_SECONDS;
export const SESSION_REFRESH_AGE_SECONDS = DAY_IN_SECONDS;

/**
 * How long a signed copy of the session may be trusted from the cookie alone,
 * without reading the database. See `session.cookieCache` in `auth.ts`.
 *
 * A minute, and the number is a balance between two costs. Every navigation in
 * either app reads the session — it is the first thing every guard does — and
 * each read is a round trip to Postgres that the page then waits on. Against
 * that: a session revoked, a role changed or a clinic reassigned is not visible
 * until the copy expires, because nothing has gone back to the row to notice.
 *
 * Sixty seconds keeps that window shorter than a coffee break while still
 * covering the burst of navigations a working minute actually produces. It is
 * deliberately not measured in the same units as the values above; those are
 * how long a session *lives*, this is how stale a reading of it may be.
 */
export const SESSION_COOKIE_CACHE_SECONDS = MINUTE_IN_SECONDS;

const HOUR_IN_SECONDS = 60 * MINUTE_IN_SECONDS;

/** How long a "verify your email" link stays valid. */
export const EMAIL_VERIFICATION_TTL_SECONDS = HOUR_IN_SECONDS;

/** How long a password-reset link stays valid. Shorter than a session by design: it is the more dangerous token. */
export const PASSWORD_RESET_TTL_SECONDS = HOUR_IN_SECONDS;

/**
 * An account that never verified its address is deleted after this long.
 *
 * Deliberately short. Better Auth refuses to link a Google identity into an
 * unverified local account, so an address squatted by an unverified sign-up
 * blocks its real owner from signing in with Google until this expires. An
 * unverified account has nothing to lose — under the hard verification gate it
 * cannot sign in at all.
 */
export const UNVERIFIED_ACCOUNT_TTL_SECONDS = 24 * HOUR_IN_SECONDS;
