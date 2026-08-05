/**
 * Calendar-date arithmetic for the booking feature.
 *
 * Pure: no React, no database, no `Intl`. Everything here treats a date as
 * `YYYY-MM-DD` — a calendar fact, not an instant — following the precedent in
 * `src/features/clients/age.ts`. Where a `Date` object is unavoidable it is
 * built and read through the `UTC` accessors, so the result never depends on
 * the machine's zone: `new Date('2026-08-05')` parses as UTC midnight and is
 * already the 4th in some zones.
 *
 * ISO strings are zero-padded, which makes `a < b` a correct chronological
 * comparison. Several call sites rely on that instead of parsing.
 *
 * The value type and its parsing primitives now live in `src/lib/iso-date.ts`,
 * because the shared date picker needs them and a control in
 * `src/components/ui/` cannot reach into a feature. They are re-exported here
 * unchanged: this module is still the one place the booking code imports a
 * date from.
 */
import {
  daysInMonth,
  isoToParts,
  partsToIso,
  type IsoDate,
} from '@/lib/iso-date';

export {
  daysInMonth,
  isIsoDate,
  isValidDate,
  isoToLocalDate,
  isoToParts,
  parseDateInput,
  partsToIso,
  toIsoDate,
  type DateParts,
  type IsoDate,
} from '@/lib/iso-date';

/**
 * Day of the week, 0 = Sunday … 6 = Saturday — the same numbering as
 * `Date.prototype.getDay()` and as `clinics.working_days`.
 *
 * Returns null for an invalid date rather than a plausible-looking number.
 */
export function weekdayOf(iso: string): number | null {
  const parts = isoToParts(iso);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

/** Shifts by whole days. Crosses months, years and leap days correctly. */
export function addDays(iso: IsoDate, days: number): IsoDate {
  const parts = isoToParts(iso);
  if (!parts) return iso;

  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return partsToIso({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

export function addMonths(iso: IsoDate, months: number): IsoDate {
  const parts = isoToParts(iso);
  if (!parts) return iso;

  const target = new Date(Date.UTC(parts.year, parts.month - 1 + months, 1));
  const year = target.getUTCFullYear();
  const month = target.getUTCMonth() + 1;

  // 31 March minus one month is 28/29 February, not 3 March.
  return partsToIso({ year, month, day: Math.min(parts.day, daysInMonth(year, month)) });
}

/**
 * The `weekStartsOn`-th day on or before `iso`. Sunday (0) by default, which is
 * the first day of the clinic's week.
 */
export function startOfWeek(iso: IsoDate, weekStartsOn = 0): IsoDate {
  const weekday = weekdayOf(iso);
  if (weekday === null) return iso;
  return addDays(iso, -((weekday - weekStartsOn + 7) % 7));
}

export function startOfMonth(iso: IsoDate): IsoDate {
  const parts = isoToParts(iso);
  return parts ? partsToIso({ ...parts, day: 1 }) : iso;
}

export function endOfMonth(iso: IsoDate): IsoDate {
  const parts = isoToParts(iso);
  return parts ? partsToIso({ ...parts, day: daysInMonth(parts.year, parts.month) }) : iso;
}

/** `count` consecutive dates starting at `iso`. */
export function eachDay(iso: IsoDate, count: number): IsoDate[] {
  return Array.from({ length: Math.max(0, count) }, (_, offset) => addDays(iso, offset));
}

/**
 * The six-week grid a month view draws: whole weeks, padded either side with
 * neighbouring months so every row has seven cells.
 */
export function monthGridDays(iso: IsoDate, weekStartsOn = 0): IsoDate[] {
  return eachDay(startOfWeek(startOfMonth(iso), weekStartsOn), 42);
}

export function isSameMonth(a: IsoDate, b: IsoDate): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/**
 * Minutes from midnight rendered as `HH:MM` — a stable, locale-free value for a
 * `<input type="time">` or a `<select>`. Anything a human reads goes through
 * `Intl` in `src/lib/format.ts` instead.
 */
export function minuteToClock(minute: number): string {
  const normalized = ((Math.round(minute) % 1440) + 1440) % 1440;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(normalized / 60))}:${pad(normalized % 60)}`;
}

/**
 * Packs a clinic-local date and minute into a `Date` whose **UTC** fields carry
 * those exact wall-clock values.
 *
 * Purely a vehicle for `Intl.DateTimeFormat`, which only accepts a `Date`. The
 * stored value is a wall clock, not an instant, so the formatters in `./format.ts`
 * pair this with `timeZone: 'UTC'` and get the digits back unshifted. Building
 * the date in the runtime's own zone instead would render an hour out on any
 * machine not set to the clinic's — which is every CI box.
 */
export function toUtcInstant(iso: IsoDate, minute = 0): Date {
  const parts = isoToParts(iso) ?? { year: 1970, month: 1, day: 1 };
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, Math.floor(minute / 60), minute % 60));
}
