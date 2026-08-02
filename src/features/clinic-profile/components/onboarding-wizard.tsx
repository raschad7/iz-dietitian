'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { completeClinicOnboardingAction } from '../actions';
import { initialClinicProfileFormState } from '../form-state';
import type { ClinicProfileSnapshot } from '../types';
import { ClinicInformationFields, ProfessionalFields, ScheduleFields } from './profile-fields';

const SECTIONS = ['clinic', 'schedule', 'professional'] as const;

export function OnboardingWizard({ locale, profile }: { locale: Locale; profile: ClinicProfileSnapshot }) {
  const t = useTranslations('clinicProfile');
  const [step, setStep] = useState(0);
  const [state, action, pending] = useActionState(completeClinicOnboardingAction, initialClinicProfileFormState);
  const currentSection = SECTIONS[step] ?? 'clinic';

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

      <form action={action}>
        <input type="hidden" name="locale" value={locale} />
        <Card>
          <CardHeader>
            <CardTitle>{t(`sections.${currentSection}`)}</CardTitle>
            <CardDescription>{t(`sectionDescriptions.${currentSection}`)}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={step === 0 ? 'block' : 'hidden'}><ClinicInformationFields profile={profile} /></div>
            <div className={step === 1 ? 'block' : 'hidden'}><ScheduleFields profile={profile} /></div>
            <div className={step === 2 ? 'block' : 'hidden'}><ProfessionalFields profile={profile} /></div>
            {state.status === 'error' ? <p role="alert" className="mt-4 text-sm text-destructive">{t(`messages.${state.messageKey}`)}</p> : null}
          </CardContent>
          <CardFooter className="justify-between gap-3">
            <Button type="button" variant="ghost" disabled={step === 0 || pending} onClick={() => setStep((value) => value - 1)}>{t('back')}</Button>
            {step < 2
              ? <Button type="button" onClick={() => setStep((value) => value + 1)}>{t('next')}</Button>
              : <Button type="submit" variant="accent" disabled={pending}>{pending ? t('saving') : t('finish')}</Button>}
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
