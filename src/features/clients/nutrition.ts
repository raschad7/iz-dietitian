import { z } from 'zod';

/**
 * The nutrition vocabulary a client record is written in.
 *
 * These lived in `src/features/weekly-plans/schema.ts` while the nutrition
 * profile was a form owned by that feature. The intake form is owned by
 * `clients` now, and `weekly-plans/schema.ts` already imports `CLIENT_GOALS`
 * from this slice — so keeping them there and importing back would have made a
 * cycle between the two schema modules. They moved here, and weekly-plans
 * re-exports them so its existing import sites are untouched.
 *
 * Nothing in this module imports a database or a framework: it is the shared
 * vocabulary, and both the intake form and the planner validate against it.
 */

/**
 * The structured allergen list — the only thing the dish catalog filters on.
 *
 * Deliberately six closed values rather than prose. `clients.allergies` carries
 * the detail a dietitian writes in their own words; filtering a catalog by
 * keyword-matching that prose is the kind of nearly-right that puts a client in
 * hospital.
 */
export const ALLERGENS = ['nuts', 'lactose', 'gluten', 'egg', 'fish', 'sesame'] as const;

export type Allergen = (typeof ALLERGENS)[number];

/** `HH:MM`, the value an `<input type="time">` submits. */
export const timeOfDaySchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM');

/** Trims PostgreSQL's `HH:MM:SS` down to what an `<input type="time">` expects. */
export function toTimeInput(value: string): string {
  return value.slice(0, 5);
}

export const mealSlotSchema = z.object({
  slotKey: z
    .string()
    .trim()
    .min(1)
    .max(32)
    // Referenced by `weekly_plan_meals.slot_key` and used as a React key and a
    // form field name, so it is kept to an identifier rather than free text.
    .regex(/^[a-z0-9_]+$/, 'lowercase letters, digits and underscores only'),
  label: z.string().trim().min(1).max(60),
  timeOfDay: timeOfDaySchema,
  kcalShare: z.coerce.number().min(0).max(1),
});

/**
 * A day's slots.
 *
 * Between one and eight: a schedule of zero meals cannot be planned against, and
 * beyond eight the board stops being readable. Slot keys must be unique — two
 * meals with the same key would collide on the meal table's unique index and lose
 * one silently.
 *
 * Shares deliberately do NOT have to sum to 1. `slotBudgets` normalises them, so
 * a dietitian mid-edit is not blocked by arithmetic.
 */
export const mealScheduleSchema = z
  .array(mealSlotSchema)
  .min(1)
  .max(8)
  .refine((slots) => new Set(slots.map((slot) => slot.slotKey)).size === slots.length, {
    message: 'slot keys must be unique',
  });

export type MealScheduleInput = z.infer<typeof mealScheduleSchema>;

/**
 * The default schedule, offered to a client who has none.
 *
 * Five meals, and the shares that let a dietitian recognise their own practice:
 * lunch is the largest meal of the day in Palestine, which is why it carries 35%
 * and dinner 20% rather than the other way round.
 */
export const DEFAULT_MEAL_SCHEDULE: MealScheduleInput = [
  { slotKey: 'breakfast', label: 'فطور', timeOfDay: '07:30', kcalShare: 0.25 },
  { slotKey: 'snack_1', label: 'سناك صباحي', timeOfDay: '10:30', kcalShare: 0.1 },
  { slotKey: 'lunch', label: 'غداء', timeOfDay: '14:00', kcalShare: 0.35 },
  { slotKey: 'snack_2', label: 'سناك عصر', timeOfDay: '17:00', kcalShare: 0.1 },
  { slotKey: 'dinner', label: 'عشاء', timeOfDay: '20:00', kcalShare: 0.2 },
];
