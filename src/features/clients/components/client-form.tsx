'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneField } from '@/components/ui/phone-field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createClientAction, updateClientAction } from '@/features/clients/actions';
import { initialFormState, type ClientFormState } from '@/features/clients/form-state';
import {
  CLIENT_ACTIVITY_LEVELS,
  CLIENT_GOALS,
  CLIENT_SEXES,
} from '@/features/clients/schema';
import { type ClientFormValues } from '@/features/clients/types';
import { Link } from '@/i18n/navigation';
import { locales, type Locale } from '@/i18n/routing';

type ClientFormProps = {
  locale: Locale;
  /** Absent when creating. */
  client?: ClientFormValues;
};

export function ClientForm({ locale, client }: ClientFormProps) {
  const t = useTranslations('clients');
  const tCommon = useTranslations('common');

  const [state, formAction] = useActionState(
    client ? updateClientAction : createClientAction,
    initialFormState,
  );

  const errorFor = (field: string) =>
    state.status === 'error' ? state.fieldErrors?.[field]?.[0] : undefined;

  return (
    <form action={formAction} className="max-w-2xl space-y-6 text-start">
      <input type="hidden" name="locale" value={locale} />
      {client ? <input type="hidden" name="clientId" value={client.id} /> : null}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">{t('sections.contact')}</legend>

        <Field id="fullName" label={t('fields.fullName')} error={errorFor('fullName')}>
          <Input id="fullName" name="fullName" required defaultValue={client?.fullName ?? ''} />
        </Field>

        <Field id="phone" label={t('fields.phone')} error={errorFor('phone')}>
          <PhoneField
            id="phone"
            name="phone"
            locale={locale}
            defaultValue={client?.phone}
            countryLabel={t('fields.phoneCountry')}
          />
        </Field>

        <Field id="email" label={t('fields.email')} error={errorFor('email')}>
          <Input id="email" name="email" type="email" dir="ltr" defaultValue={client?.email ?? ''} />
        </Field>

        <Field id="preferredLocale" label={t('fields.preferredLocale')} error={errorFor('preferredLocale')}>
          <Select id="preferredLocale" name="preferredLocale" defaultValue={client?.preferredLocale ?? locale}>
            {locales.map((value) => (
              <option key={value} value={value}>
                {value === 'ar' ? 'العربية' : 'English'}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">{t('sections.intake')}</legend>

        <Field id="dateOfBirth" label={t('fields.dateOfBirth')} error={errorFor('dateOfBirth')}>
          <Input id="dateOfBirth" name="dateOfBirth" type="date" dir="ltr" defaultValue={client?.dateOfBirth ?? ''} />
        </Field>

        <Field id="sex" label={t('fields.sex')} error={errorFor('sex')}>
          <Select id="sex" name="sex" defaultValue={client?.sex ?? ''}>
            <option value="">{t('notProvided')}</option>
            {CLIENT_SEXES.map((value) => (
              <option key={value} value={value}>
                {t(`sex.${value}`)}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="heightCm" label={t('fields.heightCm')} error={errorFor('heightCm')}>
          <Input
            id="heightCm"
            name="heightCm"
            type="number"
            inputMode="numeric"
            min={30}
            max={280}
            dir="ltr"
            defaultValue={client?.heightCm ?? ''}
          />
        </Field>

        <Field id="goal" label={t('fields.goal')} error={errorFor('goal')}>
          <Select id="goal" name="goal" defaultValue={client?.goal ?? ''}>
            <option value="">{t('notProvided')}</option>
            {CLIENT_GOALS.map((value) => (
              <option key={value} value={value}>
                {t(`goal.${value}`)}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="activityLevel" label={t('fields.activityLevel')} error={errorFor('activityLevel')}>
          <Select id="activityLevel" name="activityLevel" defaultValue={client?.activityLevel ?? ''}>
            <option value="">{t('notProvided')}</option>
            {CLIENT_ACTIVITY_LEVELS.map((value) => (
              <option key={value} value={value}>
                {t(`activity.${value}`)}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">{t('sections.notes')}</legend>

        <Field id="medicalNotes" label={t('fields.medicalNotes')} error={errorFor('medicalNotes')}>
          <Textarea id="medicalNotes" name="medicalNotes" rows={3} defaultValue={client?.medicalNotes ?? ''} />
        </Field>

        <Field id="allergies" label={t('fields.allergies')} error={errorFor('allergies')}>
          <Textarea id="allergies" name="allergies" rows={2} defaultValue={client?.allergies ?? ''} />
        </Field>

        <Field id="notes" label={t('fields.notes')} error={errorFor('notes')}>
          <Textarea id="notes" name="notes" rows={3} defaultValue={client?.notes ?? ''} />
        </Field>
      </fieldset>

      <FormMessage state={state} />

      <div className="flex items-center gap-3">
        <SubmitButton label={tCommon('save')} />
        <Link
          href={client ? `/app/clients/${client.id}` : '/app/clients'}
          className={buttonVariants({ variant: 'outline' })}
        >
          {tCommon('cancel')}
        </Link>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FormMessage({ state }: { state: ClientFormState }) {
  const t = useTranslations('clients');
  if (state.status !== 'error') return null;

  return (
    <p role="status" className="text-sm text-destructive">
      {t(state.messageKey)}
    </p>
  );
}

function SubmitButton({ label }: { label: string }) {
  const tCommon = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? tCommon('loading') : label}
    </Button>
  );
}
