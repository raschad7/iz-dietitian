import { toIsoDate } from './date';
import { getCalendarData, getClientCalendarData } from './queries';
import { ensurePractitioner } from './mutations';
import { loadedRangeFor } from './range';
import { calendarSearchSchema } from './schema';
import { type CalendarData } from './types';

/**
 * The shared server-side work behind `/app/calendar`.
 *
 * The three views are one route told apart by `?view=`, so a day, a week and a
 * month are still separate addresses — bookmarkable, linkable, each with its own
 * metadata — without being separate pages. What the route needs is exactly this:
 * resolve the date, work out the span to load, read it. Keeping that here means
 * the page file stays thin, which is the project's architecture rule.
 */

/**
 * `rangeFor` moved to `./range`, which the client calendar imports too — this
 * module opens the database on the next line, so a `'use client'` file cannot
 * reach it.
 *
 * Note what the two loaders below now ask for: `loadedRangeFor`, not
 * `rangeFor(view, …)`. The span read is the same for all three views — the
 * month grid, which holds the other two — so a reader who switches view is
 * asking for a different arrangement of rows the browser already has, and gets
 * it in the same frame as the press. See `loadedRangeFor`.
 */

export type CalendarPageData = CalendarData & { anchorDate: string };

/**
 * Resolves the anchor date from the query string and loads the span around it.
 *
 * It takes no view. It used to, and the span it read depended on it; the span
 * is the same for all three now (see `loadedRangeFor`), which is what lets the
 * browser switch between them without asking.
 *
 * `ensurePractitioner` runs first so a clinic that has never booked anything
 * still has the row every appointment hangs off. It is idempotent, and doing it
 * on read rather than at sign-up means accounts created before this feature
 * existed are provisioned the first time they open the calendar.
 */
export async function loadCalendarPage(
  context: { clinicId: string; ownerName: string },
  searchParams: Record<string, string | string[] | undefined>,
): Promise<CalendarPageData> {
  const parsed = calendarSearchSchema.parse(searchParams);

  // The schema cannot supply this default — it has no clock. An unparameterised
  // URL opens on the clinic's today.
  const anchorDate = parsed.date ?? toIsoDate(new Date());

  await ensurePractitioner(context);

  const { from, to } = loadedRangeFor(anchorDate);
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
  searchParams: Record<string, string | string[] | undefined>,
): Promise<CalendarPageData> {
  const parsed = calendarSearchSchema.parse(searchParams);
  const anchorDate = parsed.date ?? toIsoDate(new Date());

  await ensurePractitioner(context);

  const { from, to } = loadedRangeFor(anchorDate);
  const data = await getClientCalendarData(context.clinicId, clientId, from, to);

  return { ...data, anchorDate };
}
