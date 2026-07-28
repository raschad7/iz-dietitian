import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { LoginForms } from '@/components/auth/login-form';
import { resolveLocale } from '@/i18n/params';

type LoginPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: LoginPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'login' });
  return { title: t('title') };
}

export default async function LoginPage({ params }: LoginPageProps) {
  const locale = await resolveLocale(params);

  const t = await getTranslations('login');

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-2 text-start">
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </header>

      <LoginForms locale={locale} />
    </main>
  );
}
