import { type IntakeGapField } from './intake-gaps';

/**
 * The intake dialog's sections, and which field belongs to which.
 *
 * Lives outside `intake-form.tsx` because two surfaces need it and only one of
 * them is the form: the Nutrition tab's gap chips open the dialog *on the
 * section that holds the field they name*, and a server component cannot import
 * a `'use client'` module to find out which that is. Same reason
 * `intake-gaps.ts` sits apart from the card that renders it.
 *
 * A chip reading "الحساسية" that opened on القياسات was a link that answered a
 * different question from the one it was asked — the reader still had to find
 * the section themselves, and the dialog's first panel had nothing to do with
 * what they clicked.
 */
export const INTAKE_SECTIONS = [
  'measurements',
  'allergies',
  'clinical',
  'planning',
  'schedule',
] as const;

export type IntakeSectionId = (typeof INTAKE_SECTIONS)[number];

/** Which fields belong to which section, so a server error can open the right one. */
export const FIELDS_BY_SECTION: Record<IntakeSectionId, readonly string[]> = {
  measurements: ['heightCm', 'weightKg', 'goal', 'activityLevel'],
  allergies: ['allergenTags', 'allergies'],
  clinical: ['conditions', 'medications', 'medicalNotes'],
  planning: [
    'permanentInstructions',
    'preferences',
    'dislikes',
    'dailyKcalTarget',
    'proteinTargetGrams',
  ],
  schedule: ['mealSchedule'],
};

/**
 * Sections whose gaps the Nutrition card offers as one chip named after the
 * section, instead of one chip per missing field.
 *
 * Every section's fields sit on a single panel behind a single dialog — so a
 * chip apiece was four doors into one room, and on an empty record twelve of
 * them took most of the card to say what four section names say once. The meter
 * still counts fields: four blank values are four blank values however many
 * links close them.
 */
export const GROUPED_GAP_SECTIONS = [
  'measurements',
  'allergies',
  'clinical',
  'planning',
] as const;

export function isGroupedGapSection(section: IntakeSectionId): boolean {
  return (GROUPED_GAP_SECTIONS as readonly string[]).includes(section);
}

/**
 * The section a gap chip should open on.
 *
 * Falls back to `measurements` — the dialog's own first panel — rather than
 * throwing: a field added to {@link INTAKE_GAP_FIELDS} and not yet placed on a
 * panel should open a working dialog, not break the card.
 */
export function sectionForField(field: IntakeGapField): IntakeSectionId {
  return (
    INTAKE_SECTIONS.find((id) =>
      (FIELDS_BY_SECTION[id] as readonly string[]).includes(field),
    ) ?? 'measurements'
  );
}
