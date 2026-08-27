import type { Locale } from '@/i18n/routing';
import { currencySymbol, formatNumber, toIntlLocale } from '@/lib/format';

/**
 * The one place shekels are converted, parsed and added up.
 *
 * **Money is an integer count of agorot everywhere it is stored or passed
 * around.** `27000` is ₪ 270.00. It becomes a decimal exactly twice: when
 * someone types one in (`parseAmount`) and when one is drawn on screen
 * (`formatAmount`). Nothing between those two points may hold a fractional
 * shekel, because `0.1 + 0.2` is not `0.3`, and a ledger that drifts by an
 * agora a week is a ledger nobody trusts by March.
 *
 * The currency itself is not this module's business: `DEFAULT_CURRENCY` in
 * `src/lib/format.ts` names it, and `formatCurrency` there already pins the
 * numbering system to Latin digits in both locales. This module only knows that
 * a shekel has 100 agorot.
 */

/** Agorot in a shekel. */
export const MINOR_UNITS_PER_MAJOR = 100;

/**
 * The largest amount a single row may carry, in minor units — ₪ 21,474,836.47.
 *
 * Not a product rule: it is the ceiling of the `integer` column the amounts live
 * in. Enforcing it here means an implausible figure is rejected by validation
 * with a message, rather than reaching PostgreSQL and coming back as a 500 from
 * an integer overflow.
 */
export const MAX_AMOUNT_MINOR = 2_147_483_647;

/** `٠`-`٩`, and the Persian `۰`-`۹` a few Arabic keyboards emit instead. */
const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

/** U+066B ARABIC DECIMAL SEPARATOR — what an Arabic keyboard puts before the agorot. */
const ARABIC_DECIMAL_SEPARATOR = '٫';

/** The ordinary comma, U+066C ARABIC THOUSANDS SEPARATOR, and any whitespace. */
const GROUPING_SEPARATORS = /[,٬\s]/g;

/**
 * Turns whatever was typed into Latin digits with a `.` decimal point.
 *
 * The clinic works in Arabic, so the amount field receives Arabic-Indic digits
 * as often as Latin ones — and `Number('٢٧٠')` is `NaN`, silently. Normalising
 * first means one parser handles both keyboards, instead of the Arabic one
 * being a bug report.
 */
function normalizeDigits(input: string): string {
  let out = '';

  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;

    if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
      out += String(code - ARABIC_INDIC_ZERO);
    } else if (code >= EXTENDED_ARABIC_INDIC_ZERO && code <= EXTENDED_ARABIC_INDIC_ZERO + 9) {
      out += String(code - EXTENDED_ARABIC_INDIC_ZERO);
    } else if (char === ARABIC_DECIMAL_SEPARATOR) {
      out += '.';
    } else {
      out += char;
    }
  }

  return out;
}

/**
 * How many keys the payment card takes: seven, which is ₪ 9,999,999.
 *
 * All seven are shekels. A limit on the *keypad*, not on the ledger:
 * `MAX_AMOUNT_MINOR` is what the column can hold and is two hundred times this.
 */
export const KEYPAD_DIGITS = 7;

/**
 * The digits behind the payment card's readout.
 *
 * **Every key is a shekel.** `1` is ₪ 1.00, `10` is ₪ 10.00, `100000` is
 * ₪ 100,000.00 — the figure grows leftwards for as long as there are keys left,
 * and the agorot are never reached. They are not a place the keypad fills; they
 * are the two zeros the amount is written with.
 *
 * The alternative, filling from the right so the first key means an agora, is
 * how a supermarket till works and is wrong here: a clinic says "two hundred
 * and fifty", and a keypad that shows ₪ 0.02 after two keystrokes is one nobody
 * trusts mid-amount. Filling from the left and stopping at the point is the
 * only arrangement where what is on screen is what was said out loud.
 *
 * Arabic-Indic digits are normalised to Latin, unlike {@link toAmountText}'s
 * free-text field: this value is grouped and pointed by `Intl` before it is
 * shown, so keeping two scripts would put both inside one figure.
 *
 * Leading zeros are dropped, so a stray `0` before an amount cannot push a real
 * digit off the end. Past {@link KEYPAD_DIGITS} the key simply does nothing —
 * the figure is not truncated, because silently keeping the front of a mis-keyed
 * amount invents one nobody typed.
 */
export function toKeypadDigits(input: string): string {
  let digits = '';

  for (const char of normalizeDigits(input)) {
    if (char >= '0' && char <= '9') digits += char;
  }

  digits = digits.replace(/^0+/, '');

  return digits.length > KEYPAD_DIGITS ? digits.slice(0, KEYPAD_DIGITS) : digits;
}

