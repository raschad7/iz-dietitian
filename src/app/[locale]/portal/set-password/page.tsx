import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { SetPasswordForm } from '@/features/auth/components/set-password-form';
import { resolveLocale } from '@/i18n/params';

type SetPasswordPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: SetPasswordPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'login' });
  return { title: t('setPasswordHeading') };
}

export default async function SetPasswordPage({ params }: SetPasswordPageProps) {
  const locale = await resolveLocale(params);

  return <SetPasswordForm locale={locale} />;
}
