/**
 * Turning what a dietitian typed into something WhatsApp will accept.
 *
 * Pure: no database, no `Intl`, no Next.js — so `bun test` calls it directly and
 * the same function can run in the browser to preview the number before sending.
 *
 * `clients.phone` is free text on purpose (see that column's comment): a real
 * roster holds `0599-123456`, `+970 59 912 3456`, `00972599123456` and
 * `059 912 3456`, all of them the same person. WhatsApp accepts exactly one of
 * those shapes — E.164 digits with no `+`, no spaces, no leading zero — so the
 * conversion has to happen here rather than by asking staff to retype 400
 * numbers.
 */

/** WhatsApp's chat id for an individual: E.164 digits, then this suffix. */
const INDIVIDUAL_SUFFIX = '@c.us';

/** Groups end in `@g.us`. The clinic automations never write to one. */
const GROUP_SUFFIX = '@g.us';

/**
 * E.164 permits at most 15 digits. The floor is deliberately loose — short
 * national formats exist — but it still rejects the "phone: 123" that is really
 * a note somebody typed in the wrong field.
 */
const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

/**
 * The longest run of leading digits that could be a country code. Used only to
 * decide "does this number already carry one?", never to look one up.
 */
const MAX_COUNTRY_CODE_DIGITS = 4;

/**
 * Normalises a written phone number to E.164 digits without `+`.
 *
 * Returns `null` — never a guess — when the input cannot be a phone number.
 * A silent guess here would send a patient's appointment reminder to a stranger.
 *
 * The rules, in order:
 *
 *  1. `+972…` / `00972…` — an international prefix the writer supplied. Trust it
 *     and strip the prefix. This is why the `+` is read before the digits are:
 *     `+9705…` and `09705…` mean different things.
 *  2. `0599…` — a national trunk zero. Replace it with `defaultCountryCode`.
 *  3. `599123456` — no prefix and no trunk zero. Prepend the country code, but
 *     only when the result is a plausible length; a 12-digit number with no
 *     prefix is already international and gets left alone.
 */
export function normalizePhone(raw: string | null | undefined, defaultCountryCode: string): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Read the international marker before discarding punctuation: `00` and `+`
  // are the same claim, and both are lost by a bare digit filter.
  const hadPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');

  if (!digits) return null;

  if (hadPlus) {
    // Already international. Nothing to add — and nothing to strip, since a
    // country code never starts with 0.
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = `${defaultCountryCode}${digits.replace(/^0+/, '')}`;
  } else if (!looksInternational(digits, defaultCountryCode)) {
    digits = `${defaultCountryCode}${digits}`;
  }

  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;

  return digits;
}

/**
 * Whether a prefix-less string of digits is already a full international number.
 *
 * Two signals, both cheap and both conservative: it starts with the clinic's own
 * country code (the overwhelmingly common case — `970599…` pasted from a
 * contact card), or it is long enough that prepending a country code would push
 * it past E.164's 15 digits.
 */
function looksInternational(digits: string, defaultCountryCode: string): boolean {
  if (digits.startsWith(defaultCountryCode)) return true;

  return digits.length + MAX_COUNTRY_CODE_DIGITS > MAX_DIGITS;
}

/** E.164 digits → the chat id the gateway addresses. */
export function toChatId(digits: string): string {
  return `${digits}${INDIVIDUAL_SUFFIX}`;
}

/**
 * A written phone number → a chat id, or `null` when it is not usable.
 *
 * The one function the send path calls: everything upstream of it holds a
 * `clients.phone` that may be anything at all.
 */
export function toChatIdFromPhone(
  raw: string | null | undefined,
  defaultCountryCode: string,
): { phone: string; chatId: string } | null {
  const phone = normalizePhone(raw, defaultCountryCode);
  if (!phone) return null;

  return { phone, chatId: toChatId(phone) };
}

/**
 * Digits out of an inbound chat id, or `null` for anything that is not one
 * person's number.
 *
 * Rejects groups, and rejects WhatsApp's privacy ids (`…@lid`), whose leading
 * digits are *not* a phone number — matching a client on one would attribute a
 * stranger's message to a patient.
 */
export function phoneFromChatId(chatId: string | null | undefined): string | null {
  if (!chatId) return null;
  if (!chatId.endsWith(INDIVIDUAL_SUFFIX)) return null;

  const digits = chatId.slice(0, -INDIVIDUAL_SUFFIX.length);

  // `12345:6@c.us` — a device-suffixed id. The part before the colon is the
  // number, but a bare `\d+` test would reject it, so strip it first.
  const bare = digits.split(':')[0] ?? '';

  if (!/^\d+$/.test(bare)) return null;
  if (bare.length < MIN_DIGITS || bare.length > MAX_DIGITS) return null;

  return bare;
}

export function isGroupChatId(chatId: string | null | undefined): boolean {
  return Boolean(chatId?.endsWith(GROUP_SUFFIX));
}

/**
 * The last nine digits, used to match an inbound number against
 * `clients.phone`.
 *
 * The stored value may or may not carry a country code, and the two may
 * disagree (`0599…` locally, `+970599…` on WhatsApp) while being the same
 * person. Comparing the national significant part is what makes those match.
 * Nine digits is the length of a mobile subscriber number in the region and is
 * long enough that a collision inside one clinic's roster is not a practical
 * concern.
 */
export function phoneMatchKey(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length < MIN_DIGITS) return null;

  return digits.slice(-9);
}
