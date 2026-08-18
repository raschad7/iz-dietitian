'use client';

import { useActionState, useRef, useState, type ChangeEvent, type FocusEvent, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { completeClinicOnboardingAction } from '../actions';
import { readClinicProfileForm } from '../form-data';
import { initialClinicProfileFormState } from '../form-state';
import type { ClinicProfileSnapshot } from '../types';
import { validateClinicProfile, type ClinicProfileFieldErrors, type ProfileSection } from '../validation';
import {
  clearFieldError,
  errorKeyForControl,
  isDeliberateFinish,
  validateWizardSubmission,
  FINISH_BUTTON_ID,
  type SectionErrors,
} from '../wizard-validation';
import { ClinicInformationFields, ProfessionalFields, ScheduleFields } from './profile-fields';

/**
 * The three things a clinic has to say before it can be worked in.
 *
 * Same fields, same order and the same shared controls as `/app/profile` — it
 * is the same clinic being described, and the two screens should not teach the
 * reader two different forms. The differences are the ones the situation earns:
 * one form posted once at the end rather than three saved separately, a step
 * indicator, and Back/Continue instead of Save.
 *
 * All three sections stay mounted, with the inactive ones `hidden`, because the
 * submit posts a single `FormData` carrying the whole clinic. Stepping is a
 * change of what is on screen, not of what exists.
 *
 * ## When a field is allowed to turn red
 *
 * This is the part that was wrong, and it was wrong in a way that made the form
 * feel like it was accusing the reader of mistakes they had not made yet.
 *
 * There was **one** error bag for the whole wizard, and every path that wrote
 * to it wrote a whole section's worth at once: `validateClinicProfile` returns
 * *every* blank required field in a section, so a single press of Continue or
 * Finish painted four boxes red — including the ones the reader simply had not
 * reached. Worse, the recovery path moved `step` to whichever section the bag
 * belonged to, so pressing Finish on the professional step could throw you back
 * two steps into a screen full of red, and because the validator stops at the
 * first failing section you then had to do it again to discover the next one.
 * Arriving on a step and finding it already marked wrong is the symptom that
 * gets reported; the shared bag and the whole-section write are the cause.
 *
 * What replaces it:
 *
 * - **Errors are kept per section** ({@link SectionErrors}) and only the
 *   section on screen is ever handed any. Nothing another step discovered can
 *   surface on this one, and stepping away no longer discards what was found.
 * - **Leaving a field checks only that field, and only if there is something in
 *   it.** An empty box is "not filled in yet", which is not a mistake; a
 *   malformed email is, and is reported the moment you leave it rather than
 *   being saved up for the end.
 * - **Required is reported when a step is left**, which is the first moment the
 *   reader has actually claimed to be finished with it.
 * - **Continue never moves you anywhere except forward.** Only Finish relocates
 *   the step, because only Finish is a claim about all three, and it now marks
 *   every failing section at once instead of one per press.
 * - **Correcting a field drops its error immediately**, through the same
 *   `onChange`/`onEdit` pair as before.
 */

const SECTIONS = ['clinic', 'schedule', 'professional'] as const;

const SECTION_ICONS = {
  clinic: 'contact',
  schedule: 'clock',
  professional: 'profile',
} as const satisfies Record<ProfileSection, IconName>;

/** Replaces one section's bag, dropping the entry entirely when it empties. */
function withSection(
  current: SectionErrors,
  section: ProfileSection,
  fieldErrors: ClinicProfileFieldErrors,
): SectionErrors {
  const next = { ...current };
  if (Object.keys(fieldErrors).length === 0) delete next[section];
  else next[section] = fieldErrors;
  return next;
}

export function OnboardingWizard({ locale, profile }: { locale: Locale; profile: ClinicProfileSnapshot }) {
  const t = useTranslations('clinicProfile');
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<SectionErrors>({});
  /**
   * The one section whose errors may currently be drawn.
   *
   * ⚠ **This is the guard that makes "arriving at a step is never red" true by
   * construction, and it exists because two attempts to make it true by
   * reasoning both failed.** The first kept errors per section and trusted that
   * nothing would write to a section the reader was not on; the second cleared
   * `required` on the way in and trusted that the remaining keys were all
   * legitimate. Both were arguments about which code path could run when, and
   * both were wrong in a way that put a red box in front of someone who had
   * typed nothing.
   *
   * So display no longer depends on that argument. A section's errors are drawn
   * only while it is *revealed*, and a section becomes revealed at exactly the
   * three moments the reader asks to be checked: pressing Continue on it,
   * pressing Finish, or leaving a field on it with something wrong in it.
   * Changing step clears the flag unconditionally, so no path — present or
   * future, client or server — can leave a mark waiting on a step the reader
   * has not worked on yet.
   *
   * `errors` is still cleared on entry as well. Either mechanism alone would
   * do; keeping both means a mistake in one is not a bug in the product.
   */
  const [revealed, setRevealed] = useState<ProfileSection | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  /**
   * When the wizard last changed step, so a submit can be told apart from the
   * interaction that changed it. `isDeliberateFinish` is where this is read and
   * why it exists; `0` means "no arrival yet", which is correct on first render
   * because step 0 has no submit control at all.
   */
  const stepChangedAt = useRef(0);

  const currentSection = SECTIONS[step] ?? 'clinic';
  const visibleErrors = revealed === currentSection ? errors[currentSection] : undefined;

  async function submitWithRecovery(previous: typeof initialClinicProfileFormState, formData: FormData) {
    const result = await completeClinicOnboardingAction(previous, formData);
    if (result.status === 'error' && result.messageKey === 'invalid') {
      // The client already checks all three before submitting, so reaching here
      // means the server saw something the browser could not — a stale form, or
      // a value changed in another tab. Show it where it belongs and go there.
      goToSection(result.section, { [result.section]: result.fieldErrors });
    }
    return result;
  }

  const [state, action, pending] = useActionState(submitWithRecovery, initialClinicProfileFormState);

  function focusFirstInvalid(): void {
    window.setTimeout(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }, 0);
  }

  function goToSection(section: ProfileSection, failures: SectionErrors): void {
    const index = SECTIONS.indexOf(section);
    stepChangedAt.current = performance.now();
    setStep(index < 0 ? 0 : index);
    setErrors(failures);
    // The one arrival that *is* a verdict: the reader pressed Finish, or the
    // server refused the write. Reveal the section they are being sent to.
    setRevealed(section);
    focusFirstInvalid();
  }

  /**
   * Moves to a step the reader asked for, and hands it over unmarked.
   *
   * ⚠ **Walking onto a step never shows red. That is an invariant, not a
   * filter.** An earlier attempt kept the section's errors and dropped only the
   * ones whose message was `required`, on the theory that a genuinely malformed
   * value should stay flagged across a step change. It was too clever: it made
   * "is this step clean when I arrive?" depend on which message happened to be
   * stored, so the answer had to be re-derived every time a message key was
   * added, and it left the professional step still wearing red from a Finish
   * the reader had already walked away from.
   *
   * Clearing the whole section is both simpler and more honest. Arriving
   * somewhere is not an act of validation, so it should produce no verdict —
   * and nothing is lost, because every real fault is found again the instant
   * the reader blurs the field or presses Continue or Finish. The worst case is
   * that a bad value goes unmarked for the few seconds before it is touched,
   * which is exactly how the form treats a bad value the reader has not reached
   * yet.
   *
   * `goToSection` above deliberately does *not* go through here: being sent to
   * a step by a failed Finish is the one arrival where the fields are the whole
   * message.
   */
  function enterStep(index: number): void {
    const entering = SECTIONS[index];
    stepChangedAt.current = performance.now();
    setStep(index);
    setRevealed(null);
    if (entering) setErrors((current) => withSection(current, entering, {}));
  }

  /**
   * Continue: check this step, and this step only.
   *
   * A failure keeps the reader where they are — the fields that need attention
   * are the ones already on screen — so unlike Finish there is no relocation
   * and no chance of landing somewhere unexpected.
   */
  function continueToNextStep(): void {
    if (!formRef.current) return;

    const result = validateClinicProfile(
      readClinicProfileForm(new FormData(formRef.current)),
      [currentSection],
    );

    if (!result.success) {
      setErrors((current) => withSection(current, currentSection, result.fieldErrors));
      setRevealed(currentSection);
      focusFirstInvalid();
      return;
    }
    setErrors((current) => withSection(current, currentSection, {}));
    enterStep(Math.min(step + 1, SECTIONS.length - 1));
  }

  function validateBeforeSubmit(event: FormEvent<HTMLFormElement>): void {
    /*
      ⚠ **Only a press of the Finish button is a request to finish. Everything
      else that raises a submit here is swallowed.**

      `isDeliberateFinish` holds the reasoning, including why the previous
      version of this guard — "was the submit raised from the last step?" — let
      the reported bug straight through: the footer's Continue and Finish are one
      DOM node whose `type` flips to `submit` the instant Continue lands on step
      3, so a stray submit arrives with `step` already at 2 and passes a step
      check. Asking for the submitter, and for the arrival not to have just
      happened, is what actually separates a decision from an echo.

      `preventDefault` alone, with no validation, no error written and no step
      change, means such a submit does nothing at all rather than teleporting
      someone into a screen of red.
    */
    const submitter = (event.nativeEvent as SubmitEvent).submitter;

    if (
      !isDeliberateFinish({
        submitterId: submitter?.id ?? null,
        onLastStep: step === SECTIONS.length - 1,
        sinceStepChange: performance.now() - stepChangedAt.current,
      })
    ) {
      event.preventDefault();
      return;
    }

    const decision = validateWizardSubmission(new FormData(event.currentTarget));
    if (!decision.submit) {
      event.preventDefault();
      goToSection(decision.firstSection, decision.failures);
      return;
    }
    setErrors({});
  }

  /**
   * Drops an error the moment the field carrying it is corrected.
   *
   * The `onChange` path only ever sees real `<input>`s. The schedule has none —
   * its switch is a button and its times post through hidden inputs — and the
   * two selects are buttons too, so both report their own edits through
   * `onEdit` into this same function.
   */
  function clearError(controlName: string): void {
    if (!controlName) return;
    setErrors((current) =>
      withSection(current, currentSection, clearFieldError(current[currentSection] ?? {}, controlName)),
    );
  }

  function clearCorrectedField(event: ChangeEvent<HTMLFormElement>): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    clearError(event.target.name);
  }

  /**
   * Checks a single field as the reader leaves it.
   *
   * Only the field that was left, and only when it holds something. Tabbing
   * through an empty form must not light it up, but a mistyped address should
   * not wait until the foot of the step to say so.
   */
  function checkFieldOnBlur(event: FocusEvent<HTMLFormElement>): void {
    const control = event.target;
    if (!(control instanceof HTMLInputElement) || !control.name) return;
    if (!formRef.current) return;

    const data = new FormData(formRef.current);
    const key = errorKeyForControl(control.name);
    const value = data.get(control.name);

    if (typeof value !== 'string' || value.trim() === '') {
      clearError(control.name);
      return;
    }

    const result = validateClinicProfile(readClinicProfileForm(data), [currentSection]);
    const message = result.success ? undefined : result.fieldErrors[key];

    // Leaving a field with something wrong in it is the reader asking about
    // that field, so the section earns its reveal here too. Leaving a field
    // that is fine reveals nothing.
    if (message) setRevealed(currentSection);

    setErrors((current) => {
      const section = current[currentSection] ?? {};
      if (!message) return withSection(current, currentSection, clearFieldError(section, control.name));
      return withSection(current, currentSection, { ...section, [key]: message });
    });
  }

  const isLastStep = step === SECTIONS.length - 1;

  return (
    /*
      Centred, unlike the staff pages: onboarding runs on its own route with no
      rail, so there is nothing for the column to be detached from. See
      "Layout" in docs/design-system.md for why `/app/*` hangs its column from
      the inline-start instead.
    */
    <div className="mx-auto w-full max-w-3xl py-8 text-start sm:py-12">
      {/*
        `display-sm` rather than `display-lg`.

        The scale lists `display-lg` for "covers and onboarding" and this is
        onboarding, but it is also a form the reader will sit in for a few
        minutes, and 40px over a card of 48px fields made the page read as a
        marketing splash rather than as part of the application. `display-sm` is
        the same step the dashboard's own screen titles use, which is the point:
        this is the first screen of the app, not a doorway to it.
      */}
      <div className="mb-6 space-y-2">
        <h1 className="font-heading text-heading-lg tracking-tight sm:text-display-sm">
          {t('onboardingTitle')}
        </h1>
        <p className="max-w-2xl text-body-sm text-muted-foreground sm:text-body-md">
          {t('onboardingDescription')}
        </p>
      </div>

      <Steps step={step} />

      <form
        ref={formRef}
        action={action}
        noValidate
        onSubmit={validateBeforeSubmit}
        onChange={clearCorrectedField}
        onBlur={checkFieldOnBlur}
      >
        <input type="hidden" name="locale" value={locale} />

        <Card>
          <CardHeader>
            <CardTitle as="h2">{t(`sections.${currentSection}`)}</CardTitle>
            <CardDescription>{t(`sectionDescriptions.${currentSection}`)}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {/*
              Each section is handed only its own bag. Before, all three read
              from one shared object, so an error raised while leaving a
              different step could paint a field on this one.
            */}
            {/*
              `visibleErrors` and not `errors[...]`: only the revealed section
              draws anything, and only while it is the section on screen. The
              two hidden sections are handed `undefined` no matter what is
              stored for them, which is what makes walking onto a step
              unconditionally clean.
            */}
            <div className={step === 0 ? 'block' : 'hidden'}>
              <ClinicInformationFields profile={profile} fieldErrors={visibleErrors} />
            </div>
            <div className={step === 1 ? 'block' : 'hidden'}>
              <ScheduleFields profile={profile} fieldErrors={visibleErrors} onEdit={clearError} />
            </div>
            <div className={step === 2 ? 'block' : 'hidden'}>
              <ProfessionalFields
                profile={profile}
                fieldErrors={visibleErrors}
                onEdit={clearError}
              />
            </div>

            {/*
              **No "check the highlighted fields" banner.** It sat here restating
              in a coloured box what the form was already saying precisely, in
              place, under each field that needed it — and it said it in the
              vaguest available terms, so the one line that was impossible to act
              on was also the loudest thing on the card. The field messages and
              the focus jump to the first bad field are the whole feedback now.

              A server-side failure still gets a banner below, because that one
              is about the request rather than about a field, and there is
              nowhere else on the page for it to live.
            */}
            {state.status === 'error' && state.messageKey !== 'invalid' ? (
              <Callout role="alert" tone="attention">
                {t(`messages.${state.messageKey}`)}
              </Callout>
            ) : null}
          </CardContent>

          <CardFooter className="justify-between gap-3">
            {/*
              Back holds its place on the first step rather than appearing on
              the second: a footer that grows a button mid-flow moves Continue
              sideways at the moment the pointer is heading for it.
            */}
            <Button
              type="button"
              variant="ghost"
              disabled={step === 0 || pending}
              onClick={() => enterStep(Math.max(step - 1, 0))}
            >
              <Icon name="chevronStart" />
              {t('back')}
            </Button>

            {/*
              `default` — olive, the primary action colour — and not `accent`.
              Lime is documented as a scarce fill rather than the colour of a
              decision, and this button is the same kind of act as Continue: the
              one that commits the step you are on. Wearing a different colour
              for the last of three made the flow change its mind about which
              hue means "go" on the final screen.
            */}
            {/*
              The `id` is not decoration: `validateBeforeSubmit` identifies a
              real Finish press by `SubmitEvent.submitter`, and this is what it
              matches against. Removing it turns Finish into a button that
              submits nothing.
            */}
            {isLastStep ? (
              <Button id={FINISH_BUTTON_ID} type="submit" disabled={pending}>
                {pending ? t('saving') : t('finish')}
              </Button>
            ) : (
              <Button type="button" onClick={continueToNextStep}>
                {t('next')}
                <Icon name="chevronEnd" />
              </Button>
            )}
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}

