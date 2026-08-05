import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { AuthScreen } from '@/features/auth/components/auth-screen';
import { isGoogleEnabled } from '@/lib/auth';
import { resolveLocale } from '@/i18n/params';

type LoginPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ redirect?: string; error?: string }>;
};

export async function generateMetadata({ params }: LoginPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'login' });
  return { title: t('title') };
}

/**
 * The one sign-in page, for now with a role chooser on it.
 *
 * Staff and clients still authenticate through different Better Auth paths, so
 * until sign-in is unified this page asks which of the two forms to show — see
 * `AuthScreen`, whose role switch is marked temporary. Sign-up lives on the
 * same card and is reached by flipping it; `/[locale]/signup` and
 * `/[locale]/client-login` are the same screen opened on a different face.
 */
export default async function LoginPage({ params, searchParams }: LoginPageProps) {
  const locale = await resolveLocale(params);
  const { redirect: redirectTo, error } = await searchParams;

  return (
    <AuthScreen
      locale={locale}
      showGoogle={isGoogleEnabled}
      redirectTo={redirectTo}
      oauthError={error}
    />
  );
}
