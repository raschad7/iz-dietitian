import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { signOutAction } from '@/features/auth/actions';
import { isClinicSuspended } from '@/features/clinic-profile/queries';
import { resolveLocale } from '@/i18n/params';
import { getSession } from '@/lib/session';

type SuspendedPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: SuspendedPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'suspended' });
  return { title: t('heading'), robots: { index: false, follow: false } };
}

/**
 * Where `requireStaffSession` sends a dietitian whose clinic the platform has
 * turned off.
 *
 * It reads the session with `getSession` rather than `requireStaffSession`,
 * because this is the page that guard redirects to and calling it here would be
 * a redirect loop — the same reason `/verify-email` is written this way.
 *
 * **It re-checks the suspension and lets a reinstated account straight back in.**
 * Without that, the screen would be a dead end for anyone holding the URL after
 * their clinic was switched back on: nothing else in the app links here, so a
 * stale tab or a bookmark would be the only way in and there would be no way
 * out but signing out. The read is `cache`d and the guard has already paid for
 * it on this request.
 *
 * The one control is sign-out. There is deliberately nothing to press that
 * would resolve the suspension — this is a dispute between the platform and the
 * practice, settled by talking to a person, and a button implying otherwise
 * would send a dietitian looking for a self-service escape that does not exist.
 */
export default async function SuspendedPage({ params }: SuspendedPageProps) {
  const locale = await resolveLocale(params);
  const session = await getSession();

  if (!session) redirect(`/${locale}/login`);

  // A client has no clinic of their own and is never suspended — the portal
  // stays open by design. Send them back to it rather than showing a notice
  // about a practice they do not run.
  if (session.user.role === 'client') redirect(`/${locale}/portal`);
  if (session.user.role === 'admin') redirect(`/${locale}/admin`);

  const suspended = session.user.clinicId ? await isClinicSuspended(session.user.clinicId) : false;
  if (!suspended) redirect(`/${locale}/app`);

  const [t, tCommon] = await Promise.all([
    getTranslations({ locale, namespace: 'suspended' }),
    getTranslations({ locale, namespace: 'common' }),
  ]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6 py-16 text-start">
      <h1 className="font-heading text-heading-lg font-semibold tracking-tight">{t('heading')}</h1>

      <Callout tone="attention">{t('body')}</Callout>

      <p className="text-body-sm text-muted-foreground">{t('contact')}</p>

      {/* The same shape `/verify-email` signs out with — an action, not a link. */}
      <form action={signOutAction}>
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="neutral" size="sm">
          {tCommon('signOut')}
        </Button>
      </form>
    </main>
  );
}
