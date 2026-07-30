import { redirect } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';

type CalendarPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `/app/calendar` is not a view of its own — day, week and month each have their
 * own address. This sends the bare path to the week, the view that answers "what
 * does my clinic look like right now" best.
 *
 * Any query string is carried across, so a link to `/app/calendar?date=…` still
 * lands on the right week.
 */
export default async function CalendarIndexPage({ params, searchParams }: CalendarPageProps) {
  const locale = await resolveLocale(params);

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') query.set(key, value);
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : '';

  redirect({ href: `/app/calendar/week${suffix}`, locale });
}
