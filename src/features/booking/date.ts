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
 */

/** A `YYYY-MM-DD` calendar date. */
export type IsoDate = string;

export type DateParts = { year: number; month: number; day: number };

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) return 0;
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1] ?? 0;
}

/**
 * True only for a date that actually existed. `2026-02-30` is syntactically
 * fine and semantically nonsense; `new Date(2026, 1, 30)` would silently roll it
 * forward to March, which is exactly the corruption this prevents.
 */
export function isValidDate({ year, month, day }: DateParts): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2200) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

export function partsToIso({ year, month, day }: DateParts): IsoDate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** Returns null for anything that is not a real `YYYY-MM-DD` date. */
export function isoToParts(iso: string): DateParts | null {
  const match = ISO_PATTERN.exec(iso);
  if (!match) return null;

  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  return isValidDate(parts) ? parts : null;
}

export function isIsoDate(value: string): boolean {
  return isoToParts(value) !== null;
}

/** Reads a `Date`'s **local** calendar day. Used only on values already local. */
export function toIsoDate(value: Date): IsoDate {
  return partsToIso({ year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() });
}

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
 * Parses what a human typed into the popup's date field.
 *
 * Accepts `2026-08-05`, `8/5/2026` and `08-05-2026`. The two slash/dash forms
 * are read **month first**, matching the `M/D/YYYY` in the spec — `13/5/2026` is
 * therefore rejected rather than silently read as 13 May.
 *
 * Returns null for anything malformed or for a date that never existed, so the
 * caller can snap the field back instead of writing a rolled-over value.
 */
export function parseDateInput(raw: string): IsoDate | null {
  const value = raw.trim();
  if (value === '') return null;

  const iso = ISO_PATTERN.exec(value);
  if (iso) {
    const parts = { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
    return isValidDate(parts) ? partsToIso(parts) : null;
  }

  const parsed = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if (!parsed) return null;

  const parts = { year: Number(parsed[3]), month: Number(parsed[1]), day: Number(parsed[2]) };
  return isValidDate(parts) ? partsToIso(parts) : null;
}

/**
 * Minutes from midnight rendered as `HH:MM` — a stable, locale-free value for a
 * `<input type="time">` or a `<select>`. Anything a human reads goes through
 * `Intl` in `src/lib/format.ts` instead.
 */
export function minuteToClock(minute: number): string {
  const normalized = ((Math.round(minute) % 1440) + 1440) % 1440;
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
