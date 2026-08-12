import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { WhatsappSettings } from '@/features/whatsapp/components/whatsapp-settings';
import { SettingsPageHeader } from '@/features/settings/components/settings-page-header';
import { readConnection } from '@/features/whatsapp/connection';
import { listRecentMessages } from '@/features/whatsapp/queries';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type WhatsappPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: WhatsappPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'nav' });

  return { title: t('whatsapp') };
}

/**
 * Route file: resolve params, guard, render. The connection state comes from the
 * database only — the client component asks the gateway itself after mount, so a
 * gateway that is down slows this page down by nothing.
 */
export default async function WhatsappSettingsPage({ params }: WhatsappPageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const [connection, messages, t] = await Promise.all([
    readConnection(clinicId),
    listRecentMessages(clinicId),
    getTranslations('settingsWorkspace.whatsapp'),
  ]);

  return (
    <div className="space-y-5">
      <SettingsPageHeader title={t('title')} description={t('description')} />
      <WhatsappSettings locale={locale} connection={connection} messages={messages} />
    </div>
  );
}
