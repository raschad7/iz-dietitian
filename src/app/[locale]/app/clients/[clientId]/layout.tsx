import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ArchiveButton } from '@/features/clients/components/archive-button';
import { ClientFormTrigger } from '@/features/clients/components/client-form-trigger';
import { ClientTabs } from '@/features/clients/components/client-tabs';
import { DeleteClientButton } from '@/features/clients/components/delete-client-button';
import { StatusBadge } from '@/features/clients/components/status-badge';
import { getClient } from '@/features/clients/queries';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type ClientLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string; clientId: string }>;
};

/**
 * The chrome every tab of a client's profile shares: the name, the status
 * badge, the record-level actions, and the tab bar itself.
 *
 * Fetching the client here rather than in each tab page means a bad id 404s
 * once, before any tab-specific data is read, and the header never has to be
 * rebuilt four times over. Each tab page still reads the client again for its
 * own fields — a second indexed lookup by primary key is cheap, and it keeps
 * every page independently correct rather than trusting data smuggled down
 * from a layout Next.js does not actually let a page receive props from.
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

  const t = await getTranslations('clients');

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
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <Icon name="chevronStart" className="size-3.5" />
        {t('backToList')}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{client.fullName}</h1>
          <StatusBadge status={client.status} />
        </div>

        <div className="flex items-center gap-2">
          <ClientFormTrigger locale={locale} clientId={client.id} className={buttonVariants({ variant: 'outline' })}>
            {t('edit')}
          </ClientFormTrigger>
          <ArchiveButton locale={locale} clientId={client.id} archived={client.status === 'archived'} />
          <DeleteClientButton locale={locale} clientId={client.id} clientName={client.fullName} />
        </div>
      </div>

      <ClientTabs clientId={client.id} />

      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
