'use client';

import { useTranslations } from 'next-intl';

import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { Callout } from '@/components/ui/callout';
import { Field, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/components/ui/table';
import { SettingsEditDialog } from '@/features/settings/components/settings-edit-dialog';
import {
  SettingsEmptyValue,
  SettingsRow,
  SettingsSection,
} from '@/features/settings/components/settings-section';
import type { Locale } from '@/i18n/routing';

import { saveWeeklyScheduleAction, updateClinicFieldAction, updateProfessionalFieldAction } from '../actions';
import { initialClinicProfileFormState, initialFieldEditState } from '../form-state';
import { minutesToTime } from '../schedule-summary';
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
  const tl = useTranslations('localeSwitcher');
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
        <SettingsRow label={t('profile.accountEmail')} value={email} isolate />
      </SettingsSection>

      <SettingsSection title={t('profile.formTitle')} icon="notes">
        {/*
          A professional phone and a licence number sat under these two and are
          gone from every screen by decision — see the ⚠ on
          `professionalProfileSchema`. The columns still hold whatever was saved
          before; nothing reads them and nothing writes them.
        */}
        <ProfileRow locale={locale} field="professionalTitle" label={tc('professionalTitle')} value={professional.professionalTitle} />
        <ProfileRow locale={locale} field="specialty" label={tc('specialty')} value={professional.specialty} />
      </SettingsSection>

      {/*
        The interface language moved here out of the rail's account menu: it is
        a preference of the signed-in person, so it belongs beside the rest of
        them rather than among the rail's destinations. The `dropdown` variant
        is the one that states the endonym, which is what a settings row's
        action slot has room for.
      */}
      <SettingsSection title={t('profile.languageTitle')} icon="language">
        <SettingsRow
          label={tl('label')}
          value={<span lang={locale}>{tl(`${locale}Name`)}</span>}
          action={<LocaleSwitcher variant="dropdown" side="top" />}
        />
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
      <SettingsSection title={t('clinic.identityTitle')} icon="dishes">
        <SettingsRow
          label={tc('logo')}
          value={<ClinicLogo src={clinic.logoUrl ?? null} alt={tc('logoPreviewAlt')} className="size-14" />}
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

      <SettingsSection title={t('clinic.formTitle')} icon="contact">
        <ClinicRow locale={locale} field="phone" label={tc('clinicPhone')} value={clinic.phone} isolate type="tel" />
        <ClinicRow locale={locale} field="contactEmail" label={tc('email')} value={clinic.contactEmail} isolate type="email" />
        <ClinicRow locale={locale} field="address" label={tc('address')} value={clinic.address} />
      </SettingsSection>

      <SettingsSection
        title={t('clinic.hoursTitle')}
        description={t('clinic.hoursDescription')}
        icon="clock"
        // The table draws its own header strip and row rules, and the Change
        // control belongs to the whole week rather than to a row of it.
        flush
        action={<ScheduleEditDialog locale={locale} profile={profile} />}
      >
        <ScheduleTable profile={profile} />
      </SettingsSection>
    </div>
  );
}

/**
 * The week, as the table it always was.
 *
 * ## Why this is not a `SettingsRow`
 *
 * It was one: a label, a small two-column list crammed into the value slot, and
 * a Change button across the row. Every other row in settings states *one*
 * value, so the slot is sized for one — and a week of opening hours squeezed
 * into it came out as a narrow block of text floating in a row three times its
 * width, with the days and their hours drifting apart and no rule carrying the
 * eye between them. It read as a paragraph that had lost its formatting.
 *
 * A schedule is tabular data — repeated records with the same fields — so it
 * gets the app's `Table`, at the section's full inline size, with the column
 * names stated once at the top. The Change control moves to the section's own
 * action slot, where it now governs the whole week rather than one row of it.
 *
 * ## One row per day
 *
 * All seven, in weekday order, whether or not two of them read the same. The
 * summary used to collapse adjacent identical days into spans — "Tuesday –
 * Thursday" as one line — which is the right compression for a *sentence* about
 * the week, and the wrong one for a table. A table's promise is that its rows
 * are the records: you look up Wednesday by finding the row called Wednesday,
 * not by working out which range contains it. It also made the table's height
 * depend on the data, so editing one day could silently restructure the whole
 * thing.
 *
 * A closed day spends one cell on the word rather than leaving two columns
 * empty: a dash under *Opens* and another under *Closes* reads as missing data,
 * and this data is not missing.
 */
function ScheduleTable({ profile }: { profile: ClinicProfileSnapshot }) {
  const tc = useTranslations('clinicProfile');
  // Sorted here rather than trusted from the query: the table's whole claim is
  // that it is the week in order, and that must not depend on row order in a
  // result set. The week starts on Sunday, matching `Date.prototype.getDay()`.
  const days = [...profile.schedule.days].sort((a, b) => a.weekday - b.weekday);

  return (
    <TableRoot>
      <Table>
        <TableHeader>
          <TableRow plain>
            {/* Three equal columns. The day column was `w-1/2`, which on a wide
                screen threw the times most of a metre away from the day they
                belong to — the row stopped reading as one fact. */}
            <TableHead className="w-1/3">{tc('day')}</TableHead>
            <TableHead className="w-1/3">{tc('opens')}</TableHead>
            <TableHead className="w-1/3">{tc('closes')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {days.map((day) => {
            return (
              <TableRow key={day.weekday} plain>
                <TableCell
                  className={day.isWorking ? 'font-medium' : 'font-medium text-muted-foreground'}
                >
                  {tc(`days.${day.weekday}` as 'days.0')}
                </TableCell>
                {day.isWorking ? (
                  <>
                    <TableCell>
                      <Time minute={day.openMinute} />
                    </TableCell>
                    <TableCell>
                      <Time minute={day.closeMinute} />
                    </TableCell>
                  </>
                ) : (
                  <TableCell colSpan={2} className="text-muted-foreground">
                    {tc('closed')}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableRoot>
  );
}

/**
 * One clock time inside an Arabic table.
 *
 * ⚠ The isolation is on the **run**, never on the cell. `TableCell`'s `numeric`
 * prop puts `dir="ltr"` on the `<td>` itself, and that also re-resolves the
 * cell's `text-start` — so in Arabic the digits flushed to the *left* edge of
 * their cell while the Arabic column head above them, resolved against the
 * table's own direction, sat at the right. Header and value in the same column,
 * at opposite ends of it. `settings-section.tsx` records the identical trap for
 * the account email, and `docs/design-system.md` for the register's phone
 * column: isolate the run, leave the box alone.
 */
function Time({ minute }: { minute: number }) {
  return (
    <span dir="ltr" className="tabular">
      {minutesToTime(minute)}
    </span>
  );
}

/**
 * The whole week's editor, behind one control.
 *
 * Seven switches and fourteen time fields are a lot of surface for something a
 * clinic sets once and revisits twice a year, and inline they dominated a page
 * whose every other row is a single value. The table above is the fact you came
 * to check; this is the thing you occasionally came to change.
 */
function ScheduleEditDialog({ locale, profile }: { locale: Locale; profile: ClinicProfileSnapshot }) {
  const t = useTranslations('settingsWorkspace');
  const tc = useTranslations('clinicProfile');

  return (
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
  field: 'name' | 'professionalTitle' | 'specialty';
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
