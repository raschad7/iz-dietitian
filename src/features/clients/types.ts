/**
 * Plain data shapes shared with client components.
 *
 * This module deliberately imports nothing. `verbatimModuleSyntax` is on, so
 * `import { type X } from './queries'` in a client component still emits a real
 * `import {} from './queries'` — which would pull `@/db`, and with it the
 * Postgres driver, into the browser bundle. Types crossing the server/client
 * boundary live here instead.
 */

/**
 * What the client card holds: identity, and nothing clinical.
 *
 * The clinical half is {@link ClientIntakeValues}, behind its own dialog.
 */
export type ClientFormValues = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  preferredLocale: string;
  dateOfBirth: string | null;
  sex: string | null;
};

/**
 * One slot in a client's daily eating schedule, as the intake dialog holds it.
 *
 * Structurally identical to `MealScheduleInput` in `./nutrition` — assignable
 * both ways with no cast — and declared again here rather than imported so this
 * module keeps its no-imports rule above.
 */
export type MealSlotValues = {
  slotKey: string;
  label: string;
  timeOfDay: string;
  kcalShare: number;
};

/**
 * Everything the intake dialog reads and writes, across both tables.
 *
 * `dateOfBirth` and `sex` are in here but are **not** written by the intake —
 * they belong to the client card. They ride along because the dialog computes
 * the live BMI and calorie target from them, and a target that silently reads
 * zero because the age was elsewhere is the failure this whole change is about.
 */
export type ClientIntakeValues = {
  clientId: string;
  fullName: string;

  /** Read-only here. Written by the client card. */
  dateOfBirth: string | null;
  sex: string | null;

  heightCm: number | null;
  goal: string | null;
  activityLevel: string | null;

  weightKg: number | null;

  allergenTags: string[];
  /** Typed by hand; recorded and sent to the model, but never a catalog filter. */
  customAllergens: string[];
  allergies: string | null;

  conditions: string | null;
  medications: string | null;
  medicalNotes: string | null;
  notes: string | null;

  dailyKcalTarget: number | null;
  proteinTargetGrams: number | null;
  preferences: string | null;
  dislikes: string | null;
  permanentInstructions: string | null;
  mealSchedule: MealSlotValues[];

  /*
   * The nutrition assessment questionnaire — the clinic's paper intake sheet.
   *
   * Strings and not the union types `nutrition.ts` exports, matching how
   * `goal` and `activityLevel` above are already carried: the column is text,
   * anything could be in a row written before a value was retired, and the
   * components narrow with `isMember` before they translate a label.
   */
  maritalStatus: string | null;
  childrenCount: number | null;
  bloodType: string | null;
  occupation: string | null;

  visitReason: string | null;
  dietHistory: string | null;
  drugAllergies: string | null;
  familyHistory: string | null;

  activityNotes: string | null;
  activityBarriers: string | null;
  sleepHours: number | null;
  smoking: string | null;

  caffeineFrequency: string | null;
  sweetDrinksFrequency: string | null;
  fastFoodFrequency: string | null;
  vegetablesFrequency: string | null;
  fruitFrequency: string | null;
  dairyFrequency: string | null;
  redMeatFrequency: string | null;
  chickenFrequency: string | null;
  fishFrequency: string | null;
  sweetsFrequency: string | null;

  /**
   * Whether a `client_nutrition_profiles` row exists yet.
   *
   * Drives the dialog's wording — "complete the intake" the first time, "edit"
   * afterwards — and nothing else. The row is still created lazily on the first
   * save that touches it.
   */
  hasProfile: boolean;
};
