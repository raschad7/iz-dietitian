import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { PortalScreenHeader } from '@/features/portal/components/portal-screen-header';
import { SettingsArticle, SettingsArticleBlock } from '@/features/portal/components/settings-detail';
import { resolveLocale } from '@/i18n/params';

type TermsPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: TermsPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'portal.settings.terms' });
  return { title: t('title') };
}

/**
 * `الشروط والأحكام` — how the portal itself works, not a substitute for the
 * clinic's own care agreement with the client.
 *
 * Same `SettingsArticle` shape as privacy and help: four short, concrete
 * statements about this app's actual behaviour, in the voice the rest of the
 * settings screen uses. It deliberately says nothing a real terms-of-service
 * document would need a lawyer to sign off on — liability, cancellation
 * policy, dispute resolution — because this app has none of that authority.
 * What it can state honestly is how the portal itself behaves.
 */
export default async function TermsPage({ params }: TermsPageProps) {
  const locale = await resolveLocale(params);

  const t = await getTranslations({ locale, namespace: 'portal.settings.terms' });

  return (
    <>
      <PortalScreenHeader title={t('title')} fallbackHref="/portal/settings" />

      <main className="min-w-0 flex-1 px-4 py-5 md:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <SettingsArticle>
            <SettingsArticleBlock title={t('usingThePortal.title')}>
              <p>{t('usingThePortal.body')}</p>
            </SettingsArticleBlock>

            <SettingsArticleBlock title={t('guidance.title')}>
              <p>{t('guidance.body')}</p>
            </SettingsArticleBlock>

            <SettingsArticleBlock title={t('communications.title')}>
              <p>{t('communications.body')}</p>
            </SettingsArticleBlock>

            <SettingsArticleBlock title={t('changes.title')}>
              <p>{t('changes.body')}</p>
            </SettingsArticleBlock>
          </SettingsArticle>
        </div>
      </main>
    </>
  );
}
