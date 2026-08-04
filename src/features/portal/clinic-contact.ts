import { normalizePhone } from '@/features/whatsapp/phone';

/**
 * Turning the clinic's written phone number into things a phone can act on.
 *
 * Pure and Next-free, so `clinic-contact.test.ts` covers it directly.
 *
 * `clinics.phone` is free text, like every other phone number in this app: a
 * clinic may have `02-298 1234`, `+970 2 298 1234` or `0599123456` in there.
 * `normalizePhone` already knows how to read all of those, and reusing it means
 * the number a client taps to call is derived by the same code that decides
 * where a WhatsApp reminder is sent.
 *
 * **Null beats a guess.** When the stored value cannot be a phone number —
 * somebody typed a note in the field — this returns no links at all, and the
 * screen shows the text as written without offering a button that would dial
 * nothing. A `tel:` built from unparsed input is a call to the wrong person.
 */
export type ClinicContactLinks = {
  /** `tel:+9702…`, or null when the stored number is not usable. */
  tel: string | null;
  /** `https://wa.me/9702…`, or null on the same condition. */
  whatsapp: string | null;
};

export function clinicContactLinks(
  phone: string | null,
  defaultCountryCode: string,
): ClinicContactLinks {
  const digits = normalizePhone(phone, defaultCountryCode);

  if (!digits) return { tel: null, whatsapp: null };

  return {
    // `tel:` wants the `+`; `wa.me` wants the digits bare. The one difference
    // between the two, and the reason they are built here rather than inline.
    tel: `tel:+${digits}`,
    whatsapp: `https://wa.me/${digits}`,
  };
}

/**
 * A map search for the clinic's address.
 *
 * A generic geo query rather than one provider's deep link: on a phone this
 * opens whichever map app the person actually uses, and on a desktop it opens
 * the one their browser prefers. Returns null for a blank address so the caller
 * renders plain text.
 */
export function clinicMapLink(address: string | null): string | null {
  const trimmed = address?.trim();

  if (!trimmed) return null;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
}
