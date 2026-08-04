'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useId, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
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
  type ClientSex,
} from '@/features/clients/schema';
import { type ClientFormValues } from '@/features/clients/types';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The body of the client card — the only way into a client record, whether it
 * is being created or edited. `ClientFormTrigger` owns the card around it.
 *
 * The four facts a record cannot start without are the only fields visible
 * until someone asks for the rest. **Being the only ones on screen is the
 * whole mark** — they used to also carry `.q-field-primary`, an olive edge and
 * olive fill at rest, which made an empty card open as a block of green before
 * anyone had touched it and left olive meaning two things at once: "required"
 * and "you are here". The fields now rest neutral and pick up olive under the
 * pointer like every other field in the app.
 */
type PrimaryField = 'fullName' | 'phone' | 'email' | 'dateOfBirth';

/** Everything the disclosure hides. Listed so a server-side error can reopen it. */
const DETAIL_FIELDS = [
  'sex',
  'heightCm',
  'goal',
  'activityLevel',
  'medicalNotes',
  'allergies',
  'notes',
] as const;

type FieldName = PrimaryField | (typeof DETAIL_FIELDS)[number];

type ClientFormProps = {
  locale: Locale;
  /** Absent when creating. */
  client?: ClientFormValues;
  /**
   * Controlled rather than local state: the card's width follows the
   * disclosure, and the card is this form's parent.
   */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Cancelling closes the card rather than navigating away. */
  onCancel: () => void;
  /** An edit saved. Creating redirects instead, so this never fires for one. */
  onSaved: () => void;
};

export function ClientForm({
  locale,
  client,
  expanded,
  onExpandedChange,
  onCancel,
  onSaved,
}: ClientFormProps) {
  const t = useTranslations('clients');
  const tCommon = useTranslations('common');
  const detailsId = useId();

  const [state, formAction] = useActionState(
    client ? updateClientAction : createClientAction,
    initialFormState,
  );

  const errorFor = (field: FieldName) =>
    state.status === 'error' ? state.fieldErrors?.[field]?.[0] : undefined;

  /*
   * A rejected field nobody can see is a form that refuses to submit for no
   * stated reason, so an error anywhere in the hidden half opens it.
   */
  const hasHiddenError = DETAIL_FIELDS.some((name) => errorFor(name) !== undefined);

  useEffect(() => {
    if (hasHiddenError) onExpandedChange(true);
  }, [hasHiddenError, onExpandedChange]);

  useEffect(() => {
    if (state.status === 'success') onSaved();
  }, [state.status, onSaved]);

  /*
   * One definition per field, keyed so the two halves of the card can pick
   * from the same set. `col-span` hints ride along with the field they belong
   * to — they are inert while the card is one column wide.
   */
  const fields: Record<FieldName, ReactNode> = {
    fullName: (
      <FormField id="fullName" label={t('fields.fullName')} error={errorFor('fullName')}>
        <Input
          id="fullName"
          name="fullName"
          required
          defaultValue={client?.fullName ?? ''}
        />
      </FormField>
    ),

    phone: (
      <FormField id="phone" label={t('fields.phone')} error={errorFor('phone')}>
        <PhoneField
          id="phone"
          name="phone"
          locale={locale}
          defaultValue={client?.phone}
          countryLabel={t('fields.phoneCountry')}
        />
      </FormField>
    ),

    email: (
      <FormField id="email" label={t('fields.email')} error={errorFor('email')}>
        <Input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          defaultValue={client?.email ?? ''}
        />
      </FormField>
    ),

    dateOfBirth: (
      <FormField id="dateOfBirth" label={t('fields.dateOfBirth')} error={errorFor('dateOfBirth')}>
        <Input
          id="dateOfBirth"
          name="dateOfBirth"
          type="date"
          dir="ltr"
          defaultValue={client?.dateOfBirth ?? ''}
        />
      </FormField>
    ),

    sex: (
      <FormField id="sex" label={t('fields.sex')} error={errorFor('sex')}>
        <SexField defaultValue={client?.sex} />
      </FormField>
    ),

    heightCm: (
      <FormField id="heightCm" label={t('fields.heightCm')} error={errorFor('heightCm')}>
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
      </FormField>
    ),

    goal: (
      <FormField id="goal" label={t('fields.goal')} error={errorFor('goal')}>
        <Select id="goal" name="goal" defaultValue={client?.goal ?? ''}>
          <option value="">{t('notProvided')}</option>
          {CLIENT_GOALS.map((value) => (
            <option key={value} value={value}>
              {t(`goal.${value}`)}
            </option>
          ))}
        </Select>
      </FormField>
    ),

    activityLevel: (
      <FormField
        id="activityLevel"
        label={t('fields.activityLevel')}
        error={errorFor('activityLevel')}
      >
        <Select id="activityLevel" name="activityLevel" defaultValue={client?.activityLevel ?? ''}>
          <option value="">{t('notProvided')}</option>
          {CLIENT_ACTIVITY_LEVELS.map((value) => (
            <option key={value} value={value}>
              {t(`activity.${value}`)}
            </option>
          ))}
        </Select>
      </FormField>
    ),

    medicalNotes: (
      <FormField
        id="medicalNotes"
        label={t('fields.medicalNotes')}
        error={errorFor('medicalNotes')}
        className="sm:col-span-2"
      >
        <Textarea
          id="medicalNotes"
          name="medicalNotes"
          rows={3}
          defaultValue={client?.medicalNotes ?? ''}
        />
      </FormField>
    ),

    allergies: (
      <FormField
        id="allergies"
        label={t('fields.allergies')}
        error={errorFor('allergies')}
        className="sm:col-span-2"
      >
        <Textarea id="allergies" name="allergies" rows={2} defaultValue={client?.allergies ?? ''} />
      </FormField>
    ),

    notes: (
      <FormField
        id="notes"
        label={t('fields.notes')}
        error={errorFor('notes')}
        className="sm:col-span-2"
      >
        <Textarea id="notes" name="notes" rows={3} defaultValue={client?.notes ?? ''} />
      </FormField>
    ),
  };

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col text-start">
      <input type="hidden" name="locale" value={locale} />
      {client ? <input type="hidden" name="clientId" value={client.id} /> : null}

      <DialogBody className="min-h-0 flex-1 gap-0 overflow-y-auto p-4 sm:p-5">
        {/*
          Name, then email, each its own full-width row — the two facts worth
          reading at a glance rather than scanning across a column for. Date of
          birth and phone share the row after them: paired rather than each
          claiming a row of its own, because together they are still one
          "when and how to reach this person" thought.
        */}
        <div className="grid gap-4">
          {fields.fullName}
          {fields.email}
          <div className="grid grid-cols-2 gap-4">
            {fields.dateOfBirth}
            {fields.phone}
          </div>
        </div>

        {/*
          `0fr` → `1fr` on a grid row is the one way to animate to a height
          nobody has measured. The fields stay mounted so a value typed and
          then hidden is not thrown away; `inert` keeps them out of the tab
          order while they are not visible.

          The clipper needs no inset gutter: fields mark focus on their own
          border now, entirely inside their box, so there is nothing left for
          `overflow-hidden` to crop. It used to carry `-mx-1 px-1 pb-1` so the
          3px focus halo had somewhere to land.
        */}
        <div
          id={detailsId}
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(.2,.6,.2,1)]',
            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div inert={!expanded} className="overflow-hidden">
            <div className="grid gap-4 pt-4 sm:grid-cols-2">
              {fields.sex}
              {fields.heightCm}
              {fields.goal}
              {fields.activityLevel}
              {fields.medicalNotes}
              {fields.allergies}
              {fields.notes}
            </div>
          </div>
        </div>

        <FormMessage state={state} className="pt-4" />
      </DialogBody>

      {/*
        The disclosure sits on its own row, centred, between the fields and the
        actions — the one control in the card that changes the card rather than
        the record.
      */}
      <div className="flex justify-center border-t border-border px-4 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => onExpandedChange(!expanded)}
        >
          <Icon name={expanded ? 'chevronUp' : 'chevronDown'} />
          {expanded ? t('fewerDetails') : t('moreDetails')}
        </Button>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {tCommon('cancel')}
        </Button>
        <SubmitButton label={tCommon('save')} size="sm" />
      </DialogFooter>
    </form>
  );
}

