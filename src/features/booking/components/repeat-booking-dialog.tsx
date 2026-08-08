'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { getLocaleDirection, type Locale } from '@/i18n/routing';

import { formatLongDate, formatMinute } from '../format';
import { DEFAULT_REPEAT_WEEKS, MAX_REPEAT_WEEKS, REPEAT_PRESETS, weeklyRepeatDates } from '../repeat';

/**
 * The offer made the moment a booking is saved: keep this slot, every week, for
 * as long as the course of care runs.
 *
 * It replaced a plain yes/no confirmation, because a fixed month fitted a
 * follow-up and nothing else — someone on a twelve-week programme had eleven
 * appointments to book by hand, and someone returning once next week had three
 * to cancel. So the span is the doctor's: a week, a month, three, six, or a
 * number of weeks they type.
 *
 * One select and, only if they ask for it, one number field. A repeat is a
 * question asked in passing, straight after a booking, and anything more
 * elaborate would be a form standing between the doctor and the calendar.
 *
 * The count under the control is not this component's opinion:
 * `weeklyRepeatDates` produces it and the server writes exactly those dates, so
 * the preview cannot drift from what happens.
 */

export type RepeatBookingDialogProps = {
  locale: Locale;
  /** Who the booking is for, and when — the first appointment, already saved. */
  clientName: string;
  date: string;
  startMinute: number;
  onConfirm: (weeks: number) => void;
  onCancel: () => void;
};

/** The select's own "let me type it" row. Not a span, so not a number. */
const CUSTOM = 'custom';

export function RepeatBookingDialog({
  locale,
  clientName,
  date,
  startMinute,
  onConfirm,
  onCancel,
}: RepeatBookingDialogProps) {
  const t = useTranslations('booking');

  const [weeks, setWeeks] = useState(DEFAULT_REPEAT_WEEKS);
  /**
   * Whether the doctor is choosing their own span.
   *
   * Held apart from `weeks`, because "custom" is a mode rather than a value: a
   * chosen 4 is still four weeks, and without this the first select would jump
   * back to "1 month" and take the second one away mid-choice.
   */
  const [custom, setCustom] = useState(false);

  // Every path sets a whole number of weeks between 1 and 52 — both selects
  // offer nothing else — so this is never empty and there is no invalid state
  // to guard against.
  const dates = weeklyRepeatDates(date, weeks);

  return (
    <Dialog
      open
      onClose={onCancel}
      label={t('repeatBooking.title')}
      dir={getLocaleDirection(locale)}
      className="sm:w-[min(24rem,calc(100vw-2rem))]"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(weeks);
        }}
      >
        <DialogHeader
          title={t('repeatBooking.title')}
          description={t('repeatBooking.body', {
            name: clientName,
            when: `${formatLongDate(locale, date)} · ${formatMinute(locale, date, startMinute)}`,
          })}
        />

        <DialogBody>
          {/*
            `div.space-y-1` and not `Field`, so this matches the dropdowns in
            `AppointmentDialog` exactly — same wrapper, same spacing, and no
            `.q-field-group`, whose `:focus-within` rule tints the label the
            moment the control is focused. Every other dropdown in the booking
            dialogs leaves its label alone, and one that lights up would be the
            odd control out.
          */}
          <div className="space-y-1">
            <Label htmlFor="repeat-duration">{t('repeatBooking.durationLabel')}</Label>
            <Select
              id="repeat-duration"
              value={custom ? CUSTOM : String(weeks)}
              onChange={(event) => {
                const next = event.target.value;
                setCustom(next === CUSTOM);
                if (next !== CUSTOM) setWeeks(Number(next));
              }}
            >
              {REPEAT_PRESETS.map((preset) => (
                <option key={preset.key} value={preset.weeks}>
                  {t(`repeatBooking.presets.${preset.key}`)}
                </option>
              ))}
              <option value={CUSTOM}>{t('repeatBooking.custom')}</option>
            </Select>
          </div>

          {/*
            The custom span is a second `Select`, not a number field: this app
            chooses from a fixed set with the shared dropdown everywhere it does
            it — the appointment dialog's start and duration, the intake form,
            the client filter — and a repeat is a whole number of weeks between
            one and 52, which is a fixed set. It also costs nothing to operate
            on a phone, where a number keyboard for two digits is the worst of
            both worlds.
          */}
          {custom && (
            <div className="space-y-1">
              <Label htmlFor="repeat-weeks">{t('repeatBooking.customLabel')}</Label>
              <Select
                id="repeat-weeks"
                autoFocus
                value={String(weeks)}
                onChange={(event) => setWeeks(Number(event.target.value))}
              >
                {Array.from({ length: MAX_REPEAT_WEEKS }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>
                    {t('repeatBooking.weeks', { count })}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {/*
            What the choice above actually commits to, in appointments and in a
            date. "1 month" is a span; "4 appointments, the last on 2 September"
            is the thing being agreed to, and it is the number that makes
            someone reconsider before clicking rather than after.

            The second line is said here rather than discovered afterwards: a
            long run will cross a closed day or an hour someone else has, and
            those weeks are skipped — see `repeatWeekly`, which counts them so
            the calendar can report the tally.
          */}
          <p className="rounded-md bg-secondary px-3 py-2 text-body-md text-secondary-foreground" dir="auto">
            {t('repeatBooking.preview', {
              count: dates.length,
              until: formatLongDate(locale, dates[dates.length - 1] ?? date),
            })}
          </p>

          <p className="text-caption text-muted-foreground" dir="auto">
            {t('repeatBooking.skipNote')}
          </p>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onCancel}>
            {t('repeatBooking.cancel')}
          </Button>
          <Button type="submit" size="sm" className="flex-1">
            {t('repeatBooking.confirm')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
