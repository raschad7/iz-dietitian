import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { ClientProfile } from '@/features/clients/components/client-profile';
import { getClient } from '@/features/clients/queries';
import { SendMessageCard } from '@/features/whatsapp/components/send-message-card';
import { getSettings, listClientThread } from '@/features/whatsapp/queries';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type ClientInfoPageProps = {
  params: Promise<{ locale: string; clientId: string }>;
};

/**
 * Same reasoning as the old page's `generateMetadata`: this runs outside the
 * layout's session guard, so it has no clinic to scope a lookup to, and the
 * client's name stays out of a browser history it might not belong in.
 */
export async function generateMetadata({ params }: ClientInfoPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'clients' });

  return { title: t('title') };
}

/** Contact details, intake profile, notes — and the WhatsApp thread, when one exists. */
export default async function ClientInfoPage({ params }: ClientInfoPageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const { clientId } = await params;
  const client = await getClient(clinicId, clientId);

  if (!client) {
    notFound();
  }

  const [whatsapp, thread] = await Promise.all([getSettings(clinicId), listClientThread(clinicId, client.id)]);

  return (
    <div className="space-y-6">
      <ClientProfile client={client} />

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
    </div>
  );
}
