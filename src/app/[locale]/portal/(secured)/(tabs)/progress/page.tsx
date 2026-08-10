import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { AdherenceStreakCard } from '@/features/portal/components/adherence-streak-card';
import { AdherenceTrendCard } from '@/features/portal/components/adherence-trend-card';
import { TodayAdherenceCard } from '@/features/portal/components/today-adherence-card';
import { loadProgressPage } from '@/features/portal/page-data';
import { requirePortalClient } from '@/features/portal/session';
import { resolveLocale } from '@/i18n/params';

type ProgressPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: ProgressPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('progress') };
}

/**
 * The client's progress: adherence to the assigned nutrition plan, and
 * nothing else.
 *
 * Deliberately narrower than the home screen's "how is your week going"
 * check-in panels — sleep, mood, appetite, energy and water are general
 * wellness, answered on `/portal` from `client_check_ins`. This screen reads
 * `client_plan_adherence` only, because "did you follow your plan" is a
 * different clinical question from "how are you doing", and a client tracking
 * one should not have to read the other's numbers to find it.
 *
 * Three sections, in the order a client asks them: how today went (and the
 * one place to say so), how many days running, and the longer four-week arc.
 */
export default async function ProgressPage({ params }: ProgressPageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);
  const { today, streak, continuity, monthlyTrend } = await loadProgressPage(context);

  return (
    <div className="space-y-4">
      <TodayAdherenceCard today={today} locale={locale} />

      <AdherenceStreakCard streak={streak} continuity={continuity} />

      <AdherenceTrendCard weeks={monthlyTrend} />
    </div>
  );
}
