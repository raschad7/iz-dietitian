import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { StaffLoginForm } from '@/features/auth/components/staff-login-form';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';

type LoginPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: LoginPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'login' });
  return { title: t('staffHeading') };
}

/** Clinic team only. Clients sign in at `/[locale]/client-login`. */
export default async function LoginPage({ params }: LoginPageProps) {
  const locale = await resolveLocale(params);

  const t = await getTranslations('login');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-16">
      <header className="space-y-2 text-start">
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('staffSubtitle')}</p>
      </header>

      <StaffLoginForm locale={locale} />

      <p className="text-center text-sm text-muted-foreground">
        {t('areYouAClient')}{' '}
        <Link href="/client-login" className="font-medium text-foreground underline-offset-4 hover:underline">
          {t('clientLoginLink')}
        </Link>
      </p>
    </main>
  );
}