/**
 * The readout, split into what has been keyed and what is still waiting.
 *
 * `pending` is the placeholder — a grey `0.00` on an untouched card, standing
 * for the shape of an amount before there is one — and it goes the moment a key
 * lands. `entered` is then the whole readout, in the page's ink: **1**,
 * **1,205**, **100,000**.
 *
 * **The agorot go with it.** They are not a place the keypad fills, so once
 * there is a figure they would be two zeros the reader neither typed nor can
 * change — decoration on the one number the card exists to collect. The amount
 * carries them everywhere it is read back: on the answer line below, in the
 * ledger, on the printed bill.
 *
 * The two together are the value the form posts, which is why they are returned
 * as one pair rather than formatted twice — a split that disagreed with itself
 * would be a figure on screen that is not the figure being submitted.
 */
export function keypadReadout(
  locale: Locale,
  digits: string,
): { entered: string; pending: string } {
  const point = decimalSeparator(locale);

  /* Nothing keyed at all: the whole figure is the shape of one, in grey. */
  if (digits === '') return { entered: '', pending: `0${point}00` };

  /* A figure of its own, with nothing grey left beside it. */
  return { entered: formatNumber(locale, Number(digits), { maximumFractionDigits: 0 }), pending: '' };
}

/** The whole readout, for the value the form carries. */
export function formatKeypad(locale: Locale, digits: string): string {
  const { entered, pending } = keypadReadout(locale, digits);

  return `${entered}${pending}`;
}

/**
 * Whatever `Intl` puts between the shekels and the agorot in this locale.
 *
 * Read out of a formatted number rather than written down as `'.'`: the readout
 * is assembled here but parsed by {@link parseAmount}, and a point this module
 * invented could differ from the one `formatNumber` uses two lines above.
 */
function decimalSeparator(locale: Locale): string {
  return (
    new Intl.NumberFormat(toIntlLocale(locale), { minimumFractionDigits: 1 })
      .formatToParts(1.1)
      .find((part) => part.type === 'decimal')?.value ?? '.'
  );
}

/**
 * Parses a typed amount into minor units, or returns `null` if it is not one.
 *
 * Accepts `270`, `270.5`, `270.50`, `٢٧٠٫٥٠`, `1,250.00`, a leading `+` or `-`,
 * and surrounding whitespace. Returns `null` — never a guess — for anything
 * else.
 *
 * **More than two decimal places is a rejection, not a rounding.** `12.345`
 * comes back `null` rather than ₪ 12.35, because somebody who typed a third
 * digit meant something by it, and quietly changing the number they are about
 * to bill a subscriber is the worst of the available answers. The field tells
 * them; it does not decide for them.
 *
 * The sign is preserved. Whether a negative amount is *allowed* is the caller's
 * rule — a charge forbids one, a refund is one.
 */
export function parseAmount(input: string): number | null {
  const cleaned = normalizeDigits(input).trim().replace(GROUPING_SEPARATORS, '');
  if (cleaned === '') return null;

  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;

  const [, sign, whole = '', fraction = ''] = match;

  /*
    Built digit by digit rather than `Math.round(Number(cleaned) * 100)`: the
    float multiply is exactly the step this module exists to avoid, and it gets
    `19.99` wrong often enough to matter (`1998.9999999999998`).
  */
  const minor = Number(whole) * MINOR_UNITS_PER_MAJOR + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor) || minor > MAX_AMOUNT_MINOR) return null;

  return sign === '-' ? -minor : minor;
}

/**
 * Minor units as the decimal string an editable input should start with —
 * `27000` → `"270.00"`.
 *
 * Always two decimal places, so an amount does not change shape when a form is
 * reopened, and always Latin digits: this is a value going into an `<input>`,
 * not text being read. Use {@link formatAmount} for anything a person reads.
 */
export function toAmountInput(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const absolute = Math.abs(minor);
  const whole = Math.trunc(absolute / MINOR_UNITS_PER_MAJOR);
  const fraction = absolute % MINOR_UNITS_PER_MAJOR;

  return `${sign}${whole}.${String(fraction).padStart(2, '0')}`;
}

