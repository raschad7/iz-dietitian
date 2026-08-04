import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { ClientLoginForm } from '@/features/auth/components/client-login-form';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';

type ClientLoginPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: ClientLoginPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'login' });
  return { title: t('clientHeading') };
}

/** Client portal sign-in. Staff sign in at `/[locale]/login`. */
export default async function ClientLoginPage({ params }: ClientLoginPageProps) {
  const locale = await resolveLocale(params);

  const t = await getTranslations('login');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div className="flex justify-end">
        <LocaleSwitcher />
      </div>

      <header className="space-y-2 text-start">
        <h1 className="text-3xl font-semibold tracking-tight">{t('clientTitle')}</h1>
        <p className="text-muted-foreground">{t('clientSubtitle')}</p>
      </header>

      <ClientLoginForm locale={locale} />

      <p className="text-center text-sm text-muted-foreground">
        {t('areYouStaff')}{' '}
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          {t('staffLoginLink')}
        </Link>
      </p>
    </main>
  );
}
