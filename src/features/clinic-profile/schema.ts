import { z } from 'zod';

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
  /** Both the required digit count and the character ceiling — see `phoneSchema`. */
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
 * Exactly ten digits, and nothing else.
 *
 * It used to accept 7–40 characters of digits, spaces, brackets, dots, dashes
 * and an optional leading `+`, which let one clinic store `+970 59 123 4567`
 * and another `0599123456` for the same line. A single fixed shape is what
 * makes the number comparable, dialable and printable without a normaliser at
 * every call site.
 *
 * ⚠ Separators are rejected rather than stripped. The field's counter reads
 * "n of 10", so the count the reader is watching has to be the count the rule
 * applies to — accepting `059 587 2094` while showing 12/10 would be a control
 * arguing with itself. `FIELD_LIMITS.clinicPhone` is therefore both the digit
 * count and the character ceiling.
 */
const phoneSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${FIELD_LIMITS.clinicPhone}}$`));

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
