import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { PortalCredentialsCard } from '@/features/clients/components/portal-credentials-card';
import { getPortalUsername } from '@/features/clients/portal-credentials';
import { getClient } from '@/features/clients/queries';
import { suggestUsername } from '@/features/clients/transliterate';
import { getSettings } from '@/features/whatsapp/queries';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type ClientPortalPageProps = {
  params: Promise<{ locale: string; clientId: string }>;
};

export async function generateMetadata({ params }: ClientPortalPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'clients' });
  return { title: `${t('portal.title')} · ${t('title')}` };
}

/** The Portal Access tab: issuing, reissuing or revoking this client's sign-in. */
export default async function ClientPortalPage({ params }: ClientPortalPageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const { clientId } = await params;
  const client = await getClient(clinicId, clientId);
  if (!client) notFound();

  const [whatsapp, portalUsername] = await Promise.all([
    getSettings(clinicId),
    client.hasPortalAccess ? getPortalUsername(clinicId, client.id) : Promise.resolve(null),
  ]);

  return (
    <PortalCredentialsCard
      locale={locale}
      clientId={client.id}
      hasPortalAccess={client.hasPortalAccess}
      username={portalUsername}
      suggestedUsername={suggestUsername(client.fullName)}
      canSendWhatsapp={whatsapp?.status === 'ready' && Boolean(client.phone)}
    />
  );
}
