import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { RequestForm } from '@/features/portal/components/request-form';
import { loadRequestPage } from '@/features/portal/page-data';
import { requestSearchSchema } from '@/features/portal/schema';
import { requirePortalClient } from '@/features/portal/session';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';

type RequestPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: RequestPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'portal' });
  return { title: t('request.title') };
}

/**
 * Asking for an appointment — a new one, a different time for one, or its
 * cancellation.
 *
 * One route for all three, distinguished by `?kind=`. They share a form, a
 * validator and an action; giving each its own page would triple that for the
 * sake of a heading. `?appointmentId=` names the appointment for the latter
 * two, and is checked against this client's own record before it is honoured —
 * see `loadRequestPage`.
 */
export default async function RequestAppointmentPage({ params, searchParams }: RequestPageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);

  const search = requestSearchSchema.parse(await searchParams);
  const data = await loadRequestPage(context, search);

  const t = await getTranslations('portal');

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">{t(`request.heading.${data.kind}`)}</h2>
        <p className="text-sm text-muted-foreground">{t(`request.description.${data.kind}`)}</p>
      </header>

      <RequestForm {...data} locale={locale} />

      <p className="text-center text-sm">
        <Link href="/portal/appointments" className="text-muted-foreground underline-offset-4 hover:underline">
          {t('request.backToAppointments')}
        </Link>
      </p>
    </div>
  );
}
