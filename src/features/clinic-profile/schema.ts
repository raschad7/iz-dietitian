import { z } from 'zod';

import { splitPhone } from '@/lib/phone-format';

const requiredText = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);

/**
 * The ceilings, named because the form draws them.
 *
 * They are not new — `name` has been capped at 120 since this schema was
 * written. What was missing is that anything over the cap came back as
 * `too_big` and `validation.ts` translated *every* issue on that field to
 * `required`, so a 300-character clinic name was reported as "This field is
 * required" under a box with 300 characters in it. Exporting the numbers lets
 * the field show the limit and the message name it, instead of the form
 * appearing to accept any length and then refusing to move.
 */
export const FIELD_LIMITS = {
  clinicName: 50,
  /**
   * The most digits the *national* part of the clinic phone may carry — the
   * part after the calling code. Not a character count; see `phoneSchema`. It
   * is the number `PhoneField` caps typing at, so the eleventh digit never
   * lands rather than being refused after the fact.
   *
   * Its floor is {@link MIN_CLINIC_PHONE_DIGITS}.
   */
  clinicPhone: 10,
  contactEmail: 254,
  address: 120,
  practitionerName: 50,
  /*
    50 each, which is the ceiling on what "أخرى" lets someone type — the only
    way either of these becomes free text. Every offered option is well inside
    it (the longest, "التغذية والتغذية العلاجية", is 25), so the cap constrains
    the typed answer and nothing else.
  */
  professionalTitle: 50,
  specialty: 50,
} as const;

/**
 * The fewest digits the clinic phone's national part may carry.
 *
 * Its ceiling is `FIELD_LIMITS.clinicPhone`, and unlike that one this cannot be
 * enforced at the keystroke: a number is short on the way to being long, so a
 * field that refused the eighth digit would refuse every number as it was being
 * typed. It is checked on submit, and `validation.phoneDigitCount` names both
 * ends of the range in one sentence.
 *
 * Outside `FIELD_LIMITS` because that object is documented as the ceilings the
 * form draws, and this is a floor.
 */
export const MIN_CLINIC_PHONE_DIGITS = 9;

/**
 * The number as the form submits it: `+<calling code><digits>`.
 *
 * **The same rule `clientPhoneSchema` applies, for the same reason.** This was
 * "exactly ten digits, no `+`", which is a Palestinian number with the country
 * silently assumed — a clinic anywhere else could not state its own code, and
 * what got stored was ambiguous enough that the portal's link builder had to
 * guess one from the environment before it could dial.
 *
 * The shape is guaranteed by `PhoneField`, which recombines its two halves
 * through `joinPhone`, so this is not asking anyone to type a format — it is
 * refusing to store anything that did not come from that control.
 *
 * ⚠ The length is measured on the **national part**, read back out with
 * `splitPhone`. A flat cap on the whole string would spend four of its
 * characters on `+1876` and leave a Jamaican number shorter than a Palestinian
 * one. `FIELD_LIMITS.clinicPhone` is that national ceiling now, not a character
 * count and no longer an exact length.
 *
 * ⚠ **Numbers stored under the old rule still read.** `splitPhone` takes a
 * leading trunk zero as "this country, no code given", so `0599123456` opens
 * the field on Palestine with the digits in place and is rewritten into the
 * international form the next time the clinic is saved. Nothing migrates it in
 * place, and nothing needs to: `normalizePhone` has always read both shapes.
 *
 * ⚠ **Nine or ten national digits, and the range is deliberately not
 * per-country.** Asked for as a flat rule, and it is the shape of the numbers
 * this clinic's region actually uses. It is stricter than a general
 * international field would be — a Gulf mobile runs to eight national digits
 * and would be refused here — so if the product ever sells outside that region,
 * this is the rule to widen, and `phone-countries.ts` is where a per-country
 * length would have to live.
 */
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+\d+$/, 'invalidPhone')
  .refine(
    (value) => {
      const digits = splitPhone(value).national.length;
      return digits >= MIN_CLINIC_PHONE_DIGITS && digits <= FIELD_LIMITS.clinicPhone;
    },
    // One message for both ends: the box asks for "9 or 10 digits", so being
    // outside that is one fact, not two. `validation.ts` reads this key.
    'phoneDigitCount',
  );

/**
 * The clinic mark, as a `data:` URI.
 *
 * The ceiling is on the *encoded* string because that is what the column
 * stores and what crosses the action boundary — base64 runs about a third
 * larger than the bytes it carries, so 256 KB of string is roughly 190 KB of
 * image. The upload control resizes to 256×256 WebP long before this, which
 * lands near 40 KB; this bound exists for a request that did not come from
 * that control.
 *
 * Only the three formats the resizer can emit are accepted. `image/svg+xml`
 * is deliberately absent: an SVG is a document that can carry script, and this
 * string is rendered back into the portal where a client reads it.
 */
