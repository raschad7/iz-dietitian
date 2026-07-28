import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { ClientForm } from '@/features/clients/components/client-form';
import { resolveLocale } from '@/i18n/params';
import { requireStaffSession } from '@/lib/session';

type NewClientPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: NewClientPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'clients' });
  return { title: t('createTitle') };
}

export default async function NewClientPage({ params }: NewClientPageProps) {
  const locale = await resolveLocale(params);
  await requireStaffSession(locale);

  const t = await getTranslations('clients');

  return (
    <div className="space-y-6 text-start">
      <h2 className="text-2xl font-semibold tracking-tight">{t('createTitle')}</h2>
      <ClientForm locale={locale} />
    </div>
  );
}
