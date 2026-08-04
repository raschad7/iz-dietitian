import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { PortalScreenHeader } from '@/features/portal/components/portal-screen-header';
import { SettingsArticle, SettingsArticleBlock } from '@/features/portal/components/settings-detail';
import { resolveLocale } from '@/i18n/params';

type PrivacyPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PrivacyPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'portal.settings.privacy' });
  return { title: t('title') };
}

/**
 * `الخصوصية` — who can see what, in the client's own terms.
 *
 * Every claim on this page is a fact about how this app is actually built, not
 * boilerplate: the dietitian's private notes really are excluded from every
 * portal query (`getPortalClient`), the weight really is withheld unless shared
 * (`getSharedWeight`), and a client really can only ever read their own row
 * (`requirePortalClient`). If one of those changes, this copy is wrong and has
 * to change with it — which is the point of stating them concretely rather than
 * in the language of a policy nobody reads.
 */
export default async function PrivacyPage({ params }: PrivacyPageProps) {
  const locale = await resolveLocale(params);

  const t = await getTranslations({ locale, namespace: 'portal.settings.privacy' });

  return (
    <>
      <PortalScreenHeader title={t('title')} fallbackHref="/portal/settings" />

      <main className="min-w-0 flex-1 px-4 py-5 md:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <SettingsArticle>
            <SettingsArticleBlock title={t('whoSees.title')}>
              <p>{t('whoSees.body')}</p>
            </SettingsArticleBlock>

            <SettingsArticleBlock title={t('whatIsStored.title')}>
              <p>{t('whatIsStored.body')}</p>
            </SettingsArticleBlock>

            <SettingsArticleBlock title={t('messages.title')}>
              <p>{t('messages.body')}</p>
            </SettingsArticleBlock>

            <SettingsArticleBlock title={t('rights.title')}>
              <p>{t('rights.body')}</p>
            </SettingsArticleBlock>
          </SettingsArticle>
        </div>
      </main>
    </>
  );
}
