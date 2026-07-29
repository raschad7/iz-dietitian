import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import type { Metadata } from 'next';

import { SecuritySettings } from '@/features/auth/components/security-settings';
import { resolveLocale } from '@/i18n/params';
import { auth } from '@/lib/auth';
import { requireStaffSession } from '@/lib/session';

type SecurityPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: SecurityPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('security') };
}

export default async function SecurityPage({ params }: SecurityPageProps) {
  const locale = await resolveLocale(params);
  await requireStaffSession(locale);

  const requestHeaders = await headers();

  const [passkeys, accounts, t] = await Promise.all([
    auth.api.listPasskeys({ headers: requestHeaders }),
    auth.api.listUserAccounts({ headers: requestHeaders }),
    getTranslations('nav'),
  ]);

  return (
    <div className="space-y-6 text-start">
      <h2 className="text-2xl font-semibold tracking-tight">{t('security')}</h2>
      <SecuritySettings
        locale={locale}
        passkeys={passkeys.map((entry) => ({
          id: entry.id,
          name: entry.name ?? null,
          createdAt: entry.createdAt.toISOString(),
        }))}
        providers={accounts.map((entry) => entry.providerId)}
      />
    </div>
  );
}
