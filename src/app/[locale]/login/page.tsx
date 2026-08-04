import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { LoginRoleSwitch } from '@/features/auth/components/login-role-switch';
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
 * `LoginRoleSwitch`, which is marked temporary. `/[locale]/client-login` is
 * unchanged and still works as a direct link for clients.
 */
export default async function LoginPage({ params, searchParams }: LoginPageProps) {
  const locale = await resolveLocale(params);
  const { redirect: redirectTo, error } = await searchParams;

  const t = await getTranslations('login');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div className="flex justify-end">
        <LocaleSwitcher />
      </div>

      <header className="space-y-2 text-start">
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </header>

      <LoginRoleSwitch
        locale={locale}
        showGoogle={isGoogleEnabled}
        redirectTo={redirectTo}
        oauthError={error}
      />
    </main>
  );
}