/**
 * Where you are in the three steps.
 *
 * **Done, current and ahead are drawn differently**, which the bar this
 * replaces did not do: `index <= step` gave the step you are on and the steps
 * you finished the same olive rule and the same black label, so the indicator
 * showed progress without ever showing position.
 *
 * The marker is a numbered disc rather than a section glyph. A contact card, a
 * clock and a person say what each step is *about*, which the label beside them
 * already says in words; what the reader actually wants from an indicator is
 * how far along they are, and three icons cannot express "second of three". The
 * number does, a check replaces it once the step is behind you, and
 * `aria-current="step"` states the position outright for anyone the colour and
 * the numbering do not reach.
 *
 * `text-label` (13px) rather than `text-caption`: which step you are on is not
 * fine print, and 12px is the floor the design system reserves for things
 * nobody needs to read.
 */
function Steps({ step }: { step: number }) {
  const t = useTranslations('clinicProfile');

  return (
    <div className="mb-5 space-y-2">
      <p className="text-caption text-muted-foreground">
        {t('stepIndicator', { current: step + 1, total: SECTIONS.length })}
      </p>

      <ol className="grid grid-cols-3 gap-2" aria-label={t('progress')}>
        {SECTIONS.map((section, index) => {
          const done = index < step;
          const current = index === step;
          const reached = done || current;

          return (
            <li
              key={section}
              aria-current={current ? 'step' : undefined}
              className="flex min-w-0 flex-col gap-2"
            >
              {/*
                The track. A 3px rule rather than a `border-t-2` on the row, so
                the filled and unfilled states differ by colour on the same
                shape — a border that changes width would move the label under
                it by a pixel as you advance.
              */}
              <span
                aria-hidden
                className={cn(
                  'h-0.75 rounded-full transition-colors',
                  reached ? 'bg-primary' : 'bg-border',
                )}
              />

              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-full text-label tabular-nums transition-colors',
                    current
                      ? 'bg-primary text-primary-foreground'
                      : done
                        ? 'bg-primary/12 text-primary'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {done ? <Icon name="check" className="size-3.5" /> : index + 1}
                </span>

                {/*
                  The section glyph is gone from the marker but kept here at
                  17px beside the label on wide screens, where there is room for
                  it to be a hint rather than the only thing distinguishing
                  three discs. It is the first thing dropped when the column
                  narrows, because the words matter more.
                */}
                <Icon
                  name={SECTION_ICONS[section]}
                  className={cn(
                    'hidden size-[17px] shrink-0 sm:block',
                    reached ? 'text-primary' : 'text-muted-foreground',
                  )}
                />

                <span
                  className={cn(
                    'truncate text-label',
                    current ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {t(`sections.${section}`)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
