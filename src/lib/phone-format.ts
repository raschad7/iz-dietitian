import { COUNTRIES, DEFAULT_COUNTRY, type CountryCode } from './phone-countries';

/**
 * Splitting a stored phone number into a calling code and the rest, and putting
 * it back together.
 *
 * Pure: no React, no database. The phone field calls it on every render to fill
 * itself in, and `phone-format.test.ts` calls it directly.
 *
 * `clients.phone` stays free text — see that column's comment. This does not
 * change what the column may hold; it only decides what the *form* writes into
 * it, and what the form shows for a value written by something else. Anything
 * unparseable is handed back untouched rather than guessed at, because the
 * alternative is silently rewriting a patient's number.
 */

/** The dial codes, longest first, so `+1868` is not read as `+1`. */
const DIAL_CODES: readonly string[] = [...new Set(Object.values(COUNTRIES).map((country) => country.dial))].sort(
  (a, b) => b.length - a.length,
);

const DEFAULT_DIAL = COUNTRIES[DEFAULT_COUNTRY].dial;

export type SplitPhone = {
  /** An E.164 calling code without the `+`, always one this app knows about. */
  dial: string;
  /** Everything after it, digits only. Empty when there is no number yet. */
  national: string;
};

/**
 * Reads a stored number into the two halves the form edits.
 *
 * The three shapes that actually occur in a roster, in the order they are
 * tested — the same order and the same assumptions as `normalizePhone` in
 * `src/features/whatsapp/phone.ts`, because a number this form writes and a
 * number that module dials have to mean the same thing:
 *
 *  1. `+970599…` or `00970599…` — the writer supplied a calling code. Match the
 *     longest known one and split there.
 *  2. `0599…` — a national trunk zero and no code. The zero is a domestic
 *     prefix, not part of the number, so it is dropped and the clinic's own
 *     country is assumed.
 *  3. `599…` — neither. Assume the clinic's country and keep the digits.
 *
 * A number carrying a `+` whose code this app does not know is left whole in
 * `national` against the default code, so nothing is lost: the field shows the
 * digits, and the dietitian can correct it.
 */
export function splitPhone(stored: string | null | undefined): SplitPhone {
  const trimmed = stored?.trim();
  if (!trimmed) return { dial: DEFAULT_DIAL, national: '' };

  // The marker is read before punctuation is stripped: `+9705…` and `09705…`
  // are different numbers, and a bare digit filter loses the difference.
  const international = trimmed.startsWith('+') || trimmed.replace(/\D/g, '').startsWith('00');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return { dial: DEFAULT_DIAL, national: '' };

  if (international) {
    const withoutPrefix = digits.startsWith('00') ? digits.slice(2) : digits;
    const dial = DIAL_CODES.find((code) => withoutPrefix.startsWith(code));

    if (dial) return { dial, national: withoutPrefix.slice(dial.length) };

    return { dial: DEFAULT_DIAL, national: withoutPrefix };
  }

  if (digits.startsWith('0')) return { dial: DEFAULT_DIAL, national: digits.replace(/^0+/, '') };

  // Already a full international number pasted without its `+`, e.g. from a
  // contact card. Split it rather than prefixing the default code twice.
  const dial = digits.startsWith(DEFAULT_DIAL) ? DEFAULT_DIAL : undefined;
  if (dial) return { dial, national: digits.slice(dial.length) };

  return { dial: DEFAULT_DIAL, national: digits };
}

/**
 * The value the form submits, or `''` when no number was entered.
 *
 * Empty in, empty out: the phone is optional, and a field left alone must not
 * become a bare `+970`.
 *
 * Leading zeros are dropped. In E.164 the national trunk prefix is not part of
 * the number, so `+970` and `0599…` would otherwise combine into a number
 * WhatsApp cannot dial. Italy is the well-known exception — its landlines keep
 * the zero — and this does get those wrong; the clinic's roster is regional, and
 * the alternative is mangling the numbers it actually holds.
 */
export function joinPhone(dial: string, national: string): string {
  const digits = national.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return '';

  return `+${dial.replace(/\D/g, '')}${digits}`;
}

/**
 * A stored number as a person reads it — `+970 59-705-8996`.
 *
 * The calling code, a space, then the national digits grouped from the right in
 * fours and threes. On the nine-digit mobile numbers this roster is almost
 * entirely made of, that lands on 2-3-4, which is how the number is written on
 * a card and said out loud.
 *
 * ## Why grouped from the right
 *
 * A fixed 2-3-4 would be right for `+970` mobiles and wrong for everything
 * else, and this column does hold the occasional landline and foreign number.
 * Taking the last four, then the next three, then whatever is left as the head
 * degrades sensibly instead: a seven-digit number comes out `123-4567` with no
 * stray leading group, and a ten-digit one `123-456-7890`.
 *
 * ## What it will not do
 *
 * It never invents or drops a digit. `splitPhone` is what decides where the
 * calling code ends — including the case where the stored value carried no code
 * at all and the clinic's own is assumed — and everything it hands back in
 * `national` is printed. A value with no digits in it at all comes back as the
 * empty string, so a caller can fall back to its own placeholder rather than
 * drawing a bare `+970`.
 *
 * Display only. Nothing here is written back to `clients.phone`, which stays
 * free text holding exactly what was typed — see that column's comment.
 */
export function formatPhoneDisplay(stored: string | null | undefined): string {
  const { dial, national } = splitPhone(stored);
  if (!national) return '';

  return `+${dial} ${groupFromRight(national)}`;
}

/**
 * `597058996` → `59-705-8996`.
 *
 * Short numbers are left whole: a four-digit extension is not improved by a
 * hyphen, and an empty head group would print a leading `-`.
 */
function groupFromRight(digits: string): string {
  if (digits.length <= 4) return digits;

  const last = digits.slice(-4);
  const middle = digits.slice(-7, -4);
  const head = digits.slice(0, -7);

  return [head, middle, last].filter(Boolean).join('-');
}

/**
 * Which country to show when several share one calling code.
 *
 * Only the label is at stake — the code is what gets stored, and it is the same
 * either way — but falling back to whichever country happens to be listed first
 * would preselect Guernsey for every British number and Kazakhstan for every
 * Russian one, which reads as a bug rather than as a tie.
 */
const PRIMARY_FOR_DIAL: Partial<Record<string, CountryCode>> = {
  '1': 'US',
  '7': 'RU',
  '39': 'IT',
  '44': 'GB',
  '47': 'NO',
  '212': 'MA',
  '262': 'RE',
  '358': 'FI',
  '590': 'GP',
  '599': 'CW',
};

/**
 * The country to preselect for a calling code.
 *
 * A code does not identify a country, so this is a display choice and nothing
 * more. An unknown code falls back to the clinic's own country rather than
 * leaving the select with no valid selection.
 */
export function countryForDial(dial: string): CountryCode {
  const primary = PRIMARY_FOR_DIAL[dial];
  if (primary) return primary;

  const match = (Object.keys(COUNTRIES) as CountryCode[]).find((iso) => COUNTRIES[iso].dial === dial);
  return match ?? DEFAULT_COUNTRY;
}
