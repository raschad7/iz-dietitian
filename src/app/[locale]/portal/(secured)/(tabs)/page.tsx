import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { NextAppointmentPreview } from '@/features/portal/components/next-appointment-preview';
import { PlanPreview } from '@/features/portal/components/plan-preview';
import { WeekAdherenceStrip } from '@/features/portal/components/week-adherence-strip';
import { WeekProgress } from '@/features/portal/components/week-progress';
import { loadDashboard } from '@/features/portal/page-data';
import { requirePortalClient } from '@/features/portal/session';
import { resolveLocale } from '@/i18n/params';
import { formatDate } from '@/lib/format';

type PortalPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PortalPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'portal' });
  return { title: t('title') };
}

/**
 * The portal's landing page: how the week is going, and two ways onward.
 *
 * **Four sections, in one order.** The week the client has had, how much of it
 * they have recorded, the plan they are on, and when they are next seen. The
 * first two are about them; the last two are about the clinic, and that is the
 * order someone opening the app on their phone reads in.
 *
 * **What is deliberately not here.** The five-metric summary — energy, sleep,
 * appetite, mood, water — moved off this screen: it repeated in five rows what
 * the day scores in the strip already average into one number, and it was the
 * tallest thing on the page. Today's full meal list and the full appointment
 * card went the same way, down to the preview rows, because both were verbatim
 * copies of the screens they link to. Nothing was deleted from the product;
 * each is one tap away on the page that owns it.
 *
 * The pending-request note is gone too — the bell's dot and the drawer's count
 * both carry it now, and a third copy on the page said nothing new.
 */
export default async function PortalPage({ params }: PortalPageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);
  const { next, planTitle, today, week, streak } = await loadDashboard(context);

  return (
    <div className="space-y-4">
      {/*
        The month rides on the strip's own heading row, not on the header
        above it — a small label opposite "أيام الأسبوع", which is the section
        the date is describing.
      */}
      <WeekAdherenceStrip
        days={week.days}
        month={formatDate(locale, context.now.date, { dateStyle: undefined, month: 'short' })}
      />

      <WeekProgress
        averageFraction={week.averageFraction}
        recordedCount={week.recordedCount}
        streak={streak}
      />

      <PlanPreview day={today} planWeek={planTitle} />

      <NextAppointmentPreview appointment={next} />
    </div>
  );
}
