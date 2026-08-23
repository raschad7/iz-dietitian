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
 * one place to say so), how many days running, and the longer four-week arc —
 * each one a wider window than the last. The week's own journey card — the
 * mascot and the week-average fraction — used to sit between the first two;
 * it is gone from this screen, kept only on the home tab.
 */
export default async function ProgressPage({ params }: ProgressPageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);
  const { today, streak, continuity, monthlyTrend } = await loadProgressPage(context);

  return (
    <div className="space-y-4">
      <TodayAdherenceCard today={today} locale={locale} />

      {/*
        Both cards animate from the moment the page paints — the ring counts up
        while the streak curve draws itself in.

        ⚠ **The curve deliberately does not wait for the ring**, and it was
        tried the other way first. Holding it back left the plot blank for as
        long as the wait ran, which reads as a card that failed to load rather
        than as a sequence — and worse when there is nothing to wait for at all:
        `today` is null until something is reported and the fraction is 0 for an
        untouched day, so the ring often paints instantly and the queue was
        waiting on an animation that never played. Anchoring one to the other
        also has no honest anchor point, because `--ease-sweep` decelerates into
        its value and the ring has no crisp end to key off. Both start at zero;
        neither can be late.
      */}
      <AdherenceStreakCard streak={streak} continuity={continuity} />

      <AdherenceTrendCard weeks={monthlyTrend} />
    </div>
  );
}
