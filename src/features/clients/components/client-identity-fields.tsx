'use client';

import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';

import { DatePicker } from '@/components/ui/date-picker';
import { Field, FieldError } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneField } from '@/components/ui/phone-field';
import { type ClientSex } from '@/features/clients/schema';
import { type ClientFormValues } from '@/features/clients/types';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The identity fields a client record is made of — the whole of the client card,
 * and the whole of what the calendar asks for when someone books a walk-in.
 *
 * **One definition, two surfaces.** These lived inside `ClientForm` while the
 * clients page was the only place a person could be created. The calendar's
 * "New client" dialog asked for a name and a number and nothing else, on the
 * reasoning that staff were mid-booking with someone in front of them — which
 * was true, and still left the two paths producing different records from the
 * same act. A client added at the counter had no date of birth, so the calorie
 * formula could not run for them until somebody noticed and opened their card.
 *
 * Uncontrolled, so both callers can read them straight off `FormData` — the
 * clients page through a form action, the calendar's dialog on submit. The only
 * exception is the date picker, which is a button and a popover rather than an
 * input; it holds its value here and posts through a hidden input of the same
 * name, so a reader of either form still just sees `dateOfBirth`.
 */
type FieldName = 'fullName' | 'phone' | 'email' | 'dateOfBirth' | 'sex';

