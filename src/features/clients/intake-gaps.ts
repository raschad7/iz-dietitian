import { type ClientIntakeValues } from './types';

/**
 * Which parts of a nutrition record are still blank.
 *
 * Pure functions over plain values — no database, no React — so the count can be
 * checked without rendering a page. Same discipline as
 * `src/features/weekly-plans/targets.ts`.
 *
 * This lives outside the component because two surfaces ask the same question
 * and must not answer it differently: the Nutrition tab lists the gaps, and the
 * record's tab bar shows how many there are. A tab reading "9" beside a page
 * listing seven is worse than neither.
 */

/**
 * The fields a dietitian fills in on the Nutrition tab, in the order the gaps
 * card offers them.
 *
 * Listed here rather than derived from {@link ClientIntakeValues}, deliberately:
 * that type also carries `dateOfBirth`, `sex` and `hasProfile`, none of which
 * are answerable from this screen. Counting them would report gaps whose own
 * "add" link cannot close them — which is exactly the bug the intake
 * unification was undertaken to fix, reintroduced one level up.
 *
 * `dailyKcalTarget` and `proteinTargetGrams` are also absent, and that is not an
 * oversight: both fall back to a computed suggestion, so an empty column there
 * is a value the record already has rather than one it is missing.
 */
export const INTAKE_GAP_FIELDS = [
  'heightCm',
  'weightKg',
  'goal',
  'activityLevel',
  'allergies',
  'conditions',
  'medications',
  'permanentInstructions',
  'preferences',
  'dislikes',
  'medicalNotes',
  'notes',
] as const;

export type IntakeGapField = (typeof INTAKE_GAP_FIELDS)[number];

/** How many fields the record could hold — the denominator of the meter. */
export const INTAKE_FIELD_COUNT = INTAKE_GAP_FIELDS.length;

/**
 * Empty is null, an empty string, or whitespace only.
 *
 * The trim matters: a textarea someone tabbed through and left holding a
 * newline is not a recorded preference, and counting it as one makes the meter
 * quietly wrong in the direction that stops anyone acting on it.
 */
function isBlank(value: string | number | null): boolean {
  if (value === null) return true;
  if (typeof value === 'number') return false;
  return value.trim() === '';
}

/** The blank fields, in {@link INTAKE_GAP_FIELDS} order. */
export function intakeGaps(intake: ClientIntakeValues): IntakeGapField[] {
  return INTAKE_GAP_FIELDS.filter((field) => isBlank(intake[field]));
}
