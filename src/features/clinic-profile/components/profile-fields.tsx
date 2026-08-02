'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { ClinicProfileSnapshot } from '../types';
import type { ClinicProfileFieldErrors, ValidationMessageKey } from '../validation';

const DAY_KEYS = ['days.0', 'days.1', 'days.2', 'days.3', 'days.4', 'days.5', 'days.6'] as const;

function timeValue(minute: number | null): string {
  if (minute === null) return '08:00';
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function ClinicInformationFields({ profile, fieldErrors = {} }: { profile: ClinicProfileSnapshot; fieldErrors?: ClinicProfileFieldErrors }) {
  const t = useTranslations('clinicProfile');
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('clinicName')} name="clinicName" defaultValue={profile.clinic.name} error={fieldErrors.clinicName} />
      <Field label={t('clinicPhone')} name="clinicPhone" type="tel" defaultValue={profile.clinic.phone} error={fieldErrors.clinicPhone} />
      <Field label={t('email')} name="contactEmail" type="email" defaultValue={profile.clinic.contactEmail} error={fieldErrors.contactEmail} />
      <Field label={t('address')} name="address" defaultValue={profile.clinic.address} error={fieldErrors.address} />
    </div>
  );
}

export function ProfessionalFields({ profile, fieldErrors = {} }: { profile: ClinicProfileSnapshot; fieldErrors?: ClinicProfileFieldErrors }) {
  const t = useTranslations('clinicProfile');
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('fullName')} name="name" defaultValue={profile.professional.name} error={fieldErrors.name} />
      <Field label={t('professionalTitle')} name="professionalTitle" defaultValue={profile.professional.professionalTitle} error={fieldErrors.professionalTitle} />
      <Field label={t('specialty')} name="specialty" defaultValue={profile.professional.specialty} error={fieldErrors.specialty} />
      <Field label={t('professionalPhone')} name="professionalPhone" type="tel" defaultValue={profile.professional.phone} error={fieldErrors.professionalPhone} />
      <Field label={t('licenseNumber')} name="licenseNumber" defaultValue={profile.professional.licenseNumber ?? ''} optional />
    </div>
  );
}

export function ScheduleFields({ profile, fieldErrors = {} }: { profile: ClinicProfileSnapshot; fieldErrors?: ClinicProfileFieldErrors }) {
  const t = useTranslations('clinicProfile');
  const [working, setWorking] = useState(() => profile.schedule.days.map((day) => day.isWorking));

  return (
    <div>
      {fieldErrors.schedule ? <FieldError id="schedule-error" error={fieldErrors.schedule} className="mb-3" /> : null}
      <div className="divide-y divide-border rounded-lg border border-border">
      {profile.schedule.days.map((day) => (
        <div key={day.weekday} className="grid gap-3 p-3 sm:grid-cols-[minmax(7rem,1fr)_auto_auto] sm:items-center">
          <label className="flex items-center gap-3 font-medium">
            <input
              className="size-4 accent-primary"
              type="checkbox"
              name={`working-${day.weekday}`}
              defaultChecked={day.isWorking}
              onChange={(event) => setWorking((current) => current.map((value, index) => index === day.weekday ? event.target.checked : value))}
            />
            {t(DAY_KEYS[day.weekday] ?? 'days.0')}
          </label>
          {working[day.weekday] ? (
            <>
              <TimeField label={t('opens')} name={`open-${day.weekday}`} defaultValue={timeValue(day.openMinute)} error={fieldErrors[`open-${day.weekday}`]} />
              <TimeField label={t('closes')} name={`close-${day.weekday}`} defaultValue={timeValue(day.closeMinute ?? 18 * 60)} error={fieldErrors[`close-${day.weekday}`]} />
            </>
          ) : <span className="text-sm text-muted-foreground sm:col-span-2">{t('offDay')}</span>}
        </div>
      ))}
      </div>
    </div>
  );
}

function Field({ label, optional, error, ...props }: React.ComponentProps<typeof Input> & { label: string; optional?: boolean; error?: ValidationMessageKey }) {
  const t = useTranslations('clinicProfile');
  const id = String(props.name);
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {optional
          ? <span className="font-normal text-muted-foreground"> ({t('optional')})</span>
          : <span aria-hidden="true" className="text-destructive">*</span>}
      </Label>
      <Input id={id} required={!optional} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} {...props} />
      {error ? <FieldError id={errorId} error={error} /> : null}
    </div>
  );
}

function TimeField({ label, name, defaultValue, error }: { label: string; name: string; defaultValue: string; error?: ValidationMessageKey }) {
  const errorId = `${name}-error`;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 sm:block sm:space-y-1">
        <Label className="text-xs text-muted-foreground" htmlFor={name}>{label}<span aria-hidden="true" className="text-destructive">*</span></Label>
        <Input className="w-32" id={name} name={name} type="time" step={900} defaultValue={defaultValue} required aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} />
      </div>
      {error ? <FieldError id={errorId} error={error} /> : null}
    </div>
  );
}

function FieldError({ id, error, className }: { id: string; error: ValidationMessageKey; className?: string }) {
  const t = useTranslations('clinicProfile');
  return <p id={id} role="alert" className={`text-xs text-destructive ${className ?? ''}`}>{t(`validation.${error}`)}</p>;
}
