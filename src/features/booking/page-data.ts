import { addDays, eachDay, monthGridDays, startOfWeek, toIsoDate } from './date';
import { getCalendarData, getClientCalendarData } from './queries';
import { ensurePractitioner } from './mutations';
import { calendarSearchSchema, type CalendarView } from './schema';
import { type CalendarData } from './types';

/**
 * The shared server-side work behind `/app/calendar/{day,week,month}`.
 *
 * Each view is its own route so that a day, a week and a month are separate
 * addresses — bookmarkable, linkable, and each with its own metadata. What they
 * have in common is exactly this: resolve the date, work out the span to load,
 * read it. Keeping that here means the three page files stay thin, which is the
 * project's architecture rule.
 */

/**
 * The span of dates a view needs loaded — which is not the same as the dates it
 * names: the month grid is padded out to whole weeks, so it shows days either
 * side of the month itself.
 */
export function rangeFor(view: CalendarView, anchorDate: string): { from: string; to: string } {
  if (view === 'day') return { from: anchorDate, to: anchorDate };

  if (view === 'week') {
    const days = eachDay(startOfWeek(anchorDate), 7);
    return { from: days[0] ?? anchorDate, to: days[6] ?? anchorDate };
  }

  const days = monthGridDays(anchorDate);
  return { from: days[0] ?? anchorDate, to: days[days.length - 1] ?? addDays(anchorDate, 41) };
}

export type CalendarPageData = CalendarData & { anchorDate: string };

/**
 * Resolves the anchor date from the query string and loads the view's range.
 *
 * `ensurePractitioner` runs first so a clinic that has never booked anything
 * still has the row every appointment hangs off. It is idempotent, and doing it
 * on read rather than at sign-up means accounts created before this feature
 * existed are provisioned the first time they open the calendar.
 */
export async function loadCalendarPage(
  context: { clinicId: string; ownerName: string },
  view: CalendarView,
  searchParams: Record<string, string | string[] | undefined>,
): Promise<CalendarPageData> {
  const parsed = calendarSearchSchema.parse(searchParams);

  // The schema cannot supply this default — it has no clock. An unparameterised
  // URL opens on the clinic's today.
  const anchorDate = parsed.date ?? toIsoDate(new Date());

  await ensurePractitioner(context);

  const { from, to } = rangeFor(view, anchorDate);
  const data = await getCalendarData(context.clinicId, from, to);

  return { ...data, anchorDate };
}

/**
 * The same resolution as {@link loadCalendarPage}, for one client's Visit
 * History tab. A separate function rather than an optional parameter on the
 * one above: that one is read by the clinic-wide calendar on every request,
 * and threading an unused `clientId` through it for the sake of one caller
 * would be a parameter nobody at that call site needs to think about.
 */
export async function loadClientCalendarPage(
  context: { clinicId: string; ownerName: string },
  clientId: string,
  view: CalendarView,
  searchParams: Record<string, string | string[] | undefined>,
): Promise<CalendarPageData> {
  const parsed = calendarSearchSchema.parse(searchParams);
  const anchorDate = parsed.date ?? toIsoDate(new Date());

  await ensurePractitioner(context);

  const { from, to } = rangeFor(view, anchorDate);
  const data = await getClientCalendarData(context.clinicId, clientId, from, to);

  return { ...data, anchorDate };
}
