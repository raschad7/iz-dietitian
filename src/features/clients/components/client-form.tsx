'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useId, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneField } from '@/components/ui/phone-field';
import { createClientAction, updateClientAction } from '@/features/clients/actions';
import { initialFormState, type ClientFormState } from '@/features/clients/form-state';
import { type ClientSex } from '@/features/clients/schema';
import { type ClientFormValues } from '@/features/clients/types';
import { type Locale } from '@/i18n/routing';
import { toIsoDate } from '@/lib/iso-date';
import { cn } from '@/lib/utils';

/**
 * The body of the client card — the only way into a client record's identity,
 * whether it is being created or edited. `ClientFormTrigger` owns the card.
 *
 * **Identity only, and there is no disclosure any more.** This card used to
 * hide height, goal, activity level and three notes fields behind a "more
 * details" chevron, while weight, allergen tags and the meal schedule lived on
 * a form owned by the weekly planner. Neither surface held a whole client:
 * the six inputs the calorie formula needs were split five-and-one across the
 * two, so a dietitian could fill either one completely and still be told
 * something was missing. All of that is the intake dialog now
 * (`IntakeFormTrigger`), and what is left here is the handful of facts a record
 * is *created* from — which is what makes a walk-in still take one short screen.
 *
 * The fields rest neutral and pick up olive under the pointer like every other
 * field in the app. They used to carry `.q-field-primary`, an olive edge and
 * fill at rest, which made an empty card open as a block of green before anyone
 * had touched it and left olive meaning two things at once: "required" and "you
 * are here".
 */
type FieldName = 'fullName' | 'phone' | 'email' | 'dateOfBirth' | 'sex';

type ClientFormProps = {
  locale: Locale;
  /** Absent when creating. */
  client?: ClientFormValues;
  /** Cancelling closes the card rather than navigating away. */
  onCancel: () => void;
  /** An edit saved. Creating redirects instead, so this never fires for one. */
  onSaved: () => void;
};

export function ClientForm({ locale, client, onCancel, onSaved }: ClientFormProps) {
  const t = useTranslations('clients');
  const tCommon = useTranslations('common');

  /*
   * The only controlled field on an otherwise uncontrolled form. The picker is
   * a button and a popover rather than an input, so it has no `defaultValue`
   * to post from — it holds the ISO string here and posts it through a hidden
   * input of the same name.
   */
  const [dateOfBirth, setDateOfBirth] = useState(client?.dateOfBirth ?? '');
  const today = toIsoDate(new Date());

  const [state, formAction] = useActionState(
    client ? updateClientAction : createClientAction,
    initialFormState,
  );

  const errorFor = (field: FieldName) =>
    state.status === 'error' ? state.fieldErrors?.[field]?.[0] : undefined;

  useEffect(() => {
    if (state.status === 'success') onSaved();
  }, [state.status, onSaved]);

  /* One definition per field, so the layout below reads as the layout. */
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

    /*
      The one field on this card that is never a date near today, which is why
      it is the app's date picker rather than `<input type="date">`: the
      browser's own popup opens on this month and pages a month at a time, so a
      1974 birthday was either six hundred clicks or a typed string in whatever
      order the OS locale happened to want it. The picker opens on the stored
      year and offers the month and the year as dropdowns.

      `max` is today — nobody is born tomorrow — and the value still posts as
      `YYYY-MM-DD` through the picker's hidden input, so the action's schema is
      untouched.
    */
    dateOfBirth: (
      <FormField id="dateOfBirth" label={t('fields.dateOfBirth')} error={errorFor('dateOfBirth')}>
        <DatePicker
          id="dateOfBirth"
          name="dateOfBirth"
          locale={locale}
          value={dateOfBirth}
          onChange={setDateOfBirth}
          max={today}
          aria-invalid={errorFor('dateOfBirth') !== undefined || undefined}
        />
      </FormField>
    ),

    sex: (
      <FormField id="sex" label={t('fields.sex')} error={errorFor('sex')}>
        <SexField defaultValue={client?.sex} />
      </FormField>
    ),
  };

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col text-start">
      <input type="hidden" name="locale" value={locale} />
      {client ? <input type="hidden" name="clientId" value={client.id} /> : null}

      <DialogBody className="min-h-0 flex-1 gap-0 overflow-y-auto p-4 sm:p-5">
        {/*
          One field per row, top to bottom.

          Email is absent when creating and present when editing. A walk-in is
          booked from a name and a number, and asking for an address at the
          counter is a field that gets skipped or filled with something made up
          — which is worse than empty, because the register can filter on it.
          The record can still take one later, from the same card in edit mode,
          which is where the rest of the intake is filled in anyway.

          Date of birth and phone used to share a row, on the reading that they
          are one "when and how to reach this person" thought. They are not, and
          the pairing cost both of them: each is a composite control — the picker
          is a button that opens a popover, the phone is a country menu welded to
          a number — and halving the card's width left the picker showing a
          truncated date and the phone's dialling code crowding the digits beside
          it. The two widest controls on the card were the two sharing the row.

          Sex stays last and stays full width for the reason it always did: its
          control is a pair of boxes rather than a field, and in a column beside
          one it reads as a third option.
        */}
        <div className="grid gap-4">
          {fields.fullName}
          {client ? fields.email : null}
          {fields.dateOfBirth}
          {fields.phone}
          {fields.sex}
        </div>

        {/*
          Where the disclosure used to be. Creating a client no longer asks for
          anything clinical, so there is nothing left to hide — see the note on
          `ClientForm` above. The next step is offered after the save, not
          crammed in beneath it: `createClientAction` redirects to the new
          record, whose Nutrition tab is where the rest is filled in.
        */}
        <FormMessage state={state} className="pt-4" />
      </DialogBody>

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
              // Muted at rest: neither answer is chosen yet, and two options in
              // full-strength text read as though one of them already is.
              'text-body-md font-medium text-muted-foreground transition-colors duration-180 ease-out',
              /*
               * Hover thickens the edge and brings the label up to full
               * strength. No fill: this used to take `.q-field`'s olive hover
               * background, which put a block of colour behind whichever option
               * the pointer crossed on the way to the other one.
               *
               * The second pixel is an inset outline rather than
               * `border-2`. Growing the border keeps the box the same size but
               * takes a pixel off the content on every side, so the label and
               * its icon shift as the pointer arrives; an outline pulled 1px
               * inwards paints over the border's own inner edge in the same
               * colour, reads as one 2px line, and is outside layout entirely.
               * `.q-field` draws its focus edge the same way and for the same
               * reason — see globals.css.
               */
              'not-has-checked:hover:text-foreground',
              'not-has-checked:hover:outline not-has-checked:hover:outline-1 not-has-checked:hover:-outline-offset-1 not-has-checked:hover:outline-(--input)',
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
            <Icon name={value} className="size-5" />
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
