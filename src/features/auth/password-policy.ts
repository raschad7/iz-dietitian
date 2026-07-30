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
