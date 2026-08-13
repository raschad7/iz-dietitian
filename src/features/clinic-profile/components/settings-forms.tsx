'use client';

import { Fragment } from 'react';
import { useTranslations } from 'next-intl';

import { Callout } from '@/components/ui/callout';
import { Field, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingsEditDialog } from '@/features/settings/components/settings-edit-dialog';
import {
  SettingsEmptyValue,
  SettingsRow,
  SettingsSection,
} from '@/features/settings/components/settings-section';
import type { Locale } from '@/i18n/routing';

import { saveWeeklyScheduleAction, updateClinicFieldAction, updateProfessionalFieldAction } from '../actions';
import { initialClinicProfileFormState, initialFieldEditState } from '../form-state';
import { minutesToTime, summarizeSchedule } from '../schedule-summary';
import type { ClinicProfileSnapshot } from '../types';
import { ClinicLogo, ClinicLogoField } from './logo-field';
import { ScheduleFields } from './profile-fields';

/**
 * Both settings surfaces are the same three things: a heading, a list of stated
 * values, and a dialog behind each one. `settings-section.tsx` records why the
 * cards that used to wrap all of this are gone, and
 * `settings-edit-dialog.tsx` why the inline inputs are.
 */

export function PersonalProfileSettings({ locale, profile, email }: {
  locale: Locale;
  profile: ClinicProfileSnapshot;
  email: string;
}) {
  const t = useTranslations('settingsWorkspace');
  const tc = useTranslations('clinicProfile');
  const { professional } = profile;

  return (
    <div className="flex flex-col">
      <SettingsSection title={t('profile.identityTitle')} icon="person">
        <ProfileRow locale={locale} field="name" label={tc('fullName')} value={professional.name} />
        {/*
          No trigger on this one: the address belongs to the sign-in account,
          not to this form. A Change button that cannot change anything is
          worse than no button at all.
        */}
        <SettingsRow
          label={t('profile.accountEmail')}
          value={email}
          isolate
          description={t('profile.accountEmailHint')}
        />
      </SettingsSection>

      <SettingsSection title={t('profile.formTitle')} description={t('profile.formDescription')} icon="notes">
        <ProfileRow locale={locale} field="professionalTitle" label={tc('professionalTitle')} value={professional.professionalTitle} />
        <ProfileRow locale={locale} field="specialty" label={tc('specialty')} value={professional.specialty} />
        <ProfileRow locale={locale} field="phone" label={tc('professionalPhone')} value={professional.phone} isolate type="tel" />
        <ProfileRow locale={locale} field="licenseNumber" label={tc('licenseNumber')} value={professional.licenseNumber ?? ''} optional />
      </SettingsSection>
    </div>
  );
}

export function ClinicSettings({ locale, profile }: { locale: Locale; profile: ClinicProfileSnapshot }) {
  const t = useTranslations('settingsWorkspace');
  const tc = useTranslations('clinicProfile');
  const { clinic } = profile;

  return (
    <div className="flex flex-col">
      <SettingsSection title={t('clinic.identityTitle')} description={t('clinic.identityDescription')} icon="dishes">
        <SettingsRow
          label={tc('logo')}
          value={<ClinicLogo src={clinic.logoUrl ?? null} alt={tc('logoPreviewAlt')} className="size-14" />}
          description={tc('logoHint')}
          action={
            <SettingsEditDialog
              locale={locale}
              title={tc('logo')}
              triggerLabel={t('change')}
              triggerAriaLabel={tc('logo')}
              hiddenFields={{ field: 'logoUrl' }}
              action={updateClinicFieldAction}
              initialState={initialFieldEditState}
            >
              {(state) => (
                <ClinicLogoField
                  defaultValue={clinic.logoUrl ?? null}
                  validationKey={state.status === 'invalid' ? state.validationKey : undefined}
                />
              )}
            </SettingsEditDialog>
          }
        />
        <ClinicRow locale={locale} field="name" label={tc('clinicName')} value={clinic.name} />
      </SettingsSection>

      <SettingsSection title={t('clinic.formTitle')} description={t('clinic.formDescription')} icon="contact">
        <ClinicRow locale={locale} field="phone" label={tc('clinicPhone')} value={clinic.phone} isolate type="tel" />
        <ClinicRow locale={locale} field="contactEmail" label={tc('email')} value={clinic.contactEmail} isolate type="email" />
        <ClinicRow locale={locale} field="address" label={tc('address')} value={clinic.address} />
      </SettingsSection>

      <SettingsSection title={t('clinic.hoursTitle')} description={t('clinic.hoursDescription')} icon="clock">
        <ScheduleRow locale={locale} profile={profile} />
      </SettingsSection>
    </div>
  );
}

/**
 * The week as spans, with the whole editor behind one control.
 *
 * Seven switches and fourteen time fields are a lot of surface for something a
 * clinic sets once and revisits twice a year, and inline they dominated a page
 * whose every other row is a single value. The summary is the fact you came to
 * check; the dialog is the thing you occasionally came to change.
 *
 * It used to print all seven days verbatim, one per line, which made the most
 * common answer — "the usual hours, Sunday to Thursday" — something you had to
 * reconstruct by comparing five identical lines. `summarizeSchedule` collapses
 * them; see that file for why a span never crosses a closed day.
 */