/**
 * Minor units as money for a reader — `27000` → `₪270.00`.
 *
 * ## The symbol leads, in both languages
 *
 * Assembled here rather than handed to `Intl`'s `style: 'currency'`, which puts
 * the shekel sign *before* the figure in English and *after* it in Arabic. The
 * same amount would then be drawn two ways on one clinic's screen depending on
 * which language the reader happened to be in — and worse, the two disagree
 * about which end of a column the symbol sits at, so a column of amounts stops
 * lining up the moment the language changes.
 *
 * A symbol in front is also what makes a money column scannable: every figure
 * starts at the same place and the digits line up under each other.
 *
 * The sign goes outside it — `-₪70.00`, not `₪-70.00` — which is where English
 * already put it, and is the reading that cannot be mistaken for part of the
 * amount. A negative here is a refund; see `client_payments`.
 *
 * The division by 100 is safe and is the one place it happens: `Intl` needs a
 * decimal, the value is handed straight to it, and nothing downstream ever adds
 * two of these together.
 */
export function formatAmount(locale: Locale, minor: number): string {
  const digits = formatNumber(locale, Math.abs(minor) / MINOR_UNITS_PER_MAJOR, {
    /* Always two places. A column where some rows show `270` and others
       `270.50` is a column whose decimal points do not line up. */
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${minor < 0 ? '-' : ''}${currencySymbol(locale)}${digits}`;
}

/**
 * The same amount with its agorot dropped when there are none — `₪1,000`, and
 * `₪99,999.99` only when there are agorot to show.
 *
 * For the payment card's answer line and for the money columns on the Bills
 * table.
 *
 * The columns used {@link formatAmount}'s fixed two places, on the argument
 * that a column is read down and its decimal points have to line up. They do
 * line up — but a clinic that bills in whole shekels was reading a screen where
 * every figure carried `.00`, and two zeros repeated down four columns are two
 * zeros the eye has to strike out of every number before it can compare any of
 * them. Dropping them costs the alignment only on the rows that actually have
 * agorot, which are the rows where the agorot are worth seeing.
 *
 * {@link formatAmount} keeps the fixed places for the printed bill, where the
 * document is a financial record rather than a screen being scanned.
 */
export function formatAmountCompact(locale: Locale, minor: number): string {
  /*
    Two places or none — never one.

    `minimumFractionDigits: 0` alone drew fifty agorot as `₪1.5`, which is a
    number rather than an amount: money is written to the agora or not at all,
    and half a decimal place reads as a figure somebody truncated. The test is
    on the stored integer, so it asks whether there are agorot rather than
    inferring it from a string.
  */
  const whole = minor % MINOR_UNITS_PER_MAJOR === 0;

  const digits = formatNumber(locale, Math.abs(minor) / MINOR_UNITS_PER_MAJOR, {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });

  return `${minor < 0 ? '-' : ''}${currencySymbol(locale)}${digits}`;
}

/**
 * Adds minor-unit amounts exactly.
 *
 * A one-line `reduce`, exported anyway so every total in the feature is visibly
 * integer addition. The moment one caller sums majors instead, its total stops
 * agreeing with the others by an agora and no test says which one is right.
 */
export function sumAmounts(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}

/**
 * A subscriber's money, as the bills table draws it.
 *
 * The four figures are one object because they are one arithmetic: three of
 * them are derived from the first two, and computing any of them separately is
 * how two columns in the same row start disagreeing.
 */
export type SubscriberTotals = {
  /** Everything billed. The "total price" column. */
  chargedMinor: number;
  /** Everything received, refunds netted off. The "total payment" column. */
  paidMinor: number;
  /**
   * The signed account position: billed less paid.
   *
   * Positive means the subscriber owes the clinic. **Negative is meaningful and
   * is not clamped** — it means the clinic is holding their money (a package
   * paid up front, a refund not yet taken), and flattening it to zero would
   * make an overpayment look like a settled account to whoever is reconciling
   * the drawer.
   */
  balanceMinor: number;
  /**
   * What is still to be collected — the balance, never below zero.
   *
   * This is the column staff chase, and it differs from `balanceMinor` in
   * exactly one case: a subscriber in credit shows nothing remaining rather
   * than a negative amount to collect. Both are shown because they answer
   * different questions — "what do I ask them for" and "where does this account
   * actually stand".
   */
  remainingMinor: number;
};

/** Derives the four figures from the two sums. The only place they are related. */
export function subscriberTotals(chargedMinor: number, paidMinor: number): SubscriberTotals {
  const balanceMinor = chargedMinor - paidMinor;

  return {
    chargedMinor,
    paidMinor,
    balanceMinor,
    remainingMinor: Math.max(balanceMinor, 0),
  };
}

/** Which of the three things a balance is. Colours the balance figure itself. */
export type BalanceState = 'owing' | 'settled' | 'credit';

export function balanceState(balanceMinor: number): BalanceState {
  if (balanceMinor > 0) return 'owing';
  if (balanceMinor < 0) return 'credit';
  return 'settled';
}

/**
 * Where a subscriber stands on paying, as one word.
 *
 * Five states rather than {@link BalanceState}'s three, because a status column
 * has to answer a question the balance alone cannot: **someone who has paid
 * half is not in the same position as someone who has paid nothing**, and both
 * have a positive balance. That distinction is the whole reason to spend a
 * column on this — it is what separates "chase them" from "they are paying".
 *
 * `none` exists for the same kind of reason and is the one that is easy to get
 * wrong. A subscriber who has never been billed has a zero balance, and a naive
 * "balance is zero, so they are paid up" would put a settled badge on every new
 * record in the register. Nothing has been billed and nothing is owed; that is
 * not the same as having paid, and it says so.
 *
 * A refund large enough to outrun the payments — `paidMinor` at or below zero
 * while something is still owed — reads as `unpaid` rather than `partial`,
 * because `paidMinor > 0` is the test for "money has actually come in".
 */
export type PaymentStatus = 'none' | 'unpaid' | 'partial' | 'paid' | 'credit';

export function paymentStatus({ chargedMinor, paidMinor, balanceMinor }: SubscriberTotals): PaymentStatus {
  // Nothing has happened on this account at all. Checked first: every test
  // below would otherwise read an empty ledger as a settled one.
  if (chargedMinor === 0 && paidMinor === 0) return 'none';

  if (balanceMinor < 0) return 'credit';
  if (balanceMinor === 0) return 'paid';

  return paidMinor > 0 ? 'partial' : 'unpaid';
}

/**
 * What a price field is allowed to contain, from whatever was typed into it.
 *
 * `27000` → `"270"`, and `"27O.5abc"` → `"270.5"`. A digits-and-one-point
 * string, at most two places past the point, with Arabic-Indic digits and the
 * Arabic decimal separator normalised to Latin — the same normalisation
 * {@link parseAmount} does, applied as the key lands rather than on submit.
 *
 * **A field that accepts a letter and rejects it on submit has already let
 * somebody read a wrong thing back as right.** Filtering as it is typed is what
 * makes the figure on screen and the figure that will be stored the same one,
 * and it is why the field can be a text input at all: `type="number"` would
 * refuse the letter and, on a scroll of the wheel, quietly change the amount.
 *
 * Leading zeros go, so a stray `0` cannot sit in front of a real amount — but
 * `0` alone and `0.50` survive, because a free service and fifty agorot are
 * both real answers.
 *
 * Four whole digits, and past that the key simply does nothing. A clinic rate
 * is a three- or four-figure sum; five is a slipped finger, and a field that
 * takes ₪27,000 for a consultation will eventually put it on somebody's bill.
 * The figure is not truncated from the front — keeping the head of a mis-keyed
 * amount invents one nobody typed — so the extra key is refused instead.
 */
const PRICE_WHOLE_DIGITS = 4;

export function toPriceInput(input: string): string {
  const normalized = normalizeDigits(input);

  let whole = '';
  let fraction = '';
  let seenPoint = false;
  let seenZero = false;

  for (const char of normalized) {
    if (char === '.') {
      if (seenPoint) continue;
      seenPoint = true;
      continue;
    }

    if (char < '0' || char > '9') continue;

    if (seenPoint) {
      if (fraction.length < 2) fraction += char;
      continue;
    }

    /*
      Leading zeros are dropped as they arrive rather than stripped afterwards.
      Stripping later lets them eat the digit budget first — `00250` filled the
      four places with `0025`, refused the last key, and came out as `25`,
      which is a tenth of what was typed.
    */
    if (!whole && char === '0') {
      seenZero = true;
      continue;
    }

    if (whole.length < PRICE_WHOLE_DIGITS) whole += char;
  }

  /* `0` on its own is a real answer: a service the clinic gives away. */
  if (!whole && seenZero) whole = '0';

  if (!seenPoint) return whole;

  return `${whole || '0'}.${fraction}`;
}

/**
 * A stored amount as a price field draws it — `27000` → `"270"`, `27050` →
 * `"270.50"`.
 *
 * {@link toAmountInput}'s fixed two places are right for a field somebody is
 * about to key an amount into: the shape does not change under them as the
 * form reopens. A price list is read far more often than it is edited, and a
 * column of `.00` is two zeros the eye strikes out of every rate before it can
 * compare any of them — the same reasoning the Bills columns follow.
 */
export function toPriceValue(minor: number): string {
  return minor % MINOR_UNITS_PER_MAJOR === 0
    ? String(Math.trunc(minor / MINOR_UNITS_PER_MAJOR))
    : toAmountInput(minor);
}
