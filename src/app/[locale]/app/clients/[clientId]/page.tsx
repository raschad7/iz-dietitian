import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { buttonVariants } from '@/components/ui/button';
import { ArchiveButton } from '@/features/clients/components/archive-button';
import { ClientProfile } from '@/features/clients/components/client-profile';
import { PortalAccessCard } from '@/features/clients/components/portal-access-card';
import { StatusBadge } from '@/features/clients/components/status-badge';
import { getClient } from '@/features/clients/queries';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { requireStaffSession } from '@/lib/session';

type ClientPageProps = {
  params: Promise<{ locale: string; clientId: string }>;
};

export async function generateMetadata({ params }: ClientPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const { clientId } = await params;

  const client = await getClient(clientId);
  if (client) return { title: client.fullName };

  const t = await getTranslations({ locale, namespace: 'clients' });
  return { title: t('notFound') };
}

export default async function ClientPage({ params }: ClientPageProps) {
  const locale = await resolveLocale(params);
  await requireStaffSession(locale);

  const { clientId } = await params;
  const client = await getClient(clientId);

  if (!client) {
    notFound();
  }

  const t = await getTranslations('clients');

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
        </div>
      </div>

      <ClientProfile client={client} />

      <PortalAccessCard locale={locale} clientId={client.id} hasPortalAccess={client.hasPortalAccess} />

      <Link href="/app/clients" className="inline-block text-sm underline-offset-4 hover:underline">
        {t('backToList')}
      </Link>
    </div>
  );
}
