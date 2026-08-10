'use client';

import * as React from 'react';

import { SelectField, type SelectFieldOption } from '@/components/ui/select-field';

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

const HOURS: SelectFieldOption<string>[] = Array.from({ length: 24 }, (_, hour) => {
  const value = String(hour).padStart(2, '0');
  return { value, label: value };
});

/**
 * How far apart the minutes in the list sit.
 *
 * Five is the default because meal times land on five-minute boundaries in
 * practice. It is a prop rather than a constant because not every caller has
 * the same grid: the clinic's opening hours are validated at fifteen, so a
 * five-step list there offers ten choices per hour that the server will
 * reject — a control must not present a value its own form refuses.
 */
const DEFAULT_MINUTE_STEP = 5;

function minuteOptions(step: number): SelectFieldOption<string>[] {
  return Array.from({ length: Math.floor(60 / step) }, (_, index) => {
    const value = String(index * step).padStart(2, '0');
    return { value, label: value };
  });
}

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
  minuteStep = DEFAULT_MINUTE_STEP,
  onValueChange,
}: {
  name: string;
  /** `HH:MM`. */
  defaultValue: string;
  hourLabel: string;
  minuteLabel: string;
  id?: string;
  disabled?: boolean;
  /** Minutes between list entries. Match it to whatever validates the value. */
  minuteStep?: number;
  /**
   * Notified whenever either list moves.
   *
   * The field stays uncontrolled — the value is posted by the hidden input
   * below, and a caller that only wants a form submitted needs none of this.
   * It exists because a hidden input's value, set by React, fires no `input`
   * or `change` event at all: a form listening for edits cannot see this
   * control move, which silently exempted every time on a page from an
   * unsaved-changes guard.
   */
  onValueChange?: (value: string) => void;
}) {
  const initial = split(defaultValue);

  const [hour, setHour] = React.useState(initial.hour);
  const [minute, setMinute] = React.useState(initial.minute);

  /*
   * A stored minute off the five-step grid keeps its own entry, so opening a
   * 07:32 slot and saving without touching it leaves 07:32 alone.
   */
  const minutes = React.useMemo(() => {
    const options = minuteOptions(minuteStep);
    if (!minute || options.some((option) => option.value === minute)) return options;

    return [...options, { value: minute, label: minute }].sort((a, b) =>
      a.value.localeCompare(b.value),
    );
  }, [minute, minuteStep]);

  return (
    <div className="flex items-center gap-2" dir="ltr">
      {/*
        One hidden input carrying `HH:MM`, so the action and the schema are
        untouched by this change. The two lists below are presentation.
      */}
      <input type="hidden" name={name} value={hour && minute ? `${hour}:${minute}` : ''} />

      <SelectField
        id={id}
        value={hour}
        onValueChange={(next) => {
          setHour(next);
          onValueChange?.(next && minute ? `${next}:${minute}` : '');
        }}
        options={HOURS}
        aria-label={hourLabel}
        disabled={disabled}
      />

      <span aria-hidden="true" className="text-body-sm font-semibold text-muted-foreground">
        :
      </span>

      <SelectField
        value={minute}
        onValueChange={(next) => {
          setMinute(next);
          onValueChange?.(hour && next ? `${hour}:${next}` : '');
        }}
        options={minutes}
        aria-label={minuteLabel}
        disabled={disabled}
      />
    </div>
  );
}
