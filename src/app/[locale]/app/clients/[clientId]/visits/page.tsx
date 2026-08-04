import { redirect } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';

type ClientVisitsIndexPageProps = {
  params: Promise<{ locale: string; clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `/visits` is not a view of its own — day, week and month each have their
 * own address, same as the clinic-wide calendar. This sends the bare path to
 * the week, carrying any query string along.
 */
export default async function ClientVisitsIndexPage({ params, searchParams }: ClientVisitsIndexPageProps) {
  const locale = await resolveLocale(params);
  const { clientId } = await params;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') query.set(key, value);
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : '';

  redirect({ href: `/app/clients/${clientId}/visits/week${suffix}`, locale });
}
