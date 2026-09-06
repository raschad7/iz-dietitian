import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { isAccountDisabled } from '@/features/auth/account-status';
import { signOutAction } from '@/features/auth/actions';
import { areaHomePath, toUserRole } from '@/features/auth/redirect';
import { resolveLocale } from '@/i18n/params';
import { getSession } from '@/lib/session';

type DisabledPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: DisabledPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'disabled' });
  return { title: t('heading'), robots: { index: false, follow: false } };
}

/**
 * Where `requireRole` sends an account the platform has disabled.
 *
 * The sibling of `/suspended`, and separate from it on purpose: one is about a
 * practice being turned off and the other about a single account, and a person
 * reading either needs to know which of the two happened to them. A shared page
 * with a conditional sentence would be one screen that has to explain both.
 *
 * Reads the session with `getSession` rather than a guard, because this is where
 * the guard redirects to. It re-checks and lets a re-enabled account straight
 * back in, so the URL is never a dead end after the flag is cleared.
 */
export default async function DisabledPage({ params }: DisabledPageProps) {
  const locale = await resolveLocale(params);
  const session = await getSession();

  if (!session) redirect(`/${locale}/login`);

  if (!(await isAccountDisabled(session.user.id))) {
    // Re-enabled, or here by typing the URL. Send them where they belong; the
    // mapping is stated once, in `src/features/auth/redirect.ts`.
    redirect(areaHomePath(locale, toUserRole(session.user.role)));
  }

  const [t, tCommon] = await Promise.all([
    getTranslations({ locale, namespace: 'disabled' }),
    getTranslations({ locale, namespace: 'common' }),
  ]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6 py-16 text-start">
      <h1 className="font-heading text-heading-lg font-semibold tracking-tight">{t('heading')}</h1>
      <Callout tone="attention">{t('body')}</Callout>
      <p className="text-body-sm text-muted-foreground">{t('contact')}</p>

      <form action={signOutAction}>
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="outline" size="sm">
          {tCommon('signOut')}
        </Button>
      </form>
    </main>
  );
}
