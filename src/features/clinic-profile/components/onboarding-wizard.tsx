'use client';

import { useActionState, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
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
import { clearFieldError, validateWizardSubmission } from '../wizard-validation';
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
 */

const SECTIONS = ['clinic', 'schedule', 'professional'] as const;

const SECTION_ICONS = {
  clinic: 'contact',
  schedule: 'clock',
  professional: 'profile',
} as const satisfies Record<ProfileSection, IconName>;

export function OnboardingWizard({ locale, profile }: { locale: Locale; profile: ClinicProfileSnapshot }) {
  const t = useTranslations('clinicProfile');
  const [step, setStep] = useState(0);
  const [clientError, setClientError] = useState<{ section: ProfileSection; fieldErrors: ClinicProfileFieldErrors } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function submitWithRecovery(previous: typeof initialClinicProfileFormState, formData: FormData) {
    const result = await completeClinicOnboardingAction(previous, formData);
    if (result.status === 'error' && result.messageKey === 'invalid') {
      const invalidStep = SECTIONS.indexOf(result.section);
      setStep(invalidStep < 0 ? 0 : invalidStep);
      setClientError({ section: result.section, fieldErrors: result.fieldErrors });
      window.setTimeout(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      }, 0);
    }
    return result;
  }

  const [state, action, pending] = useActionState(submitWithRecovery, initialClinicProfileFormState);
  const currentSection = SECTIONS[step] ?? 'clinic';
  const activeError = clientError?.section === currentSection ? clientError : null;

  function showValidationError(error: { section: ProfileSection; fieldErrors: ClinicProfileFieldErrors }) {
    const invalidStep = SECTIONS.indexOf(error.section);
    setStep(invalidStep < 0 ? 0 : invalidStep);
    setClientError(error);
    window.setTimeout(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }, 0);
  }

  function continueToNextStep() {
    if (!formRef.current) return;
    const result = validateClinicProfile(readClinicProfileForm(new FormData(formRef.current)), [currentSection]);
    if (!result.success) {
      showValidationError({ section: result.section, fieldErrors: result.fieldErrors });
      return;
    }
    setClientError(null);
    setStep((value) => Math.min(value + 1, SECTIONS.length - 1));
  }

  function validateBeforeSubmit(event: FormEvent<HTMLFormElement>) {
    const decision = validateWizardSubmission(new FormData(event.currentTarget));
    if (!decision.submit) {
      event.preventDefault();
      showValidationError(decision);
      return;
    }
    setClientError(null);
  }

  /**
   * Drops an error the moment the field carrying it is corrected.
   *
   * The `onChange` path only ever sees real `<input>`s. The schedule has none —
   * its switch is a button and its times post through hidden inputs — so it
   * reports its own edits through `onEdit` into the same function. Without that
   * second route, fixing a day's closing time left the error under it until the
   * next Continue.
   */
  function clearError(fieldName: string) {
    if (!fieldName) return;
    setClientError((current) => {
      if (!current) return null;
      const fieldErrors = clearFieldError(current.fieldErrors, fieldName);
      return Object.keys(fieldErrors).length > 0 ? { ...current, fieldErrors } : null;
    });
  }

  function clearCorrectedField(event: ChangeEvent<HTMLFormElement>) {
    if (!(event.target instanceof HTMLInputElement)) return;
    clearError(event.target.name);
  }

  const isLastStep = step === SECTIONS.length - 1;

  return (
    /*
      Centred, unlike the staff pages: onboarding runs on its own route with no
      rail, so there is nothing for the column to be detached from. See
      "Spacing" in docs/design-system.md for why `/app/*` hangs its column from
      the inline-start instead.
    */
    <div className="mx-auto w-full max-w-3xl py-8 text-start sm:py-12">
      {/*
        No eyebrow. It read "Clinic setup" in uppercase letter-spaced 12px
        directly above a heading that says "Set up your clinic" — the same
        sentence twice, the second one quieter, and its tracking is stripped
        under `:lang(ar)` so the two locales did not match either.

        The heading is the scale's own display steps rather than `text-3xl
        sm:text-4xl`: identical sizes, but each step brings its own leading and
        weight, and onboarding is the use `display-lg` is listed for.
      */}
      <div className="mb-8 space-y-2">
        <h1 className="font-heading text-display-sm tracking-tight sm:text-display-lg">
          {t('onboardingTitle')}
        </h1>
        <p className="max-w-2xl text-body-md text-muted-foreground">{t('onboardingDescription')}</p>
      </div>

      <Steps step={step} />

      <form
        ref={formRef}
        action={action}
        noValidate
        onSubmit={validateBeforeSubmit}
        onChange={clearCorrectedField}
      >
        <input type="hidden" name="locale" value={locale} />

        <Card>
          <CardHeader>
            <CardTitle as="h2">{t(`sections.${currentSection}`)}</CardTitle>
            <CardDescription>{t(`sectionDescriptions.${currentSection}`)}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className={step === 0 ? 'block' : 'hidden'}>
              <ClinicInformationFields profile={profile} fieldErrors={activeError?.fieldErrors} />
            </div>
            <div className={step === 1 ? 'block' : 'hidden'}>
              <ScheduleFields
                profile={profile}
                fieldErrors={activeError?.fieldErrors}
                onEdit={clearError}
              />
            </div>
            <div className={step === 2 ? 'block' : 'hidden'}>
              <ProfessionalFields profile={profile} fieldErrors={activeError?.fieldErrors} />
            </div>

            {/*
              `Callout`, the shape the system gives a statement the reader has
              to notice — these were two hand-rolled `text-sm text-destructive`
              paragraphs with nothing but colour to separate them from the form.
              `attention` and not clay: clay is the only alarm this palette has
              and it belongs to real medical facts, which "check the highlighted
              fields" is not.
            */}
            {activeError ? (
              <Callout role="alert" tone="attention">
                {t('messages.invalid')}
              </Callout>
            ) : null}

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
              onClick={() => setStep((value) => value - 1)}
            >
              <Icon name="chevronStart" />
              {t('back')}
            </Button>

            {isLastStep ? (
              <Button type="submit" variant="accent" disabled={pending}>
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
 * **Done and current are drawn differently**, which the bar it replaces did not
 * do: `index <= step` gave the step you are on and the steps you finished the
 * same olive rule and the same black label, so the indicator showed progress
 * without ever showing position. Done is olive and quiet, current is olive and
 * loud, ahead is a hairline — and `aria-current="step"` says it outright for
 * anyone the colour does not reach.
 *
 * `text-label` (13px) rather than `text-xs`: which step you are on is not
 * fine print, and 12px is the floor the design system reserves for things
 * nobody needs to read.
 */
function Steps({ step }: { step: number }) {
  const t = useTranslations('clinicProfile');

  return (
    <ol className="mb-6 grid grid-cols-3 gap-2" aria-label={t('progress')}>
      {SECTIONS.map((section, index) => {
        const done = index < step;
        const current = index === step;

        return (
          <li
            key={section}
            aria-current={current ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2 border-t-2 pt-2 text-label',
              current
                ? 'border-primary text-foreground'
                : done
                  ? 'border-primary text-muted-foreground'
                  : 'border-border text-muted-foreground',
            )}
          >
            {/*
              A check once the step is behind you, its own glyph while you are
              on it, and the same glyph muted ahead — so the row reads as a
              path rather than as three labels sharing a rule.
            */}
            <Icon
              name={done ? 'check' : SECTION_ICONS[section]}
              className={cn('size-4 shrink-0', (done || current) && 'text-primary')}
            />
            <span className="truncate">{t(`sections.${section}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}
