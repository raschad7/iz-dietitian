import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { ClientRail } from '@/features/weekly-plans/components/client-rail';
import { listPlannableClients } from '@/features/weekly-plans/queries';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'weeklyPlans' });
  return { title: t('title') };
}

/**
 * The board with no client chosen.
 *
 * The rail is the whole page: picking a client is the first step of the workflow,
 * so there is nothing else to show and no reason to invent a dashboard.
 */
export default async function WeeklyPlansPage({ params }: PageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const [clients, t] = await Promise.all([
    listPlannableClients(clinicId),
    getTranslations('weeklyPlans'),
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 text-start">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <ClientRail clients={clients} />

        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border">
          <p className="text-sm text-muted-foreground">{t('selectClient')}</p>
        </div>
      </div>
    </div>
  );
}
