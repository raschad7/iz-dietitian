'use client';

import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';

import { DatePicker } from '@/components/ui/date-picker';
import { Field, FieldError } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneField } from '@/components/ui/phone-field';
import { MAX_NAME_PART_LENGTH, MAX_PHONE_DIGITS } from '@/features/clients/form-rules';
import { splitName } from '@/features/clients/name';
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
/*
 * No 'email': the card stopped offering one — see the layout note below for
 * what that does and does not change about the stored column.
 */
type FieldName = 'firstName' | 'lastName' | 'phone' | 'dateOfBirth' | 'sex';

export function ClientIdentityFields({
  locale,
  client,
  errorFor,
  dateOfBirthCaption,
}: {
  locale: Locale;
  /** Absent when creating: the stored record, to fill the fields from. */
  client?: ClientFormValues;
  /** The server's complaint about a field, if there is one to show. */
  errorFor?: (field: FieldName) => string | undefined;
  /**
   * How the date-of-birth popup is navigated — see `DateChooser`.
   *
   * Left out, it is the month-and-year dropdowns — see `dobCaption` below for
   * why that is the answer on every surface this card is opened from. Pass it to
   * override on one where a date near today is the usual answer.
   */
  dateOfBirthCaption?: 'chooser' | 'dropdowns';
}) {
  const t = useTranslations('clients');

  const [dateOfBirth, setDateOfBirth] = useState(client?.dateOfBirth ?? '');

  /*
    The stored name, read back into the two fields the card now asks for.

    A name longer than the cap comes back whole rather than clipped — see the ⚠
    on `splitName`. The field shows all of it and the schema refuses the save, so
    shortening a patient's name is a decision somebody makes rather than one this
    component makes quietly on reopen.
  */
  const storedName = splitName(client?.fullName);

  /*
    Two dropdowns — a month list beside a year list — in both states.

    Every "add a patient" surface in the app is the same moment: the person is
    in front of you reading a year out, the field is empty, and the answer is
    decades from the month the panel opens on. The ring costs two presses before
    the year is even on screen; the lists are one press to either half.

    ⚠ **Editing used to get the ring instead**, on the argument that the date is
    already stored and what brings anyone back to it is a correction of a day or
    a month. That is true of the correction and false of the control: it made one
    card behave two ways, so whoever learned the picker while adding somebody met
    a different one while fixing them, on the same field in the same dialog. One
    card, one picker. The ring is still reachable — `dateOfBirthCaption` is why
    the prop exists — for a surface where a date near today is the usual answer.
  */
  const dobCaption = dateOfBirthCaption ?? 'dropdowns';

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
   * Tied to `dobCaption` rather than to the field, so a surface that asks for
   * the ring — a date near today, already in the record — gets the neutral grid
   * with it, where the mark is confirming a stored value on a form full of them.
   */
  const dobTone = dobCaption === 'dropdowns' ? 'primary' : 'neutral';

  const error = (field: FieldName) => errorFor?.(field);

  /*
    One definition per field, so the layout below reads as the layout.

    Each free-text field carries a placeholder, because the label alone leaves
    them ambiguous at the counter: "Phone" beside a country menu does not say
    whether the dialling code belongs in the digits, and the two name boxes do
    not say how much of a long Arabic name belongs in each — which matters more
    now that ten characters is all either of them holds.

    They are examples and hints, never a second label — the `Label` above each
    field stays, and a placeholder that repeats it is a field that looks filled
    in until you click into it.
  */
  const fields: Record<FieldName, ReactNode> = {
    /*
      One name, asked for in two halves — see `./name.ts`. Both are `required`
      and both are capped at `MAX_NAME_PART_LENGTH` by the browser as well as by
      the schema: `maxLength` stops the tenth character from being typed, which
      is a better answer than accepting an eleventh and rejecting it on save.

      ⚠ `maxLength` does **not** clip a `defaultValue`, which is what lets a
      stored name longer than the cap still show in full.
    */
    firstName: (
      <FormField id="firstName" label={t('fields.firstName')} error={error('firstName')}>
        <Input
          id="firstName"
          name="firstName"
          required
          maxLength={MAX_NAME_PART_LENGTH}
          aria-invalid={error('firstName') !== undefined || undefined}
          placeholder={t('placeholders.firstName')}
          defaultValue={storedName.firstName}
        />
      </FormField>
    ),

    lastName: (
      <FormField id="lastName" label={t('fields.lastName')} error={error('lastName')}>
        <Input
          id="lastName"
          name="lastName"
          required
          maxLength={MAX_NAME_PART_LENGTH}
          aria-invalid={error('lastName') !== undefined || undefined}
          placeholder={t('placeholders.lastName')}
          defaultValue={storedName.lastName}
        />
      </FormField>
    ),

    phone: (
      <FormField id="phone" label={t('fields.phone')} error={error('phone')}>
        <PhoneField
          id="phone"
          name="phone"
          locale={locale}
          required
          maxDigits={MAX_PHONE_DIGITS}
          aria-invalid={error('phone') !== undefined || undefined}
          defaultValue={client?.phone}
          countryLabel={t('fields.phoneCountry')}
          placeholder={t('placeholders.phone')}
        />
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
        <SexField defaultValue={client?.sex} invalid={error('sex') !== undefined} />
      </FormField>
    ),
  };

  /*
    One field per row, top to bottom.

    ⚠ **Email is on neither.** It was absent when creating and present when
    editing, on the reasoning that a walk-in is booked from a name and a number
    and asking for an address at the counter yields a skipped or invented value
    — worse than empty, because the register can filter on it. That argument
    held for creating, and the card is now the same card in both states, so it
    holds for editing too: a form that grows a field the second time it is
    opened is two forms wearing one title.

    ⚠ **This is the only surface that wrote `clients.email`.** The column, the
    schema field and `readForm` are all untouched — a record that already holds
    an address keeps it, the register still filters on it, and a portal login is
    a username and never this. What is gone is the way to type one in. Restore
    the field below if the clinic starts collecting addresses.

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
      {/*
        The two halves of the name share a row, and they are the one pair that
        should. The note above explains why date of birth and phone must not:
        each of those is a composite control that loses something real at half
        width. These two are plain text inputs holding at most ten characters
        each, they are read as one answer, and putting them on separate rows
        would make one name look like two questions.

        They stack below `sm` all the same — on a phone, two fields in a row
        leaves neither wide enough to read a name back in.
      */}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.firstName}
        {fields.lastName}
      </div>
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

function SexField({ defaultValue, invalid }: { defaultValue?: string | null; invalid?: boolean }) {
  const t = useTranslations('clients');
  const uid = useId();

  return (
    <div
      role="radiogroup"
      aria-label={t('fields.sex')}
      aria-invalid={invalid || undefined}
      className="grid grid-cols-2 gap-3"
    >
      {SEX_OPTIONS.map((value) => {
        const inputId = `${uid}-${value}`;

        return (
          <label
            key={value}
            htmlFor={inputId}
            className={cn(
              'flex h-12 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-input',
              /*
                The unanswered-and-submitted edge, in the same clay the fields
                use. These boxes are not `.q-field`, so the `[aria-invalid]`
                rule in globals.css does not reach them and the state has to be
                painted here — but it is painted to match, or "required" would
                look like two different things on one card.

                It is dropped the moment either box is ticked, rather than
                waiting for the next submit: the complaint was that nothing was
                chosen, and something now is.
              */
              invalid && 'not-has-checked:border-destructive',
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
