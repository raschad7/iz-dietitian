'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Field, FieldError } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { TimeInput } from '@/components/ui/time-input';
import { cn } from '@/lib/utils';

import type { ClinicProfileSnapshot } from '../types';
import type { ClinicProfileFieldErrors, ValidationMessageKey } from '../validation';

/**
 * The three groups of inputs behind both the onboarding wizard and the profile
 * page, so the clinic is described the same way whichever screen asks.
 *
 * They were written before most of `src/components/ui` existed and had drifted
 * a long way from it: a local `Field`/`FieldError` pair with their own spacing
 * and 12px error text, a bare 16px `<input type="checkbox">` for each working
 * day, and `<input type="time">` — the native control the design system
 * replaced on purpose. Everything here now comes from the shared layer.
 *
 * The one thing that did not already exist is `TimeSelect`: a whole time on one
 * list, rather than the hour-plus-minute pair `TimeField` gives a meal. The
 * reasoning is in that file; the effect is here, in `ScheduleFields`.
 */

const DAY_KEYS = ['days.0', 'days.1', 'days.2', 'days.3', 'days.4', 'days.5', 'days.6'] as const;

/**
 * The clinic's opening hours are validated in quarter hours
 * (`validation.ts` → `invalidTime`), so the picker steps in quarter hours. A
 * control that offers a value its own form rejects is a trap the reader walks
 * into once per visit.
 *
 * **Seconds, because that is the unit `<input type="time">`'s `step` takes** —
 * this used to be `15`, a minute count the old `TimeSelect` read directly, and
 * handing 15 to a time input would step it by fifteen *seconds* and add a
 * seconds segment to the field.
 */
const SCHEDULE_STEP_SECONDS = 15 * 60;

function timeValue(minute: number | null): string {
  if (minute === null) return '08:00';
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function ClinicInformationFields({
  profile,
  fieldErrors = {},
}: {
  profile: ClinicProfileSnapshot;
  fieldErrors?: ClinicProfileFieldErrors;
}) {
  const t = useTranslations('clinicProfile');

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <ProfileField label={t('clinicName')} name="clinicName" defaultValue={profile.clinic.name} error={fieldErrors.clinicName} />
      <ProfileField label={t('clinicPhone')} name="clinicPhone" type="tel" defaultValue={profile.clinic.phone} error={fieldErrors.clinicPhone} />
      <ProfileField label={t('email')} name="contactEmail" type="email" defaultValue={profile.clinic.contactEmail} error={fieldErrors.contactEmail} />
      <ProfileField label={t('address')} name="address" defaultValue={profile.clinic.address} error={fieldErrors.address} />
    </div>
  );
}

export function ProfessionalFields({
  profile,
  fieldErrors = {},
}: {
  profile: ClinicProfileSnapshot;
  fieldErrors?: ClinicProfileFieldErrors;
}) {
  const t = useTranslations('clinicProfile');

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <ProfileField label={t('fullName')} name="name" defaultValue={profile.professional.name} error={fieldErrors.name} />
      <ProfileField label={t('professionalTitle')} name="professionalTitle" defaultValue={profile.professional.professionalTitle} error={fieldErrors.professionalTitle} />
      <ProfileField label={t('specialty')} name="specialty" defaultValue={profile.professional.specialty} error={fieldErrors.specialty} />
      <ProfileField label={t('professionalPhone')} name="professionalPhone" type="tel" defaultValue={profile.professional.phone} error={fieldErrors.professionalPhone} />
      <ProfileField label={t('licenseNumber')} name="licenseNumber" defaultValue={profile.professional.licenseNumber ?? ''} optional />
    </div>
  );
}

type ScheduleDay = { isWorking: boolean; open: string; close: string };

/**
 * The clinic's week: seven rows, a switch and two times each.
 *
 * ## What made this unusable
 *
 * Every row carried **four** dropdowns — an hour and a minute for each end of
 * the day — so a week was twenty-eight controls, none of which showed a time.
 * You read `08` and `00` in two boxes and assembled `08:00` yourself, twice per
 * row, and the two little "من"/"إلى" labels were repeated fourteen times down
 * the column to tell you which pair was which. It is now two `TimeSelect`s
 * showing whole times, under one set of column headings.
 *
 * ## Most clinics work the same hours every day
 *
 * Which is the fact the old form ignored hardest: setting Sunday to Thursday
 * meant repeating the same four choices five times. The toolbar copies the
 * first working day's hours across the rest, so the normal case is three
 * actions — set the open, set the close, apply — instead of twenty.
 *
 * That is also why the times are controlled state here rather than
 * uncontrolled fields. "Apply to every day" cannot be expressed over inputs
 * that own their own values.
 *
 * ## A closed day keeps its controls, disabled
 *
 * They used to be swapped for the words "Off day", which collapsed the row and
 * shifted every day below it while the pointer was somewhere else — the failure
 * the design system already names on the planner's toolbar. Disabled, they also
 * hold the hours the day would reopen on, so switching it back on restores what
 * was there instead of guessing 08:00.
 */
