import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AppointmentCard } from '@/features/portal/components/appointment-card';
import { TodayMeals } from '@/features/portal/components/today-meals';
import { loadDashboard } from '@/features/portal/page-data';
import { requirePortalClient } from '@/features/portal/session';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';

type PortalPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PortalPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'portal' });
  return { title: t('title') };
}

/**
 * The portal's landing page: a quick glance, and two ways onward.
 *
 * What is here is what someone opening the app on their phone wants to know
 * without reading anything: when am I next seen, and what am I eating today.
 * Everything else is a tap away — this page is deliberately not a summary of
 * every screen behind it.
 */
export default async function PortalPage({ params }: PortalPageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);
  const { next, planTitle, today, pending } = await loadDashboard(context);

  const t = await getTranslations('portal');

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">
          {t('welcome', { name: context.profile.fullName })}
        </h2>
        {pending.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('dashboard.pendingRequests', { count: pending.length })}
          </p>
        ) : null}
      </header>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">{t('dashboard.nextAppointment')}</h3>

        {next ? (
          <AppointmentCard appointment={next} />
        ) : (
          <Card>
            <CardContent className="text-sm text-muted-foreground">{t('appointments.noneUpcoming')}</CardContent>
          </Card>
        )}
      </section>

      <TodayMeals day={today} planTitle={planTitle} />

      {/*
        The two shortcuts, full width and stacked on a phone: they are the only
        things on this page anyone taps deliberately.
      */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/portal/appointments/request" className={buttonVariants({ size: 'lg' })}>
          {t('dashboard.requestAppointment')}
        </Link>
        <Link href="/portal/meal-plan" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          {t('dashboard.viewMealPlan')}
        </Link>
      </div>
    </div>
  );
}
