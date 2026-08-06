'use client';

import * as React from 'react';

import { SelectMenu, type SelectOption } from '@/components/ui/select-menu';

/**
 * A wall-clock time, as two lists rather than an `<input type="time">`.
 *
 * The native control is the thing this replaces and the reason is entirely
 * about its popup: Chrome draws a three-column spinner of hours, *sixty*
 * minutes and AM/PM in the OS's own type, which inside this app's dialog reads
 * as a foreign object, forces a 12-hour mental step in a 24-hour clinic, and
 * makes picking 07:30 a scroll through thirty rows.
 *
 * Two lists instead: twenty-four hours, and minutes in five-minute steps. Meal
 * times land on five-minute boundaries in practice, and the two together are
 * eleven fewer interactions than the spinner. A stored value that is *not* on a
 * boundary — a legacy row, or a hand-edited one — is added to the list rather
 * than rounded away, because silently moving someone's 07:32 to 07:30 on open
 * is data loss disguised as tidiness.
 *
 * Posts one field, `HH:MM`, exactly as the native input did, so nothing on the
 * server side changes.
 */

const HOURS: SelectOption[] = Array.from({ length: 24 }, (_, hour) => {
  const value = String(hour).padStart(2, '0');
  return { value, label: value };
});

const MINUTE_STEP = 5;

const MINUTES: SelectOption[] = Array.from({ length: 60 / MINUTE_STEP }, (_, index) => {
  const value = String(index * MINUTE_STEP).padStart(2, '0');
  return { value, label: value };
});

/** Splits `HH:MM`, tolerating `HH:MM:SS` and an empty value. */
function split(value: string): { hour: string; minute: string } {
  const [hour = '', minute = ''] = value.split(':');
  return { hour: hour.padStart(2, '0'), minute: minute.padStart(2, '0') };
}

export function TimeField({
  name,
  defaultValue,
  hourLabel,
  minuteLabel,
  id,
  disabled,
}: {
  name: string;
  /** `HH:MM`. */
  defaultValue: string;
  hourLabel: string;
  minuteLabel: string;
  id?: string;
  disabled?: boolean;
}) {
  const initial = split(defaultValue);

  const [hour, setHour] = React.useState(initial.hour);
  const [minute, setMinute] = React.useState(initial.minute);

  /*
   * A stored minute off the five-step grid keeps its own entry, so opening a
   * 07:32 slot and saving without touching it leaves 07:32 alone.
   */
  const minutes = React.useMemo(() => {
    if (!minute || MINUTES.some((option) => option.value === minute)) return MINUTES;

    return [...MINUTES, { value: minute, label: minute }].sort((a, b) =>
      a.value.localeCompare(b.value),
    );
  }, [minute]);

  return (
    <div className="flex items-center gap-2" dir="ltr">
      {/*
        One hidden input carrying `HH:MM`, so the action and the schema are
        untouched by this change. The two lists below are presentation.
      */}
      <input type="hidden" name={name} value={hour && minute ? `${hour}:${minute}` : ''} />

      <SelectMenu
        id={id}
        value={hour}
        onChange={setHour}
        options={HOURS}
        aria-label={hourLabel}
        disabled={disabled}
      />

      <span aria-hidden="true" className="text-body-sm font-semibold text-muted-foreground">
        :
      </span>

      <SelectMenu
        value={minute}
        onChange={setMinute}
        options={minutes}
        aria-label={minuteLabel}
        disabled={disabled}
      />
    </div>
  );
}
