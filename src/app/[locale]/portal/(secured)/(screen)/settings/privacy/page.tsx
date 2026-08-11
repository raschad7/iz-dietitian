import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { PortalScreenHeader } from '@/features/portal/components/portal-screen-header';
import { SettingsPoint } from '@/features/portal/components/settings-detail';
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
 *
 * **A card each, not four headings in one article.** This is the one settings
 * sub-screen nobody reads front to back: a client opens it holding a single
 * question and wants the paragraph that answers it. Separate surfaces with a
 * glyph apiece make each claim findable by its mark instead of by reading all
 * four — see `SettingsPoint`, which also says why help, terms and security
 * deliberately keep the article shape.
 *
 * The glyphs are picked so no two are the same family: a guarded shield for who
 * may look, an eye for what is shown to you, a message bubble for what the
 * clinic sends, a document for the record itself, and the padlock is spent once,
 * on the closing line.
 */
export default async function PrivacyPage({ params }: PrivacyPageProps) {
  const locale = await resolveLocale(params);

  const t = await getTranslations({ locale, namespace: 'portal.settings.privacy' });

  return (
    <>
      <PortalScreenHeader title={t('title')} fallbackHref="/portal/settings" />

      <main className="min-w-0 flex-1 px-4 py-5 md:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-3">
          <SettingsPoint icon="security" title={t('whoSees.title')}>
            <p>{t('whoSees.body')}</p>
          </SettingsPoint>

          <SettingsPoint icon="eye" title={t('whatIsStored.title')}>
            <p>{t('whatIsStored.body')}</p>
          </SettingsPoint>

          <SettingsPoint icon="chat" title={t('messages.title')}>
            <p>{t('messages.body')}</p>
          </SettingsPoint>

          <SettingsPoint icon="notes" title={t('rights.title')}>
            <p>{t('rights.body')}</p>
          </SettingsPoint>
        </div>
      </main>
    </>
  );
}
