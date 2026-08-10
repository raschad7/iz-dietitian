import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { Card, CardContent } from '@/components/ui/card';
import { PasswordChangeForm } from '@/features/portal/components/password-change-form';
import { PortalScreenHeader } from '@/features/portal/components/portal-screen-header';
import { SettingsArticle, SettingsArticleBlock } from '@/features/portal/components/settings-detail';
import { requirePortalClient } from '@/features/portal/session';
import { resolveLocale } from '@/i18n/params';

type SecurityPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: SecurityPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'portal.settings.security' });
  return { title: t('title') };
}

/**
 * `كلمة المرور والأمان` — the client's password, and how they change it.
 *
 * **The sign-in address is deliberately not shown.** It used to open the screen:
 * the account email, with a line explaining it could only be changed by asking
 * the clinic. That is a fact about the account rather than a control over it,
 * and it sat above the one thing on this screen the client can actually do.
 *
 * If it is ever restored, it must come from the *session's* user and not from
 * `clients.email`. They are two columns for a reason — the clinical record's
 * email is where the clinic writes, and the account's is what proves identity,
 * and a reset link sent to the wrong one of those would be a real hole.
 */
export default async function SecurityPage({ params }: SecurityPageProps) {
  const locale = await resolveLocale(params);

  /*
    Called for the guard, not for a value. Nothing on this screen reads the
    client any more — the sign-in address it used to print is gone — but this is
    still what proves the visitor is a portal client before the page renders, so
    the call stays and only the binding goes.
  */
  await requirePortalClient(locale);

  const t = await getTranslations('portal.settings.security');

  return (
    <>
      <PortalScreenHeader title={t('title')} fallbackHref="/portal/settings" />

      <main className="min-w-0 flex-1 px-4 py-5 md:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          {/*
            The sign-in address is no longer shown. It was a heading, the
            account's email, and a line saying it can only be changed through
            the clinic — a fact the client cannot act on, on the screen whose
            job is the one thing they can: their password.
          */}
          <SettingsArticle>
            <SettingsArticleBlock title={t('passwordTitle')}>
              <p>{t('passwordBody')}</p>
            </SettingsArticleBlock>
          </SettingsArticle>

          <Card>
            <CardContent>
              <PasswordChangeForm locale={locale} />
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
