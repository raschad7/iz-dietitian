import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { resolveLocale } from '@/i18n/params';
import { getSession } from '@/lib/session';

type DashboardPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: DashboardPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  return { title: t('title') };
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  await resolveLocale(params);

  const t = await getTranslations('dashboard');
  const session = await getSession();

  return (
    <div className="space-y-2 text-start">
      <h2 className="text-2xl font-semibold tracking-tight">
        {session ? t('welcome', { name: session.user.name }) : t('title')}
      </h2>
      <p className="text-muted-foreground">{t('placeholder')}</p>
    </div>
  );
}
