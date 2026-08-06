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
  shareWeightWithClient: boolean;

  allergenTags: string[];
  /** Typed by hand; recorded and sent to the model, but never a catalog filter. */
  customAllergens: string[];
  allergies: string | null;

  conditions: string | null;
  medications: string | null;
  careNote: string | null;
  medicalNotes: string | null;
  notes: string | null;

  dailyKcalTarget: number | null;
  proteinTargetGrams: number | null;
  preferences: string | null;
  dislikes: string | null;
  permanentInstructions: string | null;
  mealSchedule: MealSlotValues[];

  /**
   * Whether a `client_nutrition_profiles` row exists yet.
   *
   * Drives the dialog's wording — "complete the intake" the first time, "edit"
   * afterwards — and nothing else. The row is still created lazily on the first
   * save that touches it.
   */
  hasProfile: boolean;
};
