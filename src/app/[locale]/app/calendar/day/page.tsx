import { redirect } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `/app/calendar/day` is a legacy address. The three views are one route now,
 * distinguished by `?view=` (see `../page.tsx`), so this forwards to it with the
 * view set and any date carried across. The many links that still point here —
 * the dashboard, a client's visit record — keep working through this hop.
 */
export default async function CalendarDayPage({ params, searchParams }: PageProps) {
  const locale = await resolveLocale(params);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') query.set(key, value);
  }
  query.set('view', 'day');
  redirect({ href: `/app/calendar?${query.toString()}`, locale });
}
