import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { ClientPicker } from '@/features/weekly-plans/components/client-picker';
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
 * The picker is the whole page: choosing a client is the first step of the
 * workflow, so there is nothing else to show and no reason to invent a
 * dashboard.
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

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
        <ClientPicker clients={clients} />
        <p className="text-body-sm text-muted-foreground">{t('selectClient')}</p>
      </div>
    </div>
  );
}
