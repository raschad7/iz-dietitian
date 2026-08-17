'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldHint } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { Switch } from '@/components/ui/switch';
import { TimeInput } from '@/components/ui/time-input';
import { cn } from '@/lib/utils';

import {
  OTHER_OPTION,
  PROFESSIONAL_TITLE_OPTIONS,
  SPECIALTY_OPTIONS,
  splitStoredValue,
  type ProfessionalOption,
} from '../professional-options';
import { FIELD_LIMITS } from '../schema';
import type { ClinicProfileSnapshot } from '../types';
import type { ClinicProfileFieldErrors, ValidationMessageKey } from '../validation';

/**
 * The three groups of inputs behind both the onboarding wizard and the profile
 * page, so the clinic is described the same way whichever screen asks.
 *
 * Everything here comes from the shared layer in `src/components/ui`: `Field`,
 * `Label`, `Input`, `SelectField`, `Switch` and `TimeInput`. The one thing that
 * is local is `ScheduleFields`, which is a week of hours rather than a control.
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

/**
 * Reports that a control on one of these forms moved, by name.
 *
 * The two callers want different things from it — the profile page only needs
 * to know *that* something moved so it can mark itself dirty, the wizard needs
 * to know *what* moved so it can drop the error that field was carrying.
 */
type EditReporter = (fieldName: string) => void;

export function ClinicInformationFields({
  profile,
  fieldErrors = {},
}: {
  profile: ClinicProfileSnapshot;
  fieldErrors?: ClinicProfileFieldErrors;
}) {
  const t = useTranslations('clinicProfile');

  return (
    /*
      Two columns from `sm`, two rows of two: name beside phone, email beside
      address. The address held the full width for a while so the longest answer
      got the widest box; at 120 characters it no longer needs one, and a even
      2×2 block reads as one group rather than as a pair plus a straggler.
    */
    <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
      <ProfileField
        label={t('clinicName')}
        name="clinicName"
        defaultValue={profile.clinic.name}
        error={fieldErrors.clinicName}
        maxLength={FIELD_LIMITS.clinicName}
      />
      <ProfileField
        label={t('clinicPhone')}
        name="clinicPhone"
        type="tel"
        dir="ltr"
        // Ten digits and nothing else, so the phone keypad is the right
        // keyboard on a handset and there is no punctuation to offer.
        inputMode="numeric"
        defaultValue={profile.clinic.phone}
        error={fieldErrors.clinicPhone}
        maxLength={FIELD_LIMITS.clinicPhone}
      />
      <ProfileField
        label={t('email')}
        name="contactEmail"
        type="email"
        dir="ltr"
        defaultValue={profile.clinic.contactEmail}
        error={fieldErrors.contactEmail}
        maxLength={FIELD_LIMITS.contactEmail}
      />
      <ProfileField
        label={t('address')}
        name="address"
        defaultValue={profile.clinic.address}
        error={fieldErrors.address}
        maxLength={FIELD_LIMITS.address}
      />
    </div>
  );
}

/**
 * Who the practitioner is: a name, a title and a specialty.
 *
 * ## Two of the three are lists now
 *
 * The title and the specialty were free-text boxes, which produced spelling
 * variants of the same job inside one clinic and gave the reader no idea what a
 * good answer looked like. They are `SelectField`s over the lists in
 * `professional-options.ts`, with "أخرى" revealing a text box for the case the
 * list does not cover — see that file for why the stored value stays Arabic in
 * both interface languages.
 *
 * ## Two fields are gone
 *
 * A professional phone and a licence number used to sit under these. Both were
 * removed from every screen by decision; the columns remain and are no longer
 * written. The ⚠ on `professionalProfileSchema` has the details, including why
 * re-adding them here would make finishing onboarding impossible.
 */
