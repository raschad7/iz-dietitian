/**
 * Auth values that both the server config and client components need.
 * Kept in their own module so a client component never has to import
 * `src/lib/auth.ts` (which pulls in the database client).
 */

const MINUTE_IN_SECONDS = 60;
const DAY_IN_SECONDS = 24 * 60 * MINUTE_IN_SECONDS;

/** Client magic links are single use and short lived. */
export const MAGIC_LINK_TTL_MINUTES = 15;
export const MAGIC_LINK_TTL_SECONDS = MAGIC_LINK_TTL_MINUTES * MINUTE_IN_SECONDS;

/**
 * Minimum staff password length. Shared so the sign-up form, its server-side
 * validation and the Better Auth config cannot drift apart — a form that
 * accepts a password the server then rejects is a maddening bug to report.
 */
export const MIN_PASSWORD_LENGTH = 10;

/** The long-lived session a magic link (or a password sign-in) is exchanged for. */
export const SESSION_TTL_SECONDS = 60 * DAY_IN_SECONDS;
export const SESSION_REFRESH_AGE_SECONDS = DAY_IN_SECONDS;
