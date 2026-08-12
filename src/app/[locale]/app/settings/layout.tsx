import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { SettingsTabs } from '@/features/settings/components/settings-tabs';
import { resolveLocale } from '@/i18n/params';

export default async function SettingsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = await resolveLocale(params);
  const t = await getTranslations('settingsWorkspace');

  return (
    <div className="me-auto w-full max-w-4xl space-y-6 text-start">
      <header className="space-y-1">
        <h1 className="font-heading text-heading-lg font-semibold tracking-tight">{t('title')}</h1>
        <p className="max-w-2xl text-body-sm text-muted-foreground">{t('description')}</p>
      </header>

      <SettingsTabs locale={locale} />
      {children}
    </div>
  );
}
