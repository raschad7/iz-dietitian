import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { LanguageForm } from '@/features/portal/components/language-form';
import { ProfileCard } from '@/features/portal/components/profile-card';
import { requirePortalClient } from '@/features/portal/session';
import { resolveLocale } from '@/i18n/params';

type ProfilePageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'nav' });
  return { title: t('profile') };
}

/**
 * The client's record and their one setting.
 *
 * Signing out is not repeated here — it is in the header, on every page of both
 * signed-in areas, which is where someone looks for it.
 */
export default async function ProfilePage({ params }: ProfilePageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);

  const t = await getTranslations('portal');

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-semibold tracking-tight">{t('profile.title')}</h2>

      <ProfileCard profile={context.profile} />
      <LanguageForm locale={locale} />
    </div>
  );
}
