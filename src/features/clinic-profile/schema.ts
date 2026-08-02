import { z } from 'zod';

const requiredText = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);

const phoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(40)
  .regex(/^[+\d][\d\s().-]+$/);

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
