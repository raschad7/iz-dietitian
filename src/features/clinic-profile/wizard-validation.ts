import { readClinicProfileForm } from './form-data';
import {
  validateEverySection,
  type ClinicProfileFieldErrors,
  type ProfileSection,
} from './validation';

export type SectionErrors = Partial<Record<ProfileSection, ClinicProfileFieldErrors>>;

export type WizardSubmissionDecision =
  | { submit: true }
  | { submit: false; failures: SectionErrors; firstSection: ProfileSection };

/**
 * Stops an invalid wizard before React's form action can reset its fields.
 *
 * It reports **every** failing section rather than the first, because the
 * button it guards says "Finish setup": someone pressing it has declared they
 * are done with all three steps, so the honest answer is everything still
 * outstanding, not the earliest of it. `firstSection` is only where to send
 * them to start.
 */
export function validateWizardSubmission(formData: FormData): WizardSubmissionDecision {
  const failures = validateEverySection(readClinicProfileForm(formData));
  const firstSection = (Object.keys(failures) as ProfileSection[])[0];

  return firstSection ? { submit: false, failures, firstSection } : { submit: true };
}

/**
 * The id the wizard's Finish button carries, so a submit can be traced back to
 * it. `SubmitEvent.submitter` is the browser's own answer to "what did the
 * reader press", and it is the only trustworthy one — see
 * {@link isDeliberateFinish}.
 */
export const FINISH_BUTTON_ID = 'wizard-finish';

/**
 * How long after a step change a submit is still treated as part of the
 * interaction that changed it, rather than as a new decision.
 *
 * Long enough to cover a double click (the platform's own threshold is around
 * 500ms) and a key repeat, short enough that nobody who genuinely arrives on the
 * last step and presses Finish is inside it — reaching the button at all takes
 * longer than this, and the step has two required fields to answer first.
 */
export const ARRIVAL_GRACE_MS = 600;

export type FinishAttempt = {
  /** `SubmitEvent.submitter`'s id, or `null` for an implicit submission. */
  submitterId: string | null;
  /** Whether the professional step — the only one Finish lives on — is on screen. */
  onLastStep: boolean;
  /** Milliseconds since the wizard last changed step. */
  sinceStepChange: number;
};

/**
 * Whether a submit event is the reader saying "I am done with all three steps".
 *
 * ⚠ **This is the fourth attempt at "arriving on step 3 must never be red", and
 * the first three all failed the same way: they asked *where the reader is*
 * instead of *what the reader pressed*.** The one before this swallowed any
 * submit raised from a step other than the last, which sounds airtight and is
 * not, because of how the footer is built. Continue and Finish are one `Button`
 * in one JSX slot, so React does not swap the element — it keeps the same
 * `<button>` and flips `type` from `button` to `submit`. The moment Continue
 * advances the wizard to step 3, the node still under the pointer *is* the
 * form's submit control, and `step` is already 2. So the second half of a double
 * click, a held Enter repeating, or an implicit submission that suddenly has a
 * submit button to aim at all sail through a step check, and
 * `validateWizardSubmission` then reports the professional step the reader has
 * not touched — two red selects on arrival, which is the bug as reported.
 *
 * Three facts have to hold, and each one closes a different route:
 *
 * - **The submitter is the Finish button.** An implicit submission (`Enter` in a
 *   text box) reports `null`, and any other control reports itself, so neither
 *   can pass as a decision to finish.
 * - **The professional step is on screen.** Unchanged from before, and still
 *   worth stating: Finish exists nowhere else.
 * - **The step did not just change.** A submit inside {@link ARRIVAL_GRACE_MS}
 *   of an arrival belongs to the interaction that caused the arrival, whatever
 *   that interaction was. This is the part that does not depend on knowing which
 *   route fired — it closes the class, not one member of it.
 *
 * A submit that fails any of the three is swallowed whole: no validation, no
 * error written, no step change. Nothing was asked, so nothing is answered.
 */
export function isDeliberateFinish({
  submitterId,
  onLastStep,
  sinceStepChange,
}: FinishAttempt): boolean {
  return (
    onLastStep && submitterId === FINISH_BUTTON_ID && sinceStepChange >= ARRIVAL_GRACE_MS
  );
}

/**
 * The error key a form control carries.
 *
 * Most controls are named after the error they can raise. The two that are not
 * are the text boxes "أخرى" reveals: `professionalTitleCustom` posts alongside
 * the select but the failure belongs to `professionalTitle`, because from the
 * reader's side there is one question being answered in two parts.
 */
const ERROR_KEY_BY_CONTROL: Record<string, string> = {
  professionalTitleCustom: 'professionalTitle',
  specialtyCustom: 'specialty',
};

export function errorKeyForControl(controlName: string): string {
  return ERROR_KEY_BY_CONTROL[controlName] ?? controlName;
}

/**
 * Drops the errors a change to `fieldName` could have fixed.
 *
 * Three of the schedule's messages are about something wider than the box that
 * carries them, so correcting one field has to clear more than its own name:
 *
 * - `workingDayRequired` is keyed on `schedule` and answered by turning *any*
 *   day on.
 * - `closingAfterOpening` is keyed on `close-N` but is a fact about the pair —
 *   moving the opening time is just as valid a fix, so either end clears both.
 * - `schedule` itself is what "apply these hours to every day" reports, and
 *   that rewrites all seven rows at once, so it clears every time error too.
 */
export function clearFieldError(
  fieldErrors: ClinicProfileFieldErrors,
  fieldName: string,
): ClinicProfileFieldErrors {
  if (fieldName === 'schedule') {
    return Object.fromEntries(
      Object.entries(fieldErrors).filter(([name]) => !/^(?:schedule|open-\d|close-\d)$/.test(name)),
    );
  }

  const related = new Set([errorKeyForControl(fieldName)]);

  if (fieldName.startsWith('working-')) related.add('schedule');

  const dayPair = /^(?:open|close)-(\d)$/.exec(fieldName);
  if (dayPair) {
    related.add(`open-${dayPair[1]}`);
    related.add(`close-${dayPair[1]}`);
  }

  return Object.fromEntries(Object.entries(fieldErrors).filter(([name]) => !related.has(name)));
}
