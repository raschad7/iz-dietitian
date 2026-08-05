import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { AuthScreen } from '@/features/auth/components/auth-screen';
import { isGoogleEnabled } from '@/lib/auth';
import { resolveLocale } from '@/i18n/params';

type ClientLoginPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: ClientLoginPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'login' });
  return { title: t('clientHeading') };
}

/**
 * Client portal sign-in — the same screen as `/login`, opened on the client
 * card. The direct link stays, because it is the one a dietitian sends out with
 * a new username; the role switch above the card is now what used to be the
 * "Are you on the clinic team?" line under the form.
 */
export default async function ClientLoginPage({ params }: ClientLoginPageProps) {
  const locale = await resolveLocale(params);

  return <AuthScreen locale={locale} showGoogle={isGoogleEnabled} initialRole="client" />;
}