export function ProfessionalFields({
  profile,
  fieldErrors = {},
  onEdit,
}: {
  profile: ClinicProfileSnapshot;
  fieldErrors?: ClinicProfileFieldErrors;
  onEdit?: EditReporter;
}) {
  const t = useTranslations('clinicProfile');

  return (
    <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
      <ProfileField
        className="sm:col-span-2"
        label={t('fullName')}
        name="name"
        defaultValue={profile.professional.name}
        error={fieldErrors.name}
        maxLength={FIELD_LIMITS.practitionerName}
      />

      <ChoiceField
        label={t('professionalTitle')}
        name="professionalTitle"
        options={PROFESSIONAL_TITLE_OPTIONS}
        optionsNamespace="titleOptions"
        customLabel={t('customTitle')}
        stored={profile.professional.professionalTitle}
        error={fieldErrors.professionalTitle}
        maxLength={FIELD_LIMITS.professionalTitle}
        onEdit={onEdit}
      />

      <ChoiceField
        label={t('specialty')}
        name="specialty"
        options={SPECIALTY_OPTIONS}
        optionsNamespace="specialtyOptions"
        customLabel={t('customSpecialty')}
        stored={profile.professional.specialty}
        error={fieldErrors.specialty}
        maxLength={FIELD_LIMITS.specialty}
        onEdit={onEdit}
      />
    </div>
  );
}

type ScheduleDay = { isWorking: boolean; open: string; close: string };

