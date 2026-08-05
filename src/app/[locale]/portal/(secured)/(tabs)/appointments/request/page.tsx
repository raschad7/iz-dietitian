import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { Icon } from '@/components/ui/icon';
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
 * Asking the dietitian for an appointment.
 *
 * This route redirected away for a while: the portal redesign made appointments
 * read-only, on the reasoning that the dietitian books them. Clients do ask, so
 * it is a form again — but the shape of the answer has not changed, and that is
 * the important part. **Nothing here books anything.** The form files a row in
 * `appointment_requests`, which carries no authority over the calendar until the
 * dietitian approves it from `/app/requests`; the copy on the page says so
 * plainly rather than implying a confirmed slot.
 *
 * The days and the times come from the server, computed by the same rule engine
 * that governs a real booking (`src/features/portal/slots.ts`). Choosing a day
 * is therefore a navigation — `?date=` — rather than a filter applied in the
 * browser: recomputing availability client-side would mean a second copy of the
 * rules free to drift, and shipping the month's bookings to do it would tell
 * each client when everyone else is booked.
 *
 * `?kind=` and `?appointmentId=` are honoured because `loadRequestPage` already
 * resolves them, and a stale link falls back to a new request rather than
 * 404ing. `RequestForm` renders whichever of the three it is handed.
 */
export default async function RequestAppointmentPage({ params, searchParams }: RequestPageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);

  const search = requestSearchSchema.parse(await searchParams);
  const data = await loadRequestPage(context, search);

  const t = await getTranslations('portal');

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/portal/appointments"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <Icon name="chevronStart" className="size-4" />
          {t('request.backToAppointments')}
        </Link>

        <div className="space-y-1">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">
            {t(`request.heading.${data.kind}`)}
          </h2>
          {/* The one sentence that stops this reading as a booking screen: the
              dietitian confirms, and until they do nothing is held. */}
          <p className="text-sm text-muted-foreground">{t(`request.description.${data.kind}`)}</p>
        </div>
      </header>

      <RequestForm {...data} locale={locale} />
    </div>
  );
}