export function ScheduleFields({
  profile,
  fieldErrors = {},
  onEdit,
}: {
  profile: ClinicProfileSnapshot;
  fieldErrors?: ClinicProfileFieldErrors;
  /**
   * Reports that something on this form moved.
   *
   * Nothing in here is an `<input>` a form can hear: the switch is a button and
   * the times post through hidden inputs, so a parent listening for `input`
   * events sees a whole week change and thinks the form is untouched. It is
   * given the field's own name because the two callers want different things
   * from it — the profile page only needs to know *that* something moved, the
   * wizard needs to know *what*, so it can drop the error that field carried.
   */
  onEdit?: (fieldName: string) => void;
}) {
  const t = useTranslations('clinicProfile');

  const [days, setDays] = useState<ScheduleDay[]>(() =>
    profile.schedule.days.map((day) => ({
      isWorking: day.isWorking,
      open: timeValue(day.openMinute),
      close: timeValue(day.closeMinute ?? 18 * 60),
    })),
  );

  function update(weekday: number, field: 'working' | 'open' | 'close', patch: Partial<ScheduleDay>): void {
    setDays((current) =>
      current.map((day, index) => (index === weekday ? { ...day, ...patch } : day)),
    );
    onEdit?.(`${field}-${weekday}`);
  }

  /** The day the toolbar copies from — the first one that is actually open. */
  const sourceIndex = days.findIndex((day) => day.isWorking);
  const source = sourceIndex < 0 ? null : days[sourceIndex];

  function applyToAll(): void {
    if (!source) return;
    setDays((current) =>
      current.map((day) =>
        day.isWorking ? { ...day, open: source.open, close: source.close } : day,
      ),
    );
    // Every day's hours just changed, so every per-day time error is stale.
    // `schedule` is the one name that clears the section's own message.
    onEdit?.('schedule');
  }

  return (
    <div className="space-y-3">
      {fieldErrors.schedule ? (
        <FieldError>{t(`validation.${fieldErrors.schedule}`)}</FieldError>
      ) : null}

      {/*
        `neutral`, not `outline`: this sits on a form whose one real decision is
        Save, and `outline` draws its label in olive — the system's way of
        saying "act on me". Two olive labels on one card leave neither of them
        looking like the action. See "Buttons" in docs/design-system.md.

        Rendered disabled rather than hidden when every day is closed, so the
        row's shape does not change under the reader.
      */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button type="button" variant="neutral" size="sm" disabled={!source} onClick={applyToAll}>
          <Icon name="copy" />
          {t('applyToAll')}
        </Button>

        {/*
          Which day it copies from, beside the button rather than inside it.
          `Button` caps its label at 320px and never wraps — "Apply Wednesday's
          hours to every open day" is over that in both scripts, and a clipped
          verb is worse than a short one with the detail next to it.
        */}
        {source ? (
          <span className="text-caption text-muted-foreground">
            {t('applyToAllSource', { day: t(DAY_KEYS[sourceIndex] ?? 'days.0') })}
          </span>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        {/*
          The column headings, once. `من` and `إلى` used to be printed above
          every single control — fourteen 12px labels down a seven-row table,
          which is the tell that they belong to the columns and not to the
          fields. Hidden below `sm`, where the row wraps and the columns stop
          being columns; the controls keep their own `aria-label` either way, so
          nothing depends on the headings being on screen.
        */}
        <div className="hidden grid-cols-[minmax(9rem,1fr)_9rem_9rem] items-center gap-4 border-b border-border bg-muted px-3 py-2 text-label text-muted-foreground sm:grid">
          <span>{t('day')}</span>
          <span>{t('opens')}</span>
          <span>{t('closes')}</span>
        </div>

        <div className="divide-y divide-border">
          {days.map((day, weekday) => {
            // The close error wins: when both ends are flagged it is the one
            // that describes the pair (`closingAfterOpening`).
            const rowError = fieldErrors[`close-${weekday}`] ?? fieldErrors[`open-${weekday}`];
            const dayName = t(DAY_KEYS[weekday] ?? 'days.0');
            const switchId = `working-${weekday}`;

            return (
              <div
                key={weekday}
                /*
                  **A grid, and one row per day.** This was `flex flex-wrap`
                  with a `min-w-[10rem]` day column and two `w-32` fields — at
                  any width under about 26rem the two times wrapped under the
                  day name, so inside a dialog the seven-row table rendered as
                  twenty-one rows that had to be scrolled. The columns are
                  declared once, here and on the heading above, so a row cannot
                  reflow out of alignment with its own headings.

                  It still collapses below `sm`, where the columns genuinely
                  stop fitting and stacking is the honest answer.
                */
                className="grid grid-cols-1 items-center gap-x-4 gap-y-2 px-3 py-1.5 sm:grid-cols-[minmax(9rem,1fr)_9rem_9rem]"
              >
                {/*
                  The switch posts through a hidden input rather than carrying
                  `name` itself: `Switch` is a `<button>`, which posts nothing
                  unless it is the control that submitted the form, and this one
                  sits inside a form with its own submit. `form-data.ts` reads
                  the string `on`, exactly as the checkbox before it produced.
                */}
                <input type="hidden" name={switchId} value={day.isWorking ? 'on' : 'off'} />
                <input type="hidden" name={`open-${weekday}`} value={day.open} />
                <input type="hidden" name={`close-${weekday}`} value={day.close} />

                <div className="flex min-w-0 items-center gap-2">
                  <Switch
                    id={switchId}
                    checked={day.isWorking}
                    aria-labelledby={`${switchId}-label`}
                    onClick={() => update(weekday, 'working', { isWorking: !day.isWorking })}
                  />
                  <span
                    id={`${switchId}-label`}
                    className={cn(
                      'text-body-md font-medium',
                      // A closed day stays legible and plainly not live, the
                      // same way `Card variant="archived"` says it.
                      !day.isWorking && 'text-muted-foreground',
                    )}
                  >
                    {dayName}
                  </span>
                </div>

                {/*
                  `icon={false}`: the clock costs 48px of a 128px field, which
                  left about 60px for the value and clipped `06:00 PM` to
                  `06:00 P` in any browser rendering 12-hour time. The columns
                  are already headed "opens" and "closes", so fourteen clocks
                  down this table label nothing those two headings have not
                  said once — the same reason the repeated من/إلى labels went.
                */}
                <TimeInput
                  className="w-full"
                  icon={false}
                  value={day.open}
                  onChange={(event) => update(weekday, 'open', { open: event.target.value })}
                  step={SCHEDULE_STEP_SECONDS}
                  disabled={!day.isWorking}
                  /*
                    The heading above the column is not the accessible name —
                    it is a `<span>`, and seven controls cannot all point at one
                    label anyway. Each says which end of which day it is, so a
                    screen-reader user is never counting rows to find out what
                    they just changed.
                  */
                  aria-label={`${dayName} · ${t('opens')}`}
                />

                <TimeInput
                  className="w-full"
                  icon={false}
                  value={day.close}
                  onChange={(event) => update(weekday, 'close', { close: event.target.value })}
                  step={SCHEDULE_STEP_SECONDS}
                  disabled={!day.isWorking}
                  aria-label={`${dayName} · ${t('closes')}`}
                />

                {/*
                  The error belongs to the row, not to one of the two controls:
                  `closingAfterOpening` is a fact about the pair, and hanging it
                  under whichever box happened to be flagged made the row jump
                  by a line as you corrected the other one.
                */}
                {day.isWorking && rowError ? (
                  <FieldError className="w-full ps-2">{t(`validation.${rowError}`)}</FieldError>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * A labelled text input.
 *
 * `Field` is what drives the label's colour shift on focus and gives the error
 * somewhere reliable to sit; the local copy this replaces did neither.
 *
 * **Required is not marked in clay.** An asterisk in the destructive colour
 * spends the system's only alarm hue on "this box needs filling in" — and on
 * these two forms that was fourteen small red marks on a screen where nothing
 * had gone wrong. The optional field says so in words instead, which leaves
 * "no note" meaning required and costs no colour at all.
 */
function ProfileField({
  label,
  optional,
  error,
  ...props
}: React.ComponentProps<typeof Input> & {
  label: string;
  optional?: boolean;
  error?: ValidationMessageKey;
}) {
  const t = useTranslations('clinicProfile');
  const id = String(props.name);
  const errorId = `${id}-error`;

  return (
    <Field>
      <Label htmlFor={id}>
        {label}
        {optional ? (
          <span className="font-normal text-muted-foreground"> ({t('optional')})</span>
        ) : null}
      </Label>
      <Input
        id={id}
        required={!optional}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
      {error ? <FieldError id={errorId}>{t(`validation.${error}`)}</FieldError> : null}
    </Field>
  );
}
