import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { AuthScreen } from '@/features/auth/components/auth-screen';
import { resolveLocale } from '@/i18n/params';
import { isGoogleEnabled } from '@/lib/auth';

type SignUpPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: SignUpPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'login' });
  return { title: t('signUpHeading') };
}

/**
 * Staff sign-up. Open by design — see `signUpStaff` in
 * `src/features/auth/actions.ts` for what makes that safe.
 *
 * The same screen as `/login`, opened with the card already flipped: sign-in
 * and sign-up are two faces of one surface now, and this URL still exists
 * because mail and other pages link straight to it.
 */
export default async function SignUpPage({ params }: SignUpPageProps) {
  const locale = await resolveLocale(params);

  return <AuthScreen locale={locale} showGoogle={isGoogleEnabled} initialMode="signUp" />;
}
