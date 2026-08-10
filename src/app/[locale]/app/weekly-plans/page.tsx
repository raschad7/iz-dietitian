import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { NoClientBoard } from '@/features/weekly-plans/components/no-client-board';
import { listCatalogForBoard, listPlannableClients } from '@/features/weekly-plans/queries';
import { PLANNER_THEME } from '@/features/weekly-plans/theme';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'weeklyPlans' });
  return { title: t('title') };
}

/**
 * The planner, before a client is chosen.
 *
 * The same shell `[clientId]/page.tsx` renders, in its empty state — not a
 * separate landing screen with a picker on it. Choosing a client navigates to
 * their board, where the header, the picker and the rail are already in the
 * places this page put them, so nothing jumps.
 *
 * The catalog is loaded with no allergens because there is no client to have
 * any: every dish is browsable and none is blocked.
 */
export default async function WeeklyPlansPage({ params }: PageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const [clients, catalog, t] = await Promise.all([
    listPlannableClients(clinicId),
    listCatalogForBoard([]),
    getTranslations('weeklyPlans'),
  ]);

  return (
    <div className={`${PLANNER_THEME} flex h-full min-h-0 min-w-0 flex-col text-start`}>
      <h1 className="sr-only">{t('title')}</h1>

      <div className="flex min-h-0 min-w-0 flex-1 gap-4">
        <NoClientBoard clients={clients} catalog={catalog} locale={locale} />
      </div>
    </div>
  );
}