const LOGO_MAX_CHARS = 256 * 1024;

export const clinicLogoSchema = z
  .string()
  .trim()
  .max(LOGO_MAX_CHARS)
  .regex(/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/)
  .nullable();

/**
 * Empty string means "no logo". A cleared file input and an absent field are
 * the same intent, and neither is an error.
 */
export const clinicLogoInputSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  clinicLogoSchema,
);

/**
 * ⚠ **The logo is deliberately not a member of this object.**
 *
 * `saveClinicInformation` writes whatever it is handed with `.set({ ...input })`,
 * so every field in this schema is cleared to its parsed value on every bulk
 * write. A `logoUrl` in here therefore meant that any caller which did not
 * carry the mark forward *erased* it — and the onboarding wizard, which has no
 * logo field at all, did exactly that. A test in `clinic-profile.test.ts` pins
 * this: saving clinic information must leave the mark alone.
 *
 * The logo is written only by `updateClinicField`, which touches one column.
 * Keeping it out of the bulk schema is what makes accidental erasure
 * unrepresentable rather than merely avoided.
 */
export const clinicInformationSchema = z.object({
  name: requiredText(2, FIELD_LIMITS.clinicName),
  phone: phoneSchema,
  /**
   * `.max()` before `.pipe()`, so an over-long string is reported as `too_big`
   * on this field rather than as a malformed address. 254 is the addr-spec
   * ceiling; the column is `text`, so nothing below it is enforced elsewhere.
   */
  contactEmail: z.string().trim().toLowerCase().max(FIELD_LIMITS.contactEmail).pipe(z.email()),
  address: requiredText(3, FIELD_LIMITS.address),
});

const weekdaySchema = z.number().int().min(0).max(6);
const minuteSchema = z.number().int().min(0).max(1440).multipleOf(15);

const workingDaySchema = z
  .object({
    weekday: weekdaySchema,
    isWorking: z.literal(true),
    openMinute: minuteSchema,
    closeMinute: minuteSchema,
  })
  .refine((day) => day.openMinute < day.closeMinute, { path: ['closeMinute'] });

const offDaySchema = z.object({
  weekday: weekdaySchema,
  isWorking: z.literal(false),
  openMinute: z.null(),
  closeMinute: z.null(),
});

export const clinicDayHoursSchema = z.discriminatedUnion('isWorking', [workingDaySchema, offDaySchema]);

export const weeklyScheduleSchema = z
  .object({ days: z.array(clinicDayHoursSchema).length(7) })
  .superRefine(({ days }, context) => {
    if (new Set(days.map((day) => day.weekday)).size !== 7) {
      context.addIssue({ code: 'custom', path: ['days'], message: 'weekdays_must_be_unique' });
    }

    if (!days.some((day) => day.isWorking)) {
      context.addIssue({ code: 'custom', path: ['days'], message: 'working_day_required' });
    }
  });

/**
 * ⚠ **`phone` and `licenseNumber` are deliberately absent.**
 *
 * The professional profile used to ask for a work phone and a licence number
 * on top of the clinic's own contact details, and both were dropped from every
 * screen by decision. The `practitioners.phone` and `practitioners.license_number`
 * columns still exist and still hold whatever was saved before — nothing reads
 * them, `saveProfessionalProfile` no longer writes them, and leaving them in
 * place is what makes the removal reversible without a restore.
 *
 * Do not re-add them here to "fix" the unused columns: `completeOnboarding`
 * re-validates the saved row against this schema, so a required field nobody
 * collects would make finishing setup impossible.
 *
 * `professionalTitle` and `specialty` are chosen from the lists in
 * `professional-options.ts`, but they stay plain bounded strings here. The
 * lists offer "أخرى", and choosing it stores whatever the practitioner types —
 * so the set of legal values is genuinely open, and an enum would reject the
 * one answer the product explicitly allows.
 */
export const professionalProfileSchema = z.object({
  name: requiredText(2, FIELD_LIMITS.practitionerName),
  professionalTitle: requiredText(2, FIELD_LIMITS.professionalTitle),
  specialty: requiredText(2, FIELD_LIMITS.specialty),
});

export type ClinicInformationInput = z.infer<typeof clinicInformationSchema>;
export type WeeklyScheduleInput = z.infer<typeof weeklyScheduleSchema>;
export type ProfessionalProfileInput = z.infer<typeof professionalProfileSchema>;
