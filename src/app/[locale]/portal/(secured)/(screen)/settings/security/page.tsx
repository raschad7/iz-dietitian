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
 * `كلمة المرور والأمان` — how the client signs in, and how they change it.
 *
 * The sign-in address comes from the session's user, not from `clients.email`.
 * They are two columns for a reason: the clinical record's email is where the
 * clinic writes, and the account's is what proves identity. A reset link sent to
 * the wrong one of those would be a real hole.
 */
export default async function SecurityPage({ params }: SecurityPageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);

  const t = await getTranslations('portal.settings.security');

  return (
    <>
      <PortalScreenHeader title={t('title')} fallbackHref="/portal/settings" />

      <main className="min-w-0 flex-1 px-4 py-5 md:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          <SettingsArticle>
            <SettingsArticleBlock title={t('signInAddress')}>
              <p className="font-medium text-foreground">
                <bdi dir="ltr">{context.session.user.email}</bdi>
              </p>
              <p>{t('signInAddressNote')}</p>
            </SettingsArticleBlock>

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
