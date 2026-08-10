'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { type Locale } from '@/i18n/routing';

import { formatLongDate } from '../format';
import { MAX_REPEAT_WEEKS, REPEAT_PRESETS, weeklyRepeatDates } from '../repeat';

/**
 * How often this booking repeats — asked **while** the appointment is being
 * made, not after it is saved.
 *
 * ## What this replaces
 *
 * A modal that opened on its own every single time a booking was saved, asking
 * whether to repeat it. Most appointments do not repeat, so the common path was
 * book → dialog → dismiss, and a prompt that is dismissed nine times out of ten
 * stops being read: by the tenth the doctor is clicking "No" before the words
 * have rendered, which is exactly when they needed to click yes. It also put a
 * modal in front of the calendar at the moment the calendar had just changed —
 * the one moment the person wants to look at it.
 *
 * As a field it is a property of the appointment, sitting with the rest of them,
 * defaulting to the answer that is nearly always right and costing nothing to
 * leave alone.
 *
 * ## Two selects, no number field
 *
 * The app chooses from a fixed set with the shared dropdown everywhere it does
 * it — the appointment dialog's start and duration, the intake form, the client
 * filter — and a repeat is a whole number of weeks between one and 52, which is
 * a fixed set. It also costs nothing to operate on a phone, where a number
 * keyboard for two digits is the worst of both worlds.
 *
 * The line under the control is not this component's opinion:
 * `weeklyRepeatDates` produces it and the server writes exactly those dates, so
 * the preview cannot drift from what happens.
 */

/** The select's "does not repeat" row, and the value the caller starts at. */
export const NO_REPEAT = 0;

/** The select's own "let me type it" row. Not a span, so not a number. */
const CUSTOM = 'custom';

export function RepeatField({
  locale,
  date,
  weeks,
  onChange,
  idPrefix = 'repeat',
}: {
  locale: Locale;
  /** The first appointment's date — what the preview counts forward from. */
  date: string;
  /** Weeks to add after the first appointment. {@link NO_REPEAT} for none. */
  weeks: number;
  onChange: (weeks: number) => void;
  /** Set when two of these could share a page, so the labels stay attached. */
  idPrefix?: string;
}) {
  const t = useTranslations('booking');

  /**
   * Whether the doctor is choosing their own span.
   *
   * Held apart from `weeks`, because "custom" is a mode rather than a value: a
   * chosen 4 is still four weeks, and without this the first select would jump
   * back to "1 month" and take the second one away mid-choice.
   */
  const [custom, setCustom] = useState(false);

  const dates = weeklyRepeatDates(date, weeks);

  return (
    <div className="space-y-2">
      {/*
        `div.space-y-1` and not `Field`, so this matches the dropdowns in
        `AppointmentDialog` exactly — same wrapper, same spacing, and no
        `.q-field-group`, whose `:focus-within` rule tints the label the moment
        the control is focused. Every other dropdown in the booking surfaces
        leaves its label alone, and one that lights up would be the odd control
        out.
      */}
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-duration`}>{t('repeat.label')}</Label>
        <SelectField
          id={`${idPrefix}-duration`}
          value={custom ? CUSTOM : String(weeks)}
          onValueChange={(next) => {
            setCustom(next === CUSTOM);
            if (next !== CUSTOM) onChange(Number(next));
          }}
          options={[
            /* The default, and first: an appointment that does not repeat is
               the overwhelmingly common case, so it is the row already showing
               and the one the keyboard lands on. */
            { value: String(NO_REPEAT), label: t('repeat.never') },
            ...REPEAT_PRESETS.map((preset) => ({
              value: String(preset.weeks),
              label: t(`repeat.presets.${preset.key}`),
            })),
            { value: CUSTOM, label: t('repeatBooking.custom') },
          ]}
        />
      </div>

      {custom ? (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-weeks`}>{t('repeatBooking.customLabel')}</Label>
          <SelectField
            id={`${idPrefix}-weeks`}
            autoFocus
            value={String(weeks || 1)}
            onValueChange={(next) => onChange(Number(next))}
            options={Array.from({ length: MAX_REPEAT_WEEKS }, (_, index) => index + 1).map(
              (count) => ({ value: String(count), label: t('repeatBooking.weeks', { count }) }),
            )}
          />
        </div>
      ) : null}

      {/*
        What the choice above commits to, in appointments and in a date. "1
        month" is a span; "4 appointments, the last on 2 September" is the thing
        being agreed to, and it is the number that makes someone reconsider
        before clicking rather than after.

        Only when it repeats. On the default row there is nothing to preview,
        and a permanent line saying so would make a field nobody is using the
        tallest thing in the popover.
      */}
      {dates.length > 0 ? (
        <p className="text-caption text-muted-foreground" dir="auto">
          {t('repeatBooking.preview', {
            count: dates.length,
            until: formatLongDate(locale, dates[dates.length - 1] ?? date),
          })}{' '}
          {t('repeatBooking.skipNote')}
        </p>
      ) : null}
    </div>
  );
}
