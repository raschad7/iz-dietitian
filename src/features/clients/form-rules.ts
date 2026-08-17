/**
 * The client card's limits, and the message keys its schema reports.
 *
 * This module deliberately imports nothing — the same rule, and the same
 * reason, as `./types.ts`. Both the schema (server) and the fields (browser)
 * need these, and putting them in `./schema.ts` would mean every component that
 * wants a `maxLength` pulls Zod into the client bundle to read a number.
 */

/**
 * How many characters each half of a client's name may carry.
 *
 * ⚠ Ten is tight for this clinic's roster: `عبد الرحمن` is ten on its own. It is
 * the number the clinic asked for, and it is enforced in both halves — see
 * `./name.ts` for what happens to a stored name that predates the cap.
 */
export const MAX_NAME_PART_LENGTH = 10;

/**
 * How many digits the phone number may carry, **not counting the calling
 * code** — the country is its own control, and its digits are not something
 * anyone types.
 *
 * Ten is the length of the numbers this clinic dials written the way they are
 * said out loud, with the national trunk zero: `0599123456`. `joinPhone` drops
 * that zero on the way to storage, so a full ten digits in the field lands as
 * nine in the column and the bound accommodates both spellings.
 */
export const MAX_PHONE_DIGITS = 10;

/**
 * The ages this clinic registers, both ends inclusive.
 *
 * A bound on the date of birth stated as the thing anyone actually reasons
 * about. It catches the two mistakes a date field really produces — a year
 * typed as today's, and a century slipped on the way in — which a
 * format check alone lets straight through.
 *
 * ⚠ These are **paediatric and geriatric limits, not data hygiene**: a client
 * of nine is refused registration, not merely queried. Widen them here if the
 * clinic starts seeing children.
 */
export const MIN_AGE = 10;
export const MAX_AGE = 100;

/**
 * The intake's two measurement bounds.
 *
 * Stated once because three places need them and they must agree: the schema
 * that rejects, the number field's own `min`/`max`, and the message that tells
 * the reader what the range is — which interpolates these rather than restating
 * the digits, so a change here cannot leave a stale sentence behind in either
 * catalogue.
 *
 * 300 cm is deliberately generous — three metres, well past the tallest person
 * who has lived. These bounds are there to catch a slipped decimal or a weight
 * typed into the height box, not to adjudicate what a plausible body is. 200 kg
 * is the ceiling the clinic asked for.
 */
export const HEIGHT_CM_RANGE = { min: 30, max: 300 } as const;
export const WEIGHT_KG_RANGE = { min: 20, max: 200 } as const;

/**
 * How many digits either measurement box accepts.
 *
 * Three, because both ceilings above are three-digit numbers — so a fourth digit
 * can only ever be a value the schema would reject anyway, and refusing it at
 * the keystroke is a better answer than accepting it and complaining afterwards.
 *
 * ⚠ Raise this alongside the ranges. A four-digit ceiling with a three-digit box
 * would be a bound nobody could reach.
 */
export const MEASUREMENT_MAX_DIGITS = 3;

/**
 * The values the validation messages interpolate.
 *
 * Passed on every lookup rather than per key. ICU ignores values a message does
 * not use, so one object covers the whole catalogue and no call site has to know
 * which messages carry a placeholder.
 */
export const VALIDATION_VALUES = {
  heightMin: HEIGHT_CM_RANGE.min,
  heightMax: HEIGHT_CM_RANGE.max,
  weightMin: WEIGHT_KG_RANGE.min,
  weightMax: WEIGHT_KG_RANGE.max,
  nameMax: MAX_NAME_PART_LENGTH,
  phoneMax: MAX_PHONE_DIGITS,
  minAge: MIN_AGE,
  maxAge: MAX_AGE,
} as const;

/**
 * Every message `clientFormSchema` can report.
 *
 * The schema reports **keys**, not sentences: this app is read in Arabic and
 * Zod's own defaults are English prose, so a required field would have
 * announced itself in the wrong language on the clinic's own screen. The keys
 * resolve under `clients.validation.*` — the same key-not-prose split
 * `clinic-profile/actions.ts` uses for its field dialogs.
 *
 * The runtime list exists because `useTranslations` throws on a key it cannot
 * find. A field error is checked against it before being looked up, so a schema
 * change that adds a message shows nothing rather than taking the card down.
 */
export const VALIDATION_KEYS = [
  'required',
  'firstNameTooLong',
  'lastNameTooLong',
  'phoneDigitsOnly',
  'phoneTooLong',
  'invalidDate',
  'ageTooYoung',
  'ageTooOld',
  'invalidEmail',
  // The intake's four required measurements — see `intakeSchema`.
  'heightOutOfRange',
  'weightOutOfRange',
] as const;

export type ValidationKey = (typeof VALIDATION_KEYS)[number];

export function isValidationKey(value: string): value is ValidationKey {
  return (VALIDATION_KEYS as readonly string[]).includes(value);
}
