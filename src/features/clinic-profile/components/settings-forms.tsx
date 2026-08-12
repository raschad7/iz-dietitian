'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingsPageHeader } from '@/features/settings/components/settings-page-header';
import type { Locale } from '@/i18n/routing';

import { saveClinicInformationAction, saveProfessionalProfileAction, saveWeeklyScheduleAction } from '../actions';
import { initialClinicProfileFormState, type ClinicProfileFormState } from '../form-state';
import type { ClinicProfileSnapshot } from '../types';
import type { ClinicProfileFieldErrors } from '../validation';
import { ClinicInformationFields, ProfessionalFields, ScheduleFields } from './profile-fields';

type SettingsAction = (state: ClinicProfileFormState, data: FormData) => Promise<ClinicProfileFormState>;

export function PersonalProfileSettings({ locale, profile, email }: { locale: Locale; profile: ClinicProfileSnapshot; email: string }) {
  const t = useTranslations('settingsWorkspace');

  return (
    <div className="space-y-5">
      <SettingsPageHeader title={t('profile.title')} description={t('profile.description')} />
      <div className="flex items-center gap-4 border-b border-border px-1 pb-5">
        <Avatar name={profile.professional.name} color="var(--primary)" size="lg" />
        <div className="min-w-0">
          <p className="truncate font-heading text-heading-sm font-semibold" dir="auto">{profile.professional.name}</p>
          <p className="truncate text-body-sm text-muted-foreground" dir="auto">
            {profile.professional.professionalTitle || t('profile.staffMember')}
          </p>
        </div>
        <Badge variant="onTrack" className="ms-auto">{t('profile.active')}</Badge>
      </div>

      <SettingsForm locale={locale} title={t('profile.formTitle')} description={t('profile.formDescription')} action={saveProfessionalProfileAction}>
        {(errors) => (
          <>
            <ProfessionalFields profile={profile} fieldErrors={errors} />
            <Field>
              <Label htmlFor="account-email">{t('profile.accountEmail')}</Label>
              <Input id="account-email" value={email} dir="ltr" readOnly disabled />
              <p className="text-caption text-muted-foreground">{t('profile.accountEmailHint')}</p>
            </Field>
          </>
        )}
      </SettingsForm>
    </div>
  );
}

export function ClinicSettings({ locale, profile }: { locale: Locale; profile: ClinicProfileSnapshot }) {
  const t = useTranslations('settingsWorkspace');
  const [scheduleDirty, setScheduleDirty] = useState(false);

  return (
    <div className="space-y-5">
      <SettingsPageHeader title={t('clinic.title')} description={t('clinic.description')} />
      <SettingsForm locale={locale} title={t('clinic.formTitle')} description={t('clinic.formDescription')} action={saveClinicInformationAction}>
        {(errors) => <ClinicInformationFields profile={profile} fieldErrors={errors} />}
      </SettingsForm>
      <SettingsForm
        locale={locale}
        title={t('clinic.hoursTitle')}
        description={t('clinic.hoursDescription')}
        action={saveWeeklyScheduleAction}
        dirty={scheduleDirty}
        onDirtyChange={setScheduleDirty}
      >
        {(errors) => <ScheduleFields profile={profile} fieldErrors={errors} onEdit={() => setScheduleDirty(true)} />}
      </SettingsForm>
    </div>
  );
}

function SettingsForm({ locale, title, description, action, dirty: controlledDirty, onDirtyChange, children }: {
  locale: Locale;
  title: string;
  description: string;
  action: SettingsAction;
  dirty?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  children: (fieldErrors?: ClinicProfileFieldErrors) => React.ReactNode;
}) {
  const t = useTranslations('clinicProfile');
  const tSettings = useTranslations('settingsWorkspace');
  const [localDirty, setLocalDirty] = useState(false);
  const [state, formAction, pending] = useActionState(async (currentState: ClinicProfileFormState, data: FormData) => {
    const nextState = await action(currentState, data);
    if (nextState.status === 'success') {
      setLocalDirty(false);
      onDirtyChange?.(false);
    }
    return nextState;
  }, initialClinicProfileFormState);
  const dirty = controlledDirty ?? localDirty;
  const setDirty = (value: boolean) => { setLocalDirty(value); onDirtyChange?.(value); };
  const fieldErrors = state.status === 'error' && state.messageKey === 'invalid' ? state.fieldErrors : undefined;

  return (
    <form action={formAction} noValidate data-settings-dirty={dirty ? 'true' : undefined} onInput={() => setDirty(true)}>
      <input type="hidden" name="locale" value={locale} />
      <Card>
        <CardHeader>
          <CardTitle as="h3">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
          {dirty ? <CardAction><Badge variant="attention">{tSettings('unsaved')}</Badge></CardAction> : null}
        </CardHeader>
        <CardContent className="space-y-5">
          {children(fieldErrors)}
          {state.status !== 'idle' ? (
            <Callout role="status" tone={state.status === 'success' ? 'neutral' : 'attention'} icon={state.status === 'success' ? 'check' : undefined}>
              {state.status === 'warning' ? t('messages.scheduleConflict', { count: state.conflictCount }) : t(`messages.${state.messageKey}`)}
            </Callout>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end"><Button type="submit" disabled={pending}>{pending ? t('saving') : t('saveChanges')}</Button></CardFooter>
      </Card>
    </form>
  );
}
