/**
 * Reading PostgreSQL error codes back out of a failed Drizzle query.
 *
 * Drizzle 0.45 wraps every driver error in a `DrizzleQueryError` and hangs the
 * original postgres.js `PostgresError` off `.cause`. So the SQLSTATE is **not**
 * on the error it throws — `error.code` is `undefined`, and a `'code' in error`
 * check silently never matches. It has to be read one level down.
 *
 * Codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */

/** Duplicate key — a unique index rejected the write. */
export const UNIQUE_VIOLATION = '23505';

/** An EXCLUDE constraint rejected the write. */
export const EXCLUSION_VIOLATION = '23P01';

/** A CHECK constraint rejected the write. */
export const CHECK_VIOLATION = '23514';

/** A foreign key pointed at a row that does not exist. */
export const FOREIGN_KEY_VIOLATION = '23503';

type PostgresErrorLike = { code?: unknown; constraint_name?: unknown };

function driverError(error: unknown): PostgresErrorLike | null {
  if (typeof error !== 'object' || error === null) return null;

  // The driver error itself, when something calls postgres.js directly.
  if ('code' in error && typeof (error as PostgresErrorLike).code === 'string') {
    return error as PostgresErrorLike;
  }

  // The usual case: DrizzleQueryError wrapping a PostgresError.
  const cause = (error as { cause?: unknown }).cause;
  if (typeof cause === 'object' && cause !== null && 'code' in cause) {
    return cause as PostgresErrorLike;
  }

  return null;
}

/** The SQLSTATE of a failed query, or null if this was not a database error. */
export function pgErrorCode(error: unknown): string | null {
  const code = driverError(error)?.code;
  return typeof code === 'string' ? code : null;
}

/** The name of the constraint that rejected the write, when the driver reports one. */
export function pgConstraintName(error: unknown): string | null {
  const name = driverError(error)?.constraint_name;
  return typeof name === 'string' ? name : null;
}

export function isUniqueViolation(error: unknown): boolean {
  return pgErrorCode(error) === UNIQUE_VIOLATION;
}

export function isExclusionViolation(error: unknown): boolean {
  return pgErrorCode(error) === EXCLUSION_VIOLATION;
}

/**
 * Either of the two constraints that back a booking rule.
 *
 * Both mean the same thing to the user — someone else took this slot while you
 * were deciding — so the actions treat them as one ordinary rejection rather
 * than an exception.
 */
export function isBookingConflict(error: unknown): boolean {
  const code = pgErrorCode(error);
  return code === UNIQUE_VIOLATION || code === EXCLUSION_VIOLATION;
}
