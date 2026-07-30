import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { Calendar } from '@/features/booking/components/calendar';
import { loadCalendarPage } from '@/features/booking/page-data';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'booking' });
  return { title: `${t('nav.day')} · ${t('title')}` };
}

/** Resolves params, guards the route, renders. Everything else is the feature's. */
export default async function CalendarDayPage({ params, searchParams }: PageProps) {
  const locale = await resolveLocale(params);
  const { session, clinicId } = await requireStaffClinic(locale);

  const data = await loadCalendarPage({ clinicId, ownerName: session.user.name }, 'day', await searchParams);

  return (
    <Calendar
      locale={locale}
      view="day"
      anchorDate={data.anchorDate}
      hours={data.hours}
      appointments={data.appointments}
      clients={data.clients}
    />
  );
}
