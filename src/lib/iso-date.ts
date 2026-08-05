/**
 * The calendar date, as a value.
 *
 * A `YYYY-MM-DD` string is a *calendar fact* — a birthday, the day of a visit —
 * not an instant, and this module keeps it that way. Everything here is pure:
 * no React, no `Intl`, no database. Where a `Date` object is unavoidable it is
 * built and read through the `UTC` accessors, so the result never depends on
 * the machine's zone: `new Date('2026-08-05')` parses as UTC midnight and is
 * already the 4th in some of them.
 *
 * ISO strings are zero-padded, which makes `a < b` a correct chronological
 * comparison. Several call sites rely on that instead of parsing.
 *
 * These primitives were the generic half of `src/features/booking/date.ts` and
 * moved here when the date picker in `src/components/ui/` came to need them —
 * a shared control cannot import a feature. That module still owns the
 * booking-grid arithmetic (weeks, month grids, wall-clock minutes) and
 * re-exports everything below, so its callers never had to know.
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
 * The `Date` a calendar widget wants: **local** midnight on that day.
 *
 * The mirror of `toIsoDate`, and the pair has to stay symmetrical. A picker
 * hands back whatever `Date` it was given and we read its local fields, so
 * building it in UTC here would hand back yesterday everywhere west of
 * Greenwich — the single most common way a date field loses a day.
 *
 * Returns null for anything that is not a real date, so a half-typed value
 * cannot open the grid on the year 202.
 */
export function isoToLocalDate(iso: string): Date | null {
  const parts = isoToParts(iso);
  return parts ? new Date(parts.year, parts.month - 1, parts.day) : null;
}

/**
 * Parses what a human typed into a date field.
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
