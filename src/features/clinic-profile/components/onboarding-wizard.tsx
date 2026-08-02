'use client';

import { useActionState, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { completeClinicOnboardingAction } from '../actions';
import { readClinicProfileForm } from '../form-data';
import { initialClinicProfileFormState } from '../form-state';
import type { ClinicProfileSnapshot } from '../types';
import { validateClinicProfile, type ClinicProfileFieldErrors, type ProfileSection } from '../validation';
import { clearFieldError, validateWizardSubmission } from '../wizard-validation';
import { ClinicInformationFields, ProfessionalFields, ScheduleFields } from './profile-fields';

const SECTIONS = ['clinic', 'schedule', 'professional'] as const;

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

  function clearCorrectedField(event: ChangeEvent<HTMLFormElement>) {
    if (!(event.target instanceof HTMLInputElement)) return;
    const fieldName = event.target.name;
    if (!fieldName) return;
    setClientError((current) => {
      if (!current) return null;
      const fieldErrors = clearFieldError(current.fieldErrors, fieldName);
      return Object.keys(fieldErrors).length > 0 ? { ...current, fieldErrors } : null;
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl py-8 sm:py-12">
      <div className="mb-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('eyebrow')}</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">{t('onboardingTitle')}</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">{t('onboardingDescription')}</p>
      </div>

      <ol className="mb-6 grid grid-cols-3 gap-2" aria-label={t('progress')}>
        {SECTIONS.map((section, index) => (
          <li key={section} className={cn('border-t-2 pt-2 text-xs font-medium', index <= step ? 'border-primary text-foreground' : 'border-border text-muted-foreground')}>
            {index + 1}. {t(`sections.${section}`)}
          </li>
        ))}
      </ol>

      <form ref={formRef} action={action} noValidate onSubmit={validateBeforeSubmit} onChange={clearCorrectedField}>
        <input type="hidden" name="locale" value={locale} />
        <Card>
          <CardHeader>
            <CardTitle>{t(`sections.${currentSection}`)}</CardTitle>
            <CardDescription>{t(`sectionDescriptions.${currentSection}`)}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={step === 0 ? 'block' : 'hidden'}><ClinicInformationFields profile={profile} fieldErrors={activeError?.fieldErrors} /></div>
            <div className={step === 1 ? 'block' : 'hidden'}><ScheduleFields profile={profile} fieldErrors={activeError?.fieldErrors} /></div>
            <div className={step === 2 ? 'block' : 'hidden'}><ProfessionalFields profile={profile} fieldErrors={activeError?.fieldErrors} /></div>
            {activeError ? <p role="alert" className="mt-4 text-sm font-medium text-destructive">{t('messages.invalid')}</p> : null}
            {state.status === 'error' && state.messageKey !== 'invalid' ? <p role="alert" className="mt-4 text-sm text-destructive">{t(`messages.${state.messageKey}`)}</p> : null}
          </CardContent>
          <CardFooter className="justify-between gap-3">
            <Button type="button" variant="ghost" disabled={step === 0 || pending} onClick={() => setStep((value) => value - 1)}>{t('back')}</Button>
            {step < 2
              ? <Button type="button" onClick={continueToNextStep}>{t('next')}</Button>
              : <Button type="submit" variant="accent" disabled={pending}>{pending ? t('saving') : t('finish')}</Button>}
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
