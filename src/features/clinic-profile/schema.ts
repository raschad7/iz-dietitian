import { z } from 'zod';

const requiredText = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);

const phoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(40)
  .regex(/^[+\d][\d\s().-]+$/);

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
  name: requiredText(2, 120),
  phone: phoneSchema,
  contactEmail: z.string().trim().toLowerCase().pipe(z.email()),
  address: requiredText(3, 500),
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

export const professionalProfileSchema = z.object({
  name: requiredText(2, 120),
  professionalTitle: requiredText(2, 120),
  specialty: requiredText(2, 160),
  phone: phoneSchema,
  licenseNumber: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(80).nullable(),
  ),
});

export type ClinicInformationInput = z.infer<typeof clinicInformationSchema>;
export type WeeklyScheduleInput = z.infer<typeof weeklyScheduleSchema>;
export type ProfessionalProfileInput = z.infer<typeof professionalProfileSchema>;
