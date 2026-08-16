import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
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
  return { title: `${t('nav.month')} · ${t('title')}` };
}

/** Resolves params, guards the route, renders. Everything else is the feature's. */
export default async function CalendarMonthPage({ params, searchParams }: PageProps) {
  const locale = await resolveLocale(params);
  const { session, clinicId } = await requireStaffClinic(locale);

  const [data, t] = await Promise.all([
    loadCalendarPage({ clinicId, ownerName: session.user.name }, 'month', await searchParams),
    getTranslations('booking'),
  ]);

  return (
    /*
      The calendar itself is full-bleed and claims the shell's height, so the
      shared header cannot simply sit above it: this column takes the height,
      hands the header what it needs and gives the grid the rest. `min-h-0` is
      what lets the grid shrink to that rest and scroll inside itself rather
      than pushing the closing hour past the floor of the window.
    */
    <div className="flex h-full min-h-0 flex-col">
      {/* The shared staff header — see `PageHeader`. The toolbar below keeps
          its own date navigator: that names the span you are looking at, while
          this names today. */}
      <PageHeader locale={locale} title={t('title')} clinicId={clinicId} />

      <div className="min-h-0 flex-1">
        <Calendar
          locale={locale}
          view="month"
          anchorDate={data.anchorDate}
          hours={data.hours}
          appointments={data.appointments}
          clients={data.clients}
        />
      </div>
    </div>
  );
}
