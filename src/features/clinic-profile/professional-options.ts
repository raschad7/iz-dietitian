/**
 * The titles a dietitian may hold and the fields they may specialise in.
 *
 * Both were free-text boxes, which is how one clinic ends up with "أخصائي
 * تغذية", "اخصائي تغذيه" and "Dietitian" describing the same job. They are
 * lists now, and the list is short enough to read in one pass.
 *
 * ## What is stored is the Arabic string, in both locales
 *
 * `value` is the database value and it does not change with the interface
 * language; `key` names the message that draws it. So an English-speaking
 * dietitian picks "Clinical Dietitian" and the column holds "أخصائي تغذية
 * سريرية", exactly as it would have if they had been reading Arabic.
 *
 * That asymmetry is deliberate. `practitioners.specialty` is rendered to
 * *clients* on the portal's clinic card, and a client's language is their own
 * setting — so a value that changed with whoever last edited the profile would
 * show two different specialties for one dietitian depending on who was
 * looking. One stored string, translated only where it is offered for
 * selection.
 *
 * ⚠ Changing a `value` here rewrites nothing already in the database. Existing
 * rows keep the old string and will be read back as a custom entry (see
 * {@link splitStoredValue}), which is recoverable but not free — treat these
 * strings as data, not copy.
 */

/**
 * The escape hatch. Selecting it reveals a text box, and *that* text is what is
 * stored — the literal word "أخرى" is never written to a practitioner row,
 * because a client reading "أخرى" under their dietitian's name learns nothing.
 */
export const OTHER_OPTION = 'أخرى';

export type ProfessionalOption = {
  /** Message key under `clinicProfile.titleOptions` / `clinicProfile.specialtyOptions`. */
  key: string;
  /** The stored value. Identical in Arabic and English. */
  value: string;
};

export const PROFESSIONAL_TITLE_OPTIONS = [
  { key: 'dietitian', value: 'أخصائي تغذية' },
  { key: 'therapeuticDietitian', value: 'أخصائي تغذية علاجية' },
  { key: 'clinicalDietitian', value: 'أخصائي تغذية سريرية' },
  { key: 'sportsDietitian', value: 'أخصائي تغذية رياضية' },
  { key: 'nutritionConsultant', value: 'مستشار تغذية' },
  { key: 'dietAndNutritionSpecialist', value: 'أخصائي حميات وتغذية' },
  { key: 'other', value: OTHER_OPTION },
] as const satisfies readonly ProfessionalOption[];

export const SPECIALTY_OPTIONS = [
  { key: 'nutritionAndTherapeutic', value: 'التغذية والتغذية العلاجية' },
  { key: 'therapeuticNutrition', value: 'التغذية العلاجية' },
  { key: 'clinicalNutrition', value: 'التغذية السريرية' },
  { key: 'nutritionSciences', value: 'علوم التغذية' },
  { key: 'humanNutrition', value: 'التغذية البشرية' },
  { key: 'sportsNutrition', value: 'التغذية الرياضية' },
  { key: 'foodAndNutritionSciences', value: 'علوم الغذاء والتغذية' },
  { key: 'other', value: OTHER_OPTION },
] as const satisfies readonly ProfessionalOption[];

/**
 * Whether a stored string is one of the offered rows.
 *
 * `OTHER_OPTION` is excluded on purpose: it is a row in the list but never a
 * value in the database, so a column that somehow holds it is legacy free text
 * and should come back as free text rather than as a selection.
 */
export function isListedOption(
  options: readonly ProfessionalOption[],
  value: string,
): boolean {
  return options.some((option) => option.value !== OTHER_OPTION && option.value === value);
}

/**
 * Splits a stored value into what the select shows and what the text box holds.
 *
 * Every practitioner saved before these lists existed holds free text — the
 * seed's "Clinical Dietitian", or anything typed into the old box. Rather than
 * silently dropping it on the next save, an unrecognised value selects "أخرى"
 * and fills the custom box with itself, so opening the profile and saving it
 * unchanged is a no-op instead of a data loss.
 */
export function splitStoredValue(
  options: readonly ProfessionalOption[],
  stored: string | null | undefined,
): { choice: string; custom: string } {
  const value = stored?.trim() ?? '';
  if (value === '') return { choice: '', custom: '' };
  return isListedOption(options, value)
    ? { choice: value, custom: '' }
    : { choice: OTHER_OPTION, custom: value };
}

/** The value a choice-plus-custom pair resolves to. */
export function resolveOptionValue(choice: unknown, custom: unknown): unknown {
  return choice === OTHER_OPTION ? custom : choice;
}