function ScheduleRow({ locale, profile }: { locale: Locale; profile: ClinicProfileSnapshot }) {
  const t = useTranslations('settingsWorkspace');
  const tc = useTranslations('clinicProfile');
  const spans = summarizeSchedule(profile.schedule.days);

  function dayRange(from: number, to: number): string {
    const start = tc(`days.${from}` as 'days.0');
    return from === to ? start : `${start} – ${tc(`days.${to}` as 'days.0')}`;
  }

  return (
    <SettingsRow
      className="items-start"
      label={t('clinic.hoursSummaryLabel')}
      value={
        /*
          A two-column table, not seven stacked lines. The hours column is
          `tabular` and sits at a shared inline offset, so a glance down it
          compares like against like — which is the one thing a column of
          opening hours is for. `summarizeSchedule` has already collapsed the
          identical days, so the ordinary clinic gets two rows here.
        */
        <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2">
          {spans.map((span) => (
            <Fragment key={span.from}>
              <dt className={span.isWorking ? 'font-medium' : 'text-muted-foreground'}>
                {dayRange(span.from, span.to)}
              </dt>
              <dd className="text-muted-foreground">
                {span.isWorking && span.openMinute !== null && span.closeMinute !== null ? (
                  <span dir="ltr" className="tabular">
                    {minutesToTime(span.openMinute)} – {minutesToTime(span.closeMinute)}
                  </span>
                ) : (
                  tc('closed')
                )}
              </dd>
            </Fragment>
          ))}
        </dl>
      }
      action={
        <SettingsEditDialog
          locale={locale}
          title={t('clinic.hoursTitle')}
          triggerLabel={t('change')}
          triggerAriaLabel={t('clinic.hoursTitle')}
          // Seven rows of a switch and two time fields is a table, not a field.
          size="wide"
          action={saveWeeklyScheduleAction}
          initialState={initialClinicProfileFormState}
        >
          {(state) => (
            <div className="flex flex-col gap-4">
              <ScheduleFields
                profile={profile}
                fieldErrors={state.status === 'error' && state.messageKey === 'invalid' ? state.fieldErrors : undefined}
              />
              {/*
                Moving opening hours can strand appointments already booked
                outside them. The action counts those and reports a `warning`
                rather than refusing the change — it is the dietitian's call —
                but the count has to be said where the change was made.
              */}
              {state.status === 'warning' ? (
                <Callout role="status" tone="attention">
                  {tc('messages.scheduleConflict', { count: state.conflictCount })}
                </Callout>
              ) : null}
            </div>
          )}
        </SettingsEditDialog>
      }
    />
  );
}

function ClinicRow(props: {
  locale: Locale;
  field: 'name' | 'phone' | 'contactEmail' | 'address';
  label: string;
  value: string;
  isolate?: boolean;
  type?: string;
}) {
  return <ValueRow {...props} scope="clinic" />;
}

function ProfileRow(props: {
  locale: Locale;
  field: 'name' | 'professionalTitle' | 'specialty' | 'phone' | 'licenseNumber';
  label: string;
  value: string;
  isolate?: boolean;
  type?: string;
  optional?: boolean;
}) {
  return <ValueRow {...props} scope="professional" />;
}

function ValueRow({ locale, scope, field, label, value, isolate, type, optional }: {
  locale: Locale;
  scope: 'clinic' | 'professional';
  field: string;
  label: string;
  value: string;
  isolate?: boolean;
  type?: string;
  optional?: boolean;
}) {
  const t = useTranslations('settingsWorkspace');
  const tc = useTranslations('clinicProfile');
  const id = `edit-${scope}-${field}`;

  return (
    <SettingsRow
      label={label}
      isolate={isolate}
      value={value || <SettingsEmptyValue label={t('notSet')} />}
      action={
        <SettingsEditDialog
          locale={locale}
          title={label}
          triggerLabel={t('change')}
          triggerAriaLabel={label}
          hiddenFields={{ field }}
          /*
            The scope picks the action here rather than the caller passing one,
            so a professional field name can never be handed to the clinic
            action: `ClinicRow` and `ProfileRow` above constrain `field` to
            their own union, and this is the single place the two meet.
          */
          action={scope === 'clinic' ? updateClinicFieldAction : updateProfessionalFieldAction}
          initialState={initialFieldEditState}
        >
          {(state) => {
            const validationKey = state.status === 'invalid' ? state.validationKey : undefined;

            return (
            <Field data-invalid={validationKey ? true : undefined}>
              <Label htmlFor={id}>
                {label}
                {optional ? <span className="font-normal text-muted-foreground"> ({tc('optional')})</span> : null}
              </Label>
              <Input
                id={id}
                name="value"
                type={type ?? 'text'}
                defaultValue={value}
                dir={isolate ? 'ltr' : 'auto'}
                required={!optional}
                aria-invalid={Boolean(validationKey)}
                aria-describedby={validationKey ? `${id}-error` : undefined}
                /*
                  The dialog opened for exactly this field, and nothing else in
                  it can reasonably take focus first — so landing in the box
                  saves a click on every edit rather than stealing focus from
                  something the reader was aiming at.
                */
                autoFocus
              />
              {validationKey ? (
                <FieldError id={`${id}-error`}>
                  {tc(`validation.${validationKey}` as 'validation.required')}
                </FieldError>
              ) : null}
            </Field>
            );
          }}
        </SettingsEditDialog>
      }
    />
  );
}
