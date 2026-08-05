import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { RequestsInbox } from '@/features/requests/components/requests-inbox';
import { loadRequests } from '@/features/requests/page-data';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type RequestsPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: RequestsPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'requests' });
  return { title: t('title') };
}

/**
 * Everything clients have asked for, and the place it is answered.
 *
 * Requests used to reach the dietitian as read-only lines in the notifications
 * feed, which linked to the calendar day they asked about and left them
 * `pending` for ever — a client could ask, and nobody could answer. This is the
 * screen that answers.
 *
 * Approving books through the ordinary path in `src/features/booking/`, so
 * every calendar rule applies to it automatically; see the header of
 * `src/features/requests/mutations.ts`.
 *
 * `now` is read once here and passed down, so every "3 hours ago" on the page
 * is measured from the same instant rather than each card reading its own clock.
 */
export default async function RequestsPage({ params }: RequestsPageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const [t, data] = await Promise.all([getTranslations('requests'), loadRequests(clinicId)]);

  return (
    <div className="space-y-4 text-start">
      <div className="space-y-1">
        <h1 className="font-heading text-heading-lg font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-body-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="mx-auto w-full max-w-3xl">
        <RequestsInbox data={data} locale={locale} now={new Date()} />
      </div>
    </div>
  );
}
