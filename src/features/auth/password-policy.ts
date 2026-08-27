/**
 * Password rules that differ between staff and clients.
 *
 * Better Auth exposes a single global `minPasswordLength`, so it cannot express
 * two minimums. The global floor is the CLIENT minimum (8); the staff minimum
 * (10) is enforced in the staff Zod schema. The asymmetry matches the exposure:
 * a client sees one record, a staff account sees every client's medical notes.
 */

export const CLIENT_MIN_PASSWORD_LENGTH = 8;

/**
 * Guessed on the first attempt, whatever the length rule says. Throttling
 * defeats a brute-force search, but it does nothing about `12345678`, which is
 * the first thing tried. Short list on purpose — it targets the handful of
 * values a person actually types when asked to invent a password.
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
 * ⚠ **No schema calls this any more.** Staff took the client rule — see the
 * note on `staffPasswordSchema` — so `isStrongClientPassword` is what a staff
 * password is judged by now. Kept, with its tests, because it is the rule to
 * put back if the staff floor is ever restored.
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
  if (isCommonPassword(value)) return false;

  const classes = [/[a-z]/i, /[0-9]/, /[^a-z0-9]/i].filter((pattern) => pattern.test(value));
  return classes.length >= 2;
}

/**
 * The rules a client's password is judged by, each answered separately.
 *
 * Separately, because the set-password screen shows them as a live checklist —
 * eight characters, a letter, a number — and a checklist has to know which line
 * to tick, not merely whether the whole value passed. The server reads the same
 * function through {@link isStrongClientPassword}, so the list a client ticks
 * off is literally the rule their password is measured against rather than a
 * description of it that can quietly fall out of date.
 *
 * ⚠ The rule is **at least one letter AND at least one digit**, which is
 * narrower than the staff rule's "two of three classes" — a symbol is welcome,
 * `tuffah-2024` passes, but it cannot stand in for either of the two. Staff
 * keep the looser rule because their minimum is ten characters rather than
 * eight, which is where `dietitian!!` earns its place.
 */
export type ClientPasswordChecks = {
  /** At least {@link CLIENT_MIN_PASSWORD_LENGTH} characters. */
  length: boolean;
  /** At least one letter, in any script and either case. */
  letter: boolean;
  /** At least one digit. */
  digit: boolean;
};

/*
  \p{L} rather than [a-zA-Z], because the portal is Arabic first.

  A client who typed "تفاح2024" has plainly satisfied "use a letter", and an
  ASCII-only class would have told them otherwise: an Arabic sentence rejecting
  an Arabic password for containing no letters. \p{Nd} is the matching choice on
  the other side — it accepts the Arabic-Indic numerals ٠-٩ an Arabic keyboard
  produces, which look like digits, are digits, and fail a [0-9] test.
*/
const LETTER = /\p{L}/u;
const DIGIT = /\p{Nd}/u;

export function clientPasswordChecks(value: string): ClientPasswordChecks {
  return {
    length: value.length >= CLIENT_MIN_PASSWORD_LENGTH,
    letter: LETTER.test(value),
    digit: DIGIT.test(value),
  };
}

/**
 * Whether a client password is more than merely long enough.
 *
 * The forced first-sign-in change is the one moment we get to ask for better,
 * and the temporary password it replaces was ten random characters from a
 * 57-glyph alphabet — so accepting anything weaker than a letter-and-number mix
 * would leave the account worse off than the day it was issued.
 *
 * Length is deliberately not part of this answer. The two failures need
 * different advice — one says "longer", the other says "add a number" — so the
 * schema checks length itself and the caller reports whichever rule was
 * tripped.
 */
export function isStrongClientPassword(value: string): boolean {
  if (isCommonPassword(value)) return false;

  const checks = clientPasswordChecks(value);
  return checks.letter && checks.digit;
}
