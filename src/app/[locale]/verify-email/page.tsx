import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { VerifyEmailNotice } from '@/features/auth/components/verify-email-notice';
import { resolveLocale } from '@/i18n/params';
import { getSession } from '@/lib/session';

type VerifyEmailPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: VerifyEmailPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'login' });
  return { title: t('checkInboxHeading') };
}

/**
 * Where `requireStaffSession` sends a practitioner whose address is not
 * verified, and a page anyone can open directly to ask for another link.
 *
 * It reads the session with `getSession` rather than `requireStaffSession` on
 * purpose: this is the page that guard redirects to, so calling it here would
 * be a redirect loop. Being reachable without a session is the point — after
 * sign-up there is no session at all.
 */
export default async function VerifyEmailPage({ params }: VerifyEmailPageProps) {
  const locale = await resolveLocale(params);
  const session = await getSession();

  // Nothing to verify. A client's synthetic portal address is never verified by
  // mail, so they belong in the portal rather than on a screen asking them to
  // check an inbox that does not exist.
  if (session?.user.role === 'client') redirect(`/${locale}/portal`);
  if (session?.user.emailVerified) redirect(`/${locale}/app`);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <VerifyEmailNotice
        locale={locale}
        email={session?.user.email}
        canSignOut={session !== null}
      />
    </main>
  );
}
