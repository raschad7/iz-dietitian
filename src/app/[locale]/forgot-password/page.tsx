import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form';
import { resolveLocale } from '@/i18n/params';

type ForgotPasswordPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: ForgotPasswordPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'login' });
  return { title: t('forgotHeading') };
}

export default async function ForgotPasswordPage({ params }: ForgotPasswordPageProps) {
  const locale = await resolveLocale(params);

  return (
    <main className="q-route-stage mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <ForgotPasswordForm locale={locale} />
    </main>
  );
}
