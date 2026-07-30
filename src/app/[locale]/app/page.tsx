import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { AgendaCard } from '@/features/dashboard/components/agenda-card';
import { AttentionCard } from '@/features/dashboard/components/attention-card';
import { QuickActions } from '@/features/dashboard/components/quick-actions';
import { RequestsCard } from '@/features/dashboard/components/requests-card';
import { StatTiles } from '@/features/dashboard/components/stat-tiles';
import { loadDashboard } from '@/features/dashboard/page-data';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';
import { formatDate } from '@/lib/format';

type DashboardPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: DashboardPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  return { title: t('title') };
}

/** Resolves params, guards the route, and composes the feature's own components — nothing more. */
export default async function DashboardPage({ params }: DashboardPageProps) {
  const locale = await resolveLocale(params);
  const { session, clinicId } = await requireStaffClinic(locale);

  const [t, data] = await Promise.all([getTranslations('dashboard'), loadDashboard(clinicId)]);

  return (
    <div className="space-y-6 text-start">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">{t('welcome', { name: session.user.name })}</h2>
        <p className="text-sm text-muted-foreground">{formatDate(locale, new Date())}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AgendaCard appointments={data.agenda} locale={locale} today={data.today} />
        </div>

        <div className="flex flex-col gap-6 lg:col-span-1">
          <RequestsCard items={data.pendingRequests.items} total={data.pendingRequests.total} locale={locale} />
          <AttentionCard items={data.attention} />
        </div>

        <div className="lg:col-span-3">
          <StatTiles stats={data.stats} locale={locale} />
        </div>

        <div className="lg:col-span-3">
          <QuickActions />
        </div>
      </div>
    </div>
  );
}