export function ClientIdentityFields({
  locale,
  client,
  errorFor,
  dateOfBirthCaption,
}: {
  locale: Locale;
  /** Absent when creating, which is also what hides the email field. */
  client?: ClientFormValues;
  /** The server's complaint about a field, if there is one to show. */
  errorFor?: (field: FieldName) => string | undefined;
  /**
   * How the date-of-birth popup is navigated — see `DateChooser`.
   *
   * Left out, it follows whether a client is being *added* or edited, which is
   * the thing the choice actually turns on. See `dobCaption` below. Pass it to
   * override that on a surface where the reasoning does not hold.
   */
  dateOfBirthCaption?: 'chooser' | 'dropdowns';
}) {
  const t = useTranslations('clients');

  const [dateOfBirth, setDateOfBirth] = useState(client?.dateOfBirth ?? '');

  /*
    Two dropdowns when adding someone, the caption ring when editing them.

    Every "add a patient" surface in the app is the same moment: the person is
    in front of you reading a year out, the field is empty, and the answer is
    decades from the month the panel opens on. The ring costs two presses before
    the year is even on screen; a month list beside a year list is one press to
    either half. Editing is the other case — the date is already in the record
    and what brings anyone back to it is a correction of a day or a month, which
    is what the ring is quickest at.

    Derived from `client` rather than passed in by each caller, because that is
    exactly the distinction: the register's Add button, the calendar's "New
    client" dialog and the dashboard's shortcut all open this with no `client`,
    and all three wanted the same thing. Three call sites each remembering to
    say so is three chances for one of them to forget.
  */
  const dobCaption = dateOfBirthCaption ?? (client ? 'chooser' : 'dropdowns');

  /**
   * …and the day cells marked the way the calendar's own picker marks them:
   * olive on the day you picked, an olive ring on today.
   *
   * A date field defaults to the neutral black fill, and that rule is a good one
   * — a form is a column of fields and the accent belongs to the one action at
   * the bottom of it. This popup is the exception the rule already allows for:
   * it is open *over* that form, it asks exactly one question, and the day you
   * pressed is the only answer in it. Black said "chosen" and olive says "this
   * one", which is what the grid is for.
   *
   * Tied to the same moment as the dropdowns rather than to the field: an edit
   * opens with a date already in it, where the mark is confirming a stored value
   * on a form full of them, and the neutral grid is the right register there.
   */
  const dobTone = dobCaption === 'dropdowns' ? 'primary' : 'neutral';

  const error = (field: FieldName) => errorFor?.(field);

  /* One definition per field, so the layout below reads as the layout. */
  const fields: Record<FieldName, ReactNode> = {
    fullName: (
      <FormField id="fullName" label={t('fields.fullName')} error={error('fullName')}>
        <Input id="fullName" name="fullName" required defaultValue={client?.fullName ?? ''} />
      </FormField>
    ),

    phone: (
      <FormField id="phone" label={t('fields.phone')} error={error('phone')}>
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
      <FormField id="email" label={t('fields.email')} error={error('email')}>
        <Input id="email" name="email" type="email" dir="ltr" defaultValue={client?.email ?? ''} />
      </FormField>
    ),

    /*
      The one field here that is never a date near today, which is why it is the
      app's date picker rather than `<input type="date">`: the browser's own
      popup opens on this month and pages a month at a time, so a 1974 birthday
      was either six hundred clicks or a typed string in whatever order the OS
      locale happened to want it. The picker opens on the stored year and offers
      the month and the year as dropdowns.

      No bound on it. It carried `max` of today on the reading that nobody is
      born tomorrow, which is true and is not this control's job: a cap turns
      every day past it into a dead cell, so the panel a walk-in's birthday is
      entered into opened with the back half of the year refusing to be pressed
      and no way to say why. Whoever is entering the date is reading it off a
      document. The value still posts as `YYYY-MM-DD` through the picker's
      hidden input, so the action's schema is untouched.
    */
    dateOfBirth: (
      <FormField id="dateOfBirth" label={t('fields.dateOfBirth')} error={error('dateOfBirth')}>
        <DatePicker
          id="dateOfBirth"
          name="dateOfBirth"
          locale={locale}
          value={dateOfBirth}
          onChange={setDateOfBirth}
          caption={dobCaption}
          selectedTone={dobTone}
          aria-invalid={error('dateOfBirth') !== undefined || undefined}
        />
      </FormField>
    ),

    sex: (
      <FormField id="sex" label={t('fields.sex')} error={error('sex')}>
        <SexField defaultValue={client?.sex} />
      </FormField>
    ),
  };

  /*
    One field per row, top to bottom.

    Email is absent when creating and present when editing. A walk-in is booked
    from a name and a number, and asking for an address at the counter is a
    field that gets skipped or filled with something made up — which is worse
    than empty, because the register can filter on it. The record can still take
    one later, from the same card in edit mode, which is where the rest of the
    intake is filled in anyway.

    Date of birth and phone used to share a row, on the reading that they are
    one "when and how to reach this person" thought. They are not, and the
    pairing cost both of them: each is a composite control — the picker is a
    button that opens a popover, the phone is a country menu welded to a number
    — and halving the width left the picker showing a truncated date and the
    phone's dialling code crowding the digits beside it. The two widest controls
    were the two sharing the row.

    Sex stays last and stays full width for the reason it always did: its
    control is a pair of boxes rather than a field, and in a column beside one
    it reads as a third option.
  */
  return (
    <div className="grid gap-4">
      {fields.fullName}
      {client ? fields.email : null}
      {fields.dateOfBirth}
      {fields.phone}
      {fields.sex}
    </div>
  );
}

export function FormField({
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
  children: ReactNode;
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
 * Two boxes, not a dropdown: there are only ever two answers, and a select that
 * opens to show exactly two rows is a menu nobody needed. Real radios under the
 * hood — `sr-only`, with the label itself styled by `:has()` — so the pair still
 * submits with the rest of an uncontrolled form and a keyboard reader gets
 * arrow-key switching between them for free.
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
               * The second pixel is an inset outline rather than `border-2`.
               * Growing the border keeps the box the same size but takes a pixel
               * off the content on every side, so the label and its icon shift
               * as the pointer arrives; an outline pulled 1px inwards paints
               * over the border's own inner edge in the same colour, reads as
               * one 2px line, and is outside layout entirely. `.q-field` draws
               * its focus edge the same way and for the same reason — see
               * globals.css.
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
