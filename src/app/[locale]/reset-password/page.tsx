import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';
import { resolveLocale } from '@/i18n/params';

type ResetPasswordPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export async function generateMetadata({ params }: ResetPasswordPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'login' });
  return { title: t('resetHeading') };
}

export default async function ResetPasswordPage({ params, searchParams }: ResetPasswordPageProps) {
  const locale = await resolveLocale(params);
  const { token } = await searchParams;

  // A reset link with no token is a link someone edited or a mail client mangled.
  if (typeof token !== 'string' || token === '') {
    notFound();
  }

  return (
    <main className="q-route-stage mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <ResetPasswordForm locale={locale} token={token} />
    </main>
  );
}
