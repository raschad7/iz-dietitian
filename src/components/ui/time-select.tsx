'use client';

import * as React from 'react';

import { SelectMenu, type SelectOption } from '@/components/ui/select-menu';

/**
 * A wall-clock time as **one** list of whole times — `08:00`, `08:15`, `08:30`.
 *
 * ## Why this exists beside `TimeField`
 *
 * `TimeField` splits the time into an hour list and a minute list, which is the
 * right shape when the two are chosen independently and the grid is fine: a
 * meal at 07:35 is picked as "7" then "35" in two short lists.
 *
 * It is the wrong shape for a value that is really one choice off a short menu.
 * The clinic's opening hours were seven rows of *four* of those lists — hour,
 * minute, hour, minute, twenty-eight controls to say "we open at eight and
 * close at six" — and none of the four told you what the resulting time was
 * without reading two boxes and joining them yourself. A single list says
 * `08:00`, and setting a day's hours is two clicks instead of four.
 *
 * Use this where the times sit on a coarse grid and the whole time is the unit
 * of choice. Use `TimeField` where the grid is fine or the range is a full day
 * of arbitrary minutes — 96 entries is a scrollable list, 288 is not.
 *
 * ## Behaviour
 *
 * Controlled, because every caller that wants one time also wants to copy it
 * somewhere: "apply these hours to every working day" is not expressible over
 * an uncontrolled field. Pass `name` to post it directly, or leave it off and
 * post the value yourself.
 *
 * A stored value off the grid keeps its own entry rather than being rounded
 * away, the same rule `TimeField` follows — silently moving a clinic's 08:20
 * open to 08:15 on load is data loss disguised as tidiness.
 */

/** Every `HH:MM` from `00:00`, `step` minutes apart. */
function timeOptions(step: number): SelectOption[] {
  return Array.from({ length: Math.floor((24 * 60) / step) }, (_, index) => {
    const total = index * step;
    const value = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    return { value, label: value };
  });
}

export function TimeSelect({
  value,
  onChange,
  step,
  name,
  id,
  disabled,
  className,
  'aria-label': ariaLabel,
}: {
  /** `HH:MM`. */
  value: string;
  onChange: (value: string) => void;
  /** Minutes between entries. Match it to whatever validates the value. */
  step: number;
  name?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}) {
  const options = React.useMemo(() => {
    const grid = timeOptions(step);
    if (!value || grid.some((option) => option.value === value)) return grid;

    return [...grid, { value, label: value }].sort((a, b) => a.value.localeCompare(b.value));
  }, [step, value]);

  return (
    /*
      `dir="ltr"`, like `TimeField`: a clock time is one left-to-right run in
      both scripts, and `08:00` reversed to `00:08` in an Arabic column is the
      kind of error nobody reads twice.
    */
    <div dir="ltr" className={className}>
      <SelectMenu
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        options={options}
        disabled={disabled}
        aria-label={ariaLabel}
      />
    </div>
  );
}
