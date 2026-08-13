import type { ClinicDayHours } from './types';

/**
 * The week, collapsed into the way opening hours are actually read.
 *
 * Seven lines of `الأحد 08:00 – 18:00` repeated five times is a list you have
 * to *compare against itself* to find out what the clinic's week is. Almost
 * every clinic works one set of hours on most days, so the useful reading is
 * two lines: when it is open, and when it is not.
 *
 * Consecutive days sharing identical hours become one span. Consecutive
 * matters — a run is only collapsible if the days are adjacent, otherwise
 * "Sunday–Thursday" would be printed for a clinic that shuts on Tuesday. A
 * clinic with genuinely different hours every day gets seven spans back and
 * loses nothing.
 *
 * The week starts on Sunday, matching `Date.prototype.getDay()` and the
 * clinic's own `workingDays` column.
 */
export type ScheduleSpan = {
  /** Weekday index the span starts on. */
  from: number;
  /** Weekday index it ends on — equal to `from` for a single day. */
  to: number;
  isWorking: boolean;
  openMinute: number | null;
  closeMinute: number | null;
};

function sameHours(a: ClinicDayHours, b: ClinicDayHours): boolean {
  if (a.isWorking !== b.isWorking) return false;
  if (!a.isWorking || !b.isWorking) return true;
  return a.openMinute === b.openMinute && a.closeMinute === b.closeMinute;
}

export function summarizeSchedule(days: readonly ClinicDayHours[]): ScheduleSpan[] {
  const spans: ScheduleSpan[] = [];

  for (const day of days) {
    const previous = spans.at(-1);
    const previousDay = previous ? days[previous.to] : undefined;

    // Extend the open span when this day is adjacent to it and reads the same.
    if (previous && previousDay && previous.to === day.weekday - 1 && sameHours(previousDay, day)) {
      previous.to = day.weekday;
      continue;
    }

    spans.push({
      from: day.weekday,
      to: day.weekday,
      isWorking: day.isWorking,
      openMinute: day.openMinute,
      closeMinute: day.closeMinute,
    });
  }

  return spans;
}

/**
 * Always two digits, and rendered inside an LTR isolate by the caller. A clock
 * reading is Latin-scripted in both builds, like a phone number.
 */
export function minutesToTime(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}
