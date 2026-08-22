import { redirect } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `/app/calendar/week` is a legacy address. The three views are one route now,
 * distinguished by `?view=` (see `../page.tsx`); this forwards to it with the
 * view set and any date carried across, so existing links keep working.
 */
export default async function CalendarWeekPage({ params, searchParams }: PageProps) {
  const locale = await resolveLocale(params);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') query.set(key, value);
  }
  query.set('view', 'week');
  redirect({ href: `/app/calendar?${query.toString()}`, locale });
}