function FormField({
  id,
  label,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Field className={className}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

/**
 * Two boxes, not a dropdown: there are only ever two answers, and a select
 * that opens to show exactly two rows is a menu nobody needed. Real radios
 * under the hood — `sr-only`, with the label itself styled by `:has()` — so
 * the pair still submits with the rest of this uncontrolled form and a
 * keyboard reader gets arrow-key switching between them for free.
 *
 * No third "not provided" box: leaving both unchecked already says that, the
 * same way an empty text field does.
 */
const SEX_OPTIONS = ['male', 'female'] as const satisfies readonly ClientSex[];

function SexField({ defaultValue }: { defaultValue?: string | null }) {
  const t = useTranslations('clients');
  const uid = useId();

  return (
    <div role="radiogroup" aria-label={t('fields.sex')} className="grid grid-cols-2 gap-3">
      {SEX_OPTIONS.map((value) => {
        const inputId = `${uid}-${value}`;

        return (
          <label
            key={value}
            htmlFor={inputId}
            className={cn(
              'flex h-12 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-input',
              'text-body-md font-medium text-foreground transition-colors',
              'has-checked:border-primary has-checked:bg-secondary has-checked:text-secondary-foreground',
            )}
          >
            <input
              id={inputId}
              type="radio"
              name="sex"
              value={value}
              defaultChecked={defaultValue === value}
              className="sr-only"
            />
            <span aria-hidden className="text-lg leading-none">
              {value === 'male' ? '♂' : '♀'}
            </span>
            {t(`sex.${value}`)}
          </label>
        );
      })}
    </div>
  );
}

function FormMessage({ state, className }: { state: ClientFormState; className?: string }) {
  const t = useTranslations('clients');
  if (state.status !== 'error') return null;

  return (
    <p role="status" className={cn('text-sm text-destructive', className)}>
      {t(state.messageKey)}
    </p>
  );
}

function SubmitButton({ label, size }: { label: string; size?: 'default' | 'sm' }) {
  const tCommon = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size={size} disabled={pending}>
      {pending ? tCommon('loading') : label}
    </Button>
  );
}
