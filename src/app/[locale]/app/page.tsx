import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { AgeDistributionCard } from '@/features/dashboard/components/age-distribution-card';
import { AgendaTimeline } from '@/features/dashboard/components/agenda-timeline';
import { ClientsCard } from '@/features/dashboard/components/clients-card';
import { QuickActions } from '@/features/dashboard/components/quick-actions';
import { SexDistributionCard } from '@/features/dashboard/components/sex-distribution-card';
import { loadDashboard } from '@/features/dashboard/page-data';
import { formatLongDate } from '@/features/booking/format';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type DashboardPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: DashboardPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  return { title: t('title') };
}

/**
 * Resolves params, guards the route, and composes the feature's own components
 * — nothing more.
 *
 * **The whole dashboard fits one screen from `xl` up, and does not scroll.**
 * That is the constraint everything else on this page answers to: it is the
 * screen a dietitian leaves open all day, and a number you have to scroll to
 * find is a number you stop checking. The page claims the shell's full height
 * (`xl:h-full`), every row is sized or flexible rather than intrinsic, and the
 * one list that can grow without limit — today's appointments — scrolls inside
 * its own card instead of pushing the page taller.
 *
 * Below `xl` the columns stack and the page scrolls normally: one screen is a
 * desktop promise, and honouring it on a phone would mean four nested scrolls.
 *
 * Reading order down the working column: the four things you start a session by
 * doing, then your register, then the two charts you consult rather than act
 * on. The four summary counters that used to head this column are gone — every
 * number on them was a count of something one click away in the calendar or
 * the register, and they were costing the page its most valuable row.
 */
export default async function DashboardPage({ params }: DashboardPageProps) {
  const locale = await resolveLocale(params);
  const { session, clinicId } = await requireStaffClinic(locale);

  const [t, data] = await Promise.all([getTranslations('dashboard'), loadDashboard(clinicId)]);

  return (
    <div className="flex flex-col gap-4 text-start xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 xl:shrink-0">
        <h2 className="font-heading text-heading-lg font-semibold tracking-tight" dir="auto">
          {t('welcome', { name: session.user.name })}
        </h2>
        <p className="text-caption text-muted-foreground">{formatLongDate(locale, data.today)}</p>
      </div>

      <div className="grid gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[21rem_minmax(0,1fr)] 2xl:grid-cols-[23rem_minmax(0,1fr)]">
        <AgendaTimeline
          appointments={data.agenda}
          locale={locale}
          today={data.today}
          nowMinute={data.nowMinute}
        />

        <div className="flex min-w-0 flex-col gap-4 xl:min-h-0">
          <QuickActions locale={locale} />

          {/*
            The register card takes whatever height the two demographic cards
            add up to, which is why they share a row rather than stacking down
            the page: one row that ends where the screen does.
          */}
          <div className="grid gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <ClientsCard clients={data.recentClients} total={data.activeClients} locale={locale} />

            <div className="grid gap-4 sm:grid-cols-2 xl:min-h-0 xl:grid-cols-1 xl:grid-rows-2">
              <AgeDistributionCard
                age={data.demographics.age}
                total={data.demographics.total}
                locale={locale}
              />
              <SexDistributionCard
                sex={data.demographics.sex}
                total={data.demographics.total}
                locale={locale}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
