'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { saveClinicInformationAction, saveProfessionalProfileAction, saveWeeklyScheduleAction } from '../actions';
import { initialClinicProfileFormState, type ClinicProfileFormState } from '../form-state';
import type { ClinicProfileSnapshot } from '../types';
import type { ClinicProfileFieldErrors } from '../validation';
import { ClinicInformationFields, ProfessionalFields, ScheduleFields } from './profile-fields';

type Section = 'clinic' | 'schedule' | 'professional';
const SECTIONS: readonly Section[] = ['clinic', 'schedule', 'professional'];

export function ProfileEditor({ locale, profile }: { locale: Locale; profile: ClinicProfileSnapshot }) {
  const t = useTranslations('clinicProfile');
  const [section, setSection] = useState<Section>('clinic');

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('eyebrow')}</p>
        <h1 className="mt-2 font-heading text-3xl font-semibold">{t('profileTitle')}</h1>
        <p className="mt-2 text-muted-foreground">{t('profileDescription')}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav className="flex gap-2 overflow-x-auto lg:flex-col" aria-label={t('profileSections')}>
          {SECTIONS.map((item) => (
            <Button key={item} type="button" variant={section === item ? 'secondary' : 'ghost'} className={cn('justify-start', section === item && 'font-semibold')} onClick={() => setSection(item)}>
              {t(`sections.${item}`)}
            </Button>
          ))}
        </nav>
        {section === 'clinic' ? <SectionForm locale={locale} title={t('sections.clinic')} description={t('sectionDescriptions.clinic')} action={saveClinicInformationAction}>{(errors) => <ClinicInformationFields profile={profile} fieldErrors={errors} />}</SectionForm> : null}
        {section === 'schedule' ? <SectionForm locale={locale} title={t('sections.schedule')} description={t('sectionDescriptions.schedule')} action={saveWeeklyScheduleAction}>{(errors) => <ScheduleFields profile={profile} fieldErrors={errors} />}</SectionForm> : null}
        {section === 'professional' ? <SectionForm locale={locale} title={t('sections.professional')} description={t('sectionDescriptions.professional')} action={saveProfessionalProfileAction}>{(errors) => <ProfessionalFields profile={profile} fieldErrors={errors} />}</SectionForm> : null}
      </div>
    </div>
  );
}

function SectionForm({ locale, title, description, action, children }: { locale: Locale; title: string; description: string; action: (state: ClinicProfileFormState, data: FormData) => Promise<ClinicProfileFormState>; children: (fieldErrors?: ClinicProfileFieldErrors) => React.ReactNode }) {
  const t = useTranslations('clinicProfile');
  const [state, formAction, pending] = useActionState(action, initialClinicProfileFormState);
  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="locale" value={locale} />
      <Card>
        <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
        <CardContent>
          {children(state.status === 'error' && state.messageKey === 'invalid' ? state.fieldErrors : undefined)}
          {state.status !== 'idle' ? <p role="status" className={cn('mt-4 text-sm', state.status === 'error' ? 'text-destructive' : state.status === 'warning' ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400')}>{state.status === 'warning' ? t('messages.scheduleConflict', { count: state.conflictCount }) : t(`messages.${state.messageKey}`)}</p> : null}
        </CardContent>
        <CardFooter className="justify-end"><Button type="submit" disabled={pending}>{pending ? t('saving') : t('saveChanges')}</Button></CardFooter>
      </Card>
    </form>
  );
}
