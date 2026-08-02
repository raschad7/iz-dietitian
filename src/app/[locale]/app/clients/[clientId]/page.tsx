import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { buttonVariants } from '@/components/ui/button';
import { ArchiveButton } from '@/features/clients/components/archive-button';
import { ClientProfile } from '@/features/clients/components/client-profile';
import { DeleteClientButton } from '@/features/clients/components/delete-client-button';
import { PortalCredentialsCard } from '@/features/clients/components/portal-credentials-card';
import { StatusBadge } from '@/features/clients/components/status-badge';
import { getPortalUsername } from '@/features/clients/portal-credentials';
import { getClient } from '@/features/clients/queries';
import { suggestUsername } from '@/features/clients/transliterate';
import { ClientPlansCard } from '@/features/weekly-plans/components/client-plans-card';
import { listPlans } from '@/features/weekly-plans/queries';
import { SendMessageCard } from '@/features/whatsapp/components/send-message-card';
import { getSettings, listClientThread } from '@/features/whatsapp/queries';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type ClientPageProps = {
  params: Promise<{ locale: string; clientId: string }>;
};

/**
 * Deliberately does not read the client to title the tab with their name.
 *
 * `generateMetadata` runs outside the layout's session guard, so it has no
 * clinic to scope a lookup to — and a title is exactly the kind of thing that
 * leaks quietly, putting one clinic's patient name in another's browser history.
 * The page body below shows the name, after the guard has run.
 */
export async function generateMetadata({ params }: ClientPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'clients' });

  return { title: t('title') };
}

export default async function ClientPage({ params }: ClientPageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const { clientId } = await params;
  const client = await getClient(clinicId, clientId);

  if (!client) {
    notFound();
  }

  const [plans, whatsapp, thread, t] = await Promise.all([
    listPlans(clinicId, client.id),
    getSettings(clinicId),
    listClientThread(clinicId, client.id),
    getTranslations('clients'),
  ]);

  const portalUsername = client.hasPortalAccess ? await getPortalUsername(clinicId, client.id) : null;

  return (
    <div className="space-y-6 text-start">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">{client.fullName}</h2>
          <StatusBadge status={client.status} />
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/app/clients/${client.id}/edit`} className={buttonVariants({ variant: 'outline' })}>
            {t('edit')}
          </Link>
          <ArchiveButton locale={locale} clientId={client.id} archived={client.status === 'archived'} />
          <DeleteClientButton locale={locale} clientId={client.id} clientName={client.fullName} />
        </div>
      </div>

      <ClientProfile client={client} />

      <ClientPlansCard clientId={client.id} plans={plans} />

      <PortalCredentialsCard
        locale={locale}
        clientId={client.id}
        hasPortalAccess={client.hasPortalAccess}
        username={portalUsername}
        suggestedUsername={suggestUsername(client.fullName)}
        canSendWhatsapp={whatsapp?.status === 'ready' && Boolean(client.phone)}
      />

      {/*
        Only when WhatsApp is actually linked. A composer that silently does
        nothing is worse than no composer, and a clinic that has not connected
        WhatsApp should not see a WhatsApp box on every client.
      */}
      {whatsapp?.sessionId ? (
        <SendMessageCard
          locale={locale}
          clientId={client.id}
          thread={thread}
          canSend={Boolean(client.phone) && whatsapp.status === 'ready'}
        />
      ) : null}

      <Link href="/app/clients" className="inline-block text-sm underline-offset-4 hover:underline">
        {t('backToList')}
      </Link>
    </div>
  );
}
