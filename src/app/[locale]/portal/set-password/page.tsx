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

  // Its own `main`: the portal layout above provides the header only, and the
  // navigation shell lives in the `(secured)` group this page sits outside of.
  return (
    <main className="mx-auto w-full max-w-md flex-1 p-6">
      <SetPasswordForm locale={locale} />
    </main>
  );
}
