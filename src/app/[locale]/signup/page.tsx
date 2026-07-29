import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { StaffSignUpForm } from '@/features/auth/components/staff-signup-form';
import { resolveLocale } from '@/i18n/params';

type SignUpPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: SignUpPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'login' });
  return { title: t('signUpHeading') };
}

/**
 * Staff sign-up.
 *
 * ⚠️  Open to anyone who reaches this URL — see the warning on `signUpStaff` in
 * `src/components/auth/actions.ts`. Gate it before deploying anywhere public.
 */
export default async function SignUpPage({ params }: SignUpPageProps) {
  const locale = await resolveLocale(params);

  const t = await getTranslations('login');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-16">
      <header className="space-y-2 text-start">
        <h1 className="text-3xl font-semibold tracking-tight">{t('signUpHeading')}</h1>
        <p className="text-muted-foreground">{t('signUpSubtitle')}</p>
      </header>

      <StaffSignUpForm locale={locale} />
    </main>
  );
}
