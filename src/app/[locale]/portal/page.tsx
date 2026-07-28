import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { resolveLocale } from '@/i18n/params';
import { getSession } from '@/lib/session';

type PortalPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PortalPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'portal' });
  return { title: t('title') };
}

export default async function PortalPage({ params }: PortalPageProps) {
  await resolveLocale(params);

  const t = await getTranslations('portal');
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