/**
 * The clinic's week: seven rows, a switch and two times each.
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
   * Nothing in here is an `<input>` a form can hear: the switch is a button and
   * the times post through hidden inputs, so a parent listening for `input`
   * events sees a whole week change and thinks the form is untouched.
   */
  onEdit?: EditReporter;
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

  const openCount = days.filter((day) => day.isWorking).length;

  return (
    <div className="space-y-3">
      {fieldErrors.schedule ? (
        <FieldError>{t(`validation.${fieldErrors.schedule}`, { max: 0 })}</FieldError>
      ) : null}

      {/*
        `neutral`, not `outline`: this sits on a form whose one real decision is
        Continue, and `outline` draws its label in olive — the system's way of
        saying "act on me". Two olive labels on one card leave neither of them
        looking like the action. See "Buttons" in docs/design-system.md.

        Rendered disabled rather than hidden when every day is closed, so the
        row's shape does not change under the reader.
      */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <Button type="button" variant="neutral" size="sm" disabled={!source} onClick={applyToAll}>
            <Icon name="copy" />
            {t('applyToAll')}
          </Button>

          {/*
            Which day it copies from, beside the button rather than inside it.
            `Button` caps its label at 320px and never wraps — "Apply
            Wednesday's hours to every open day" is over that in both scripts,
            and a clipped verb is worse than a short one with the detail next
            to it.
          */}
          {source ? (
            <span className="text-caption text-muted-foreground">
              {t('applyToAllSource', { day: t(DAY_KEYS[sourceIndex] ?? 'days.0') })}
            </span>
          ) : null}
        </div>

        {/*
          How many days are open, as plain text.

          The one number a reader wants back from a seven-row table, and the
          thing the `workingDayRequired` error is about — stating it here means
          "no days are open" is visible before Continue rather than after it.
          Text and not a badge: a count is a value, and `docs/design-system.md`
          reserves filled pills for states.
        */}
        <span className="text-caption text-muted-foreground tabular-nums">
          {t('openDayCount', { count: openCount })}
        </span>
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
                  **A grid, and one row per day.** The columns are declared
                  once, here and on the heading above, so a row cannot reflow
                  out of alignment with its own headings. It still collapses
                  below `sm`, where the columns genuinely stop fitting and
                  stacking is the honest answer.

                  A closed row cools its whole background rather than only
                  greying its label, so "which days are we open" is answerable
                  from the shape of the table at a glance instead of by reading
                  seven switches.
                */
                className={cn(
                  'grid grid-cols-1 items-center gap-x-4 gap-y-2 px-3 py-1.5 transition-colors sm:grid-cols-[minmax(9rem,1fr)_9rem_9rem]',
                  !day.isWorking && 'bg-muted/40',
                )}
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
                      'truncate text-body-md font-medium',
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
                  said once.
                */}
                <TimeInput
                  className="w-full"
                  icon={false}
                  value={day.open}
                  onChange={(event) => update(weekday, 'open', { open: event.target.value })}
                  step={SCHEDULE_STEP_SECONDS}
                  disabled={!day.isWorking}
                  aria-invalid={day.isWorking && Boolean(fieldErrors[`open-${weekday}`])}
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
                  aria-invalid={day.isWorking && Boolean(fieldErrors[`close-${weekday}`])}
                  aria-label={`${dayName} · ${t('closes')}`}
                />

                {/*
                  The error belongs to the row, not to one of the two controls:
                  `closingAfterOpening` is a fact about the pair, and hanging it
                  under whichever box happened to be flagged made the row jump
                  by a line as you corrected the other one.
                */}
                {day.isWorking && rowError ? (
                  <FieldError className="w-full ps-2 sm:col-span-3">
                    {t(`validation.${rowError}`, { max: 0 })}
                  </FieldError>
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
 * A select over a fixed list, with a text box behind "أخرى".
 *
 * The select posts under `name` and the text box under `${name}Custom`;
 * `readClinicProfileForm` collapses the pair back into the single string the
 * column holds, so nothing downstream knows there were two controls.
 *
 * **The error moves to whichever control can answer it.** When a list value is
 * selected the select is the thing that is wrong or right; the moment "أخرى" is
 * chosen the select is correct and the empty box below it is the problem, so
 * that is where `aria-invalid` and the message go. Flagging both would say the
 * choice was a mistake, and flagging only the select would put a red edge on a
 * control the reader cannot fix.
 */
function ChoiceField({
  label,
  name,
  options,
  optionsNamespace,
  customLabel,
  stored,
  error,
  maxLength,
  onEdit,
}: {
  label: string;
  name: string;
  options: readonly ProfessionalOption[];
  optionsNamespace: 'titleOptions' | 'specialtyOptions';
  customLabel: string;
  stored: string;
  error?: ValidationMessageKey;
  maxLength: number;
  onEdit?: EditReporter;
}) {
  const t = useTranslations('clinicProfile');
  const initial = splitStoredValue(options, stored);
  // `null`, not `''`: an empty string is a value the list does not contain, so
  // the trigger would render blank instead of showing the placeholder.
  const [choice, setChoice] = useState<string | null>(initial.choice || null);

  const errorId = `${name}-error`;
  const isOther = choice === OTHER_OPTION;

  return (
    <Field>
      <Label htmlFor={name}>{label}</Label>

      <SelectField
        id={name}
        name={name}
        value={choice}
        onValueChange={(next) => {
          setChoice(next);
          onEdit?.(name);
        }}
        options={options.map((option) => ({
          value: option.value,
          // The cast is the repository's existing shape for a key assembled at
          // runtime — see `settings-forms.tsx`. `optionsNamespace` is a union of
          // two literals and `key` comes from a `const` list, so the string is
          // always a real message; next-intl's key type just cannot see that.
          label: t(`${optionsNamespace}.${option.key}` as 'titleOptions.other'),
        }))}
        placeholder={t('selectPlaceholder')}
        aria-invalid={Boolean(error) && !isOther}
        aria-describedby={error && !isOther ? errorId : undefined}
      />

      {isOther ? (
        <CustomValueInput
          name={`${name}Custom`}
          label={customLabel}
          defaultValue={initial.custom}
          maxLength={maxLength}
          invalid={Boolean(error)}
          errorId={errorId}
        />
      ) : null}

      {error ? (
        <FieldError id={errorId}>{t(`validation.${error}`, { max: maxLength })}</FieldError>
      ) : null}
    </Field>
  );
}

/**
 * How much of an uncontrolled field's allowance has been used.
 *
 * The fields post through `FormData` rather than React state, so the length has
 * to be tracked separately — it is only ever used to draw the counter, never to
 * decide the value.
 *
 * The counter stays quiet until the last fifth of the allowance. One sitting
 * under every empty box is noise on the fields nobody will come close to
 * filling, and noise is what makes a reader stop reading the ones that matter.
 */
function useCharacterCount(initial: string, maxLength?: number) {
  const [length, setLength] = useState(() => initial.length);

  return {
    length,
    track: (value: string) => setLength(value.length),
    show: maxLength !== undefined && length > maxLength * 0.8,
    over: maxLength !== undefined && length > maxLength,
  };
}

function CharacterCounter({
  id,
  length,
  maxLength,
  over,
}: {
  id: string;
  length: number;
  maxLength: number;
  over: boolean;
}) {
  const t = useTranslations('clinicProfile');

  return (
    <FieldHint
      id={id}
      // `aria-live` and not `role="status"`: it is a running count, so it
      // should be read when the reader pauses, not announced per keystroke.
      aria-live="polite"
      className={cn('text-end tabular-nums', over && 'text-destructive')}
    >
      {t('charactersUsed', { count: length, max: maxLength })}
    </FieldHint>
  );
}

/**
 * The box "أخرى" reveals.
 *
 * Its own label is visually hidden rather than absent: the select above already
 * says "Professional title", so a second visible label would repeat it, but a
 * screen reader arriving at a bare text box after a select needs to be told
 * what it is for.
 *
 * It carries the same counter as every other bounded field. This is the one
 * place either of these two values can be free text, so it is the only place
 * the 50-character ceiling is reachable — and a reader who has just been handed
 * an empty box by choosing "other" has no other way of knowing there is one.
 */
function CustomValueInput({
  name,
  label,
  defaultValue,
  maxLength,
  invalid,
  errorId,
}: {
  name: string;
  label: string;
  defaultValue: string;
  maxLength: number;
  invalid: boolean;
  errorId: string;
}) {
  const counterId = useId();
  const count = useCharacterCount(defaultValue, maxLength);

  return (
    <>
      <Input
        name={name}
        aria-label={label}
        placeholder={label}
        defaultValue={defaultValue}
        // See the note on `ProfileField` for why this is not `required`.
        aria-required
        aria-invalid={invalid || count.over}
        aria-describedby={invalid ? errorId : count.show ? counterId : undefined}
        onChange={(event) => count.track(event.target.value)}
        // Focus lands here on selection: choosing "Other" is a statement that the
        // answer is about to be typed, so the caret should already be waiting.
        autoFocus
      />

      {count.show ? (
        <CharacterCounter
          id={counterId}
          length={count.length}
          maxLength={maxLength}
          over={count.over}
        />
      ) : null}
    </>
  );
}

/**
 * A labelled text input.
 *
 * `Field` is what drives the label's colour shift on focus and gives the error
 * somewhere reliable to sit.
 *
 * **Required is not marked in clay.** An asterisk in the destructive colour
 * spends the system's only alarm hue on "this box needs filling in" — and on
 * these forms that was a dozen small red marks on a screen where nothing had
 * gone wrong. The optional field says so in words instead, which leaves "no
 * note" meaning required and costs no colour at all.
 *
 * ## The counter
 *
 * `maxLength` is passed as a *number the field knows*, not as the HTML
 * attribute. The attribute silently refuses the next keystroke, which reads as
 * a broken keyboard; this shows how much room is left instead, and only once
 * the reader is close enough to the ceiling for it to be news. Over the limit
 * it turns destructive and `validation.tooLong` names the number — which is
 * what the clinic name field could not do before, because every failure on it,
 * including "300 characters", was reported as "this field is required".
 */
function ProfileField({
  label,
  optional,
  error,
  maxLength,
  className,
  ...props
}: React.ComponentProps<typeof Input> & {
  label: string;
  optional?: boolean;
  error?: ValidationMessageKey;
  maxLength?: number;
}) {
  const t = useTranslations('clinicProfile');
  const id = String(props.name);
  const errorId = `${id}-error`;
  const counterId = useId();
  const count = useCharacterCount(String(props.defaultValue ?? ''), maxLength);

  return (
    <Field className={className}>
      <Label htmlFor={id}>
        {label}
        {optional ? (
          <span className="font-normal text-muted-foreground"> ({t('optional')})</span>
        ) : null}
      </Label>

      <Input
        id={id}
        /*
          `aria-required`, not `required`.

          Both forms that render this field are `noValidate`, so the HTML
          attribute never blocks a submit and never shows a browser bubble — it
          is doing no validation work here at all. What it *can* still do is
          make the browser paint the box itself: Firefox matches
          `:-moz-ui-invalid` on an empty required field once the reader has
          touched it, and draws its own red glow, which this app has no rule for
          and cannot clear. A field going red with no message under it, for a
          box nobody has typed in, is exactly the failure this form was
          reported for — and the app's own red is `[aria-invalid='true']`
          (globals.css), which is state this component controls.

          `aria-required` keeps the promise to assistive technology and leaves
          the painting to us.
        */
        aria-required={!optional}
        aria-invalid={Boolean(error) || count.over}
        aria-describedby={error ? errorId : count.show ? counterId : undefined}
        {...props}
        onChange={(event) => {
          count.track(event.target.value);
          props.onChange?.(event);
        }}
      />

      {error ? (
        <FieldError id={errorId}>{t(`validation.${error}`, { max: maxLength ?? 0 })}</FieldError>
      ) : null}

      {count.show && maxLength !== undefined ? (
        <CharacterCounter
          id={counterId}
          length={count.length}
          maxLength={maxLength}
          over={count.over}
        />
      ) : null}
    </Field>
  );
}
