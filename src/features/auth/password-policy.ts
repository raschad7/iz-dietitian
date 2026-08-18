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

/**
 * Whether a staff password is more than merely long enough.
 *
 * Length alone is satisfied by `aaaaaaaaaa` and by `dietitian1`, and a staff
 * account reads every client's medical notes — so the staff minimum asks for
 * two of the three character classes on top of its ten characters, and refuses
 * the handful of values people actually type when asked to invent one.
 *
 * Deliberately not a scoring library. A rule a person can restate in one
 * sentence is a rule they can satisfy on the first try; a score they cannot see
 * the inside of just makes them add "1!" to the end.
 */
export function isStrongStaffPassword(value: string): boolean {
  return isStrongPassword(value);
}

/**
 * Whether a client password is more than merely long enough.
 *
 * The same rule as staff, applied at the client's shorter minimum: six
 * characters of one class is "aaaaaa", and the forced first-sign-in change is
 * the one moment we get to ask for better — the temporary password it replaces
 * was ten random characters from a 57-glyph alphabet, so accepting anything
 * weaker than a mix would leave the account worse off than the day it was
 * issued.
 *
 * Length and strength stay separate checks because the two failures need
 * different advice — one says "longer", the other says "mix in a digit or a
 * symbol" — and the caller reports whichever one the value tripped.
 */
export function isStrongClientPassword(value: string): boolean {
  return isStrongPassword(value);
}

/**
 * The shared body of both.
 *
 * Two of the three character classes, and never one of the values people
 * actually type when asked to invent one. Staff and clients differ in how long
 * the password has to be, not in what counts as a mix.
 */
function isStrongPassword(value: string): boolean {
  if (isCommonPassword(value)) return false;

  const classes = [/[a-z]/i, /[0-9]/, /[^a-z0-9]/i].filter((pattern) => pattern.test(value));
  return classes.length >= 2;
}
