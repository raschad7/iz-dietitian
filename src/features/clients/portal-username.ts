import { normalizePhone } from '@/features/whatsapp/phone';

import { pickUsername, usernameBase } from './transliterate';

/**
 * What a client types into the portal's first box.
 *
 * **Their own phone number, written the way they write it** — `0599123456`,
 * with the trunk zero and without the country code. Nothing to remember,
 * nothing to spell down a phone line, and nothing that had to survive a trip
 * through Arabic transliteration.
 *
 * The local form and not E.164, which is what `normalizePhone` hands back.
 * `970599123456` is the shape WhatsApp addresses a chat with, and it is nobody's
 * idea of their own number: it is four digits longer, it starts with a prefix
 * the client has probably never typed, and the `0` they *would* have typed is
 * missing from it. The number goes through E.164 on the way here all the same,
 * because that is what collapses `+970 59 912 3456`, `00970599123456` and
 * `0599123456` into one value — the local form is what comes out the far side,
 * not a shortcut around the normalising.
 *
 * The scheme this replaces was the first name in Latin letters plus a random
 * four-character code: `ahmd-h7kp`. Both halves were a problem, and the first
 * one was the worse of the two. Arabic script does not write short vowels, so
 * `أحمد` maps to `ahmd` — a string its owner does not recognise as their own
 * name, cannot guess the spelling of, and cannot check against the card in
 * their hand without going letter by letter. The random tail then made it
 * unguessable by design. A client who mislaid the card had nothing to fall back
 * on; a client who still had it was copying eleven characters of nonsense.
 *
 * A phone number is none of those things. It is a value the client already
 * knows by heart, already types on a keypad daily, and reads identically in
 * both of the app's languages — Arabic digits are rendered as Latin ones under
 * the project's `nu-latn` rule, so the number on the card and the number in
 * their head are the same characters.
 *
 * ⚠ **A suggestion the dietitian can still edit**, exactly as before. Nothing
 * here writes a username; `issuePortalCredentials` takes whatever the form
 * submits, and the unique index on `users.username` stays the arbiter.
 *
 * Pure — no database, no Next.js — so `bun test` drives it directly. The
 * lookup that fills `taken` lives in `./portal-credentials`.
 */

/**
 * The stem a username is built on, and where it came from.
 *
 * The flag is what tells {@link pickPortalUsername} which of the two collision
 * strategies applies, and the two are deliberately different — see there.
 */
export type PortalUsernameBase = {
  value: string;
  /** False when the client has no usable phone and the name scheme took over. */
  fromPhone: boolean;
};

/**
 * A client's phone number in local form if it can be read as one, and their
 * first name if it cannot.
 *
 * `clients.phone` is free text and nullable on purpose (see that column), so
 * three things arrive here: a real number in one of a dozen written shapes, a
 * blank, and the occasional note somebody typed in the wrong field.
 * `normalizePhone` — the same function the WhatsApp send path trusts — answers
 * `null` for the last two rather than guessing, which is precisely the moment
 * the old name-and-code scheme should take over.
 *
 * **The fallback is kept, not deleted.** Walk-ins, children and anyone whose
 * relative books for them have no number of their own, and they are exactly the
 * clients this product treats as first class.
 */
export function portalUsernameBase(
  client: { fullName: string; phone?: string | null },
  defaultCountryCode: string,
): PortalUsernameBase {
  const phone = normalizePhone(client.phone, defaultCountryCode);
  if (phone) return { value: localPhoneDigits(phone, defaultCountryCode), fromPhone: true };

  return { value: usernameBase(client.fullName), fromPhone: false };
}

/**
 * E.164 digits → the number as its owner writes it: `970599123456` →
 * `0599123456`.
 *
 * **Only for the clinic's own country.** A number carrying a different country
 * code keeps it, because the trunk zero is a *national* prefix and dropping a
 * foreign code would state something false: `972599123456` is not `0599123456`
 * to a clinic in +970 — that is a different subscriber, on a different network,
 * and the two would be handed the same username. Foreign numbers are the rare
 * case here and reading one back in full is the correct answer for them.
 */
function localPhoneDigits(phone: string, defaultCountryCode: string): string {
  if (!phone.startsWith(defaultCountryCode)) return phone;

  return `0${phone.slice(defaultCountryCode.length)}`;
}

/**
 * How many family members may share one phone before the suffix gives up and
 * a random code takes over. Twenty is far past any household; it exists so the
 * loop cannot run forever on a number somebody has managed to reuse absurdly.
 */
const MAX_SHARED_PHONE = 20;

/**
 * An unused username built on `base`.
 *
 * **A counter for phones, a random code for names — and the difference is not
 * an inconsistency.** `pickUsername` reaches for a random code because two
 * clients called علي would otherwise get `aly-2` and `aly-3`: names that differ
 * in one character, in the last position, on an account nobody can tell apart
 * by looking. Phone numbers already differ from each other in several digits,
 * so the base does all of that work on its own and the suffix is only ever
 * reached by a household sharing one handset — a mother and her daughter, on
 * numbers that are otherwise identical anyway.
 *
 * For that case `0599123456-2` is the friendlier answer by a distance: it is
 * one extra character, it is obviously the second person on this phone, and the
 * pair it could be confused with belongs to someone sitting in the same room.
 * A wrong guess between them does not sign anyone in — the passwords differ —
 * it fails, which is the outcome the confusability rule exists to produce.
 *
 * ⚠ `taken` must hold every username already built on this base; see
 * `suggestPortalUsername`, which is what fills it.
 */
export function pickPortalUsername(base: PortalUsernameBase, taken: ReadonlySet<string>): string {
  if (!base.fromPhone) return pickUsername(base.value, taken);

  // The overwhelmingly common case: one person, one phone, the number as it is.
  if (!taken.has(base.value)) return base.value;

  for (let nth = 2; nth <= MAX_SHARED_PHONE; nth += 1) {
    const candidate = `${base.value}-${nth}`;
    if (!taken.has(candidate)) return candidate;
  }

  return pickUsername(base.value, taken);
}
