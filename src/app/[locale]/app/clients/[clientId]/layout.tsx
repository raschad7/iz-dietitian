import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { Icon } from '@/components/ui/icon';
import { toIsoDate } from '@/features/booking/date';
import { getClientVisitSummary } from '@/features/booking/queries';
import { ClientRecordHeader } from '@/features/clients/components/client-record-header';
import { ClientTabs } from '@/features/clients/components/client-tabs';
import { intakeGaps } from '@/features/clients/intake-gaps';
import { getClient, getClientIntake } from '@/features/clients/queries';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type ClientLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string; clientId: string }>;
};

/**
 * The chrome every tab of a client's record shares: who they are, the numbers
 * every tab wants, the record-level actions, and the tab bar.
 *
 * Fetching the client here rather than in each tab page means a bad id 404s
 * once, before any tab-specific data is read, and the header never has to be
 * rebuilt five times over. Each tab page still reads what it needs for itself —
 * a second indexed lookup by primary key is cheap, and it keeps every page
 * independently correct rather than trusting data smuggled down from a layout
 * Next.js does not actually let a page receive props from.
 *
 * **The intake is read here too**, which is new. The header's fact strip is
 * built from it and so is the count on the Nutrition tab, and both have to be
 * right on all five tabs — including the four that do not otherwise touch the
 * clinical record.
 *
 * `h-full`/`min-h-0` on the shell, with only the middle strip scrolling: the
 * same shape `/app/calendar` uses, and it is what lets the Visit History tab
 * mount that page's own `Calendar` — which expects to fill a bounded parent
 * and scroll its own grid — without a second, page-level scrollbar fighting
 * it for the same content.
 */
export default async function ClientLayout({ children, params }: ClientLayoutProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const { clientId } = await params;
  const client = await getClient(clinicId, clientId);

  if (!client) {
    notFound();
  }

  // The server clock's own local day, the same derivation `loadDashboard` and
  // `loadCalendarPage` use — so a record and the calendar inside it never
  // disagree about which day "next" is being measured from.
  const today = toIsoDate(new Date());

  const [intake, visits, t] = await Promise.all([
    getClientIntake(clinicId, client.id),
    getClientVisitSummary(clinicId, client.id, today),
    getTranslations('clients'),
  ]);

  // `getClient` has already proved the row exists and belongs to this clinic,
  // and the intake read is that same lookup with a left join — so a null here
  // means the record was deleted between the two. 404 rather than render a
  // header full of dashes for somebody who is gone.
  if (!intake) {
    notFound();
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 text-start">
      {/*
        A breadcrumb above the title rather than a link below the content: the
        content below can be the Visit History tab's `Calendar`, which fills
        this shell to its own bottom edge, so anything meant to sit under it
        has to live outside that bounded area instead.
      */}
      <Link
        href="/app/clients"
        className="inline-flex w-fit items-center gap-1 text-body-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <Icon name="chevronStart" className="size-3.5" />
        {t('backToList')}
      </Link>

      <ClientRecordHeader client={client} intake={intake} visits={visits} locale={locale} />

      <ClientTabs clientId={client.id} nutritionGaps={intakeGaps(intake).length} />

      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
