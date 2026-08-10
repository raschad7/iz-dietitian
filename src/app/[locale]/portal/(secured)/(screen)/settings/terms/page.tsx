import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { PortalScreenHeader } from '@/features/portal/components/portal-screen-header';
import { SettingsPoint } from '@/features/portal/components/settings-detail';
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
 * Four short, concrete statements about this app's actual behaviour, in the
 * voice the rest of the settings screen uses. It deliberately says nothing a
 * real terms-of-service document would need a lawyer to sign off on —
 * liability, cancellation policy, dispute resolution — because this app has
 * none of that authority. What it can state honestly is how the portal itself
 * behaves.
 *
 * **A card per statement (`SettingsPoint`), not one article.** These are looked
 * up rather than read in order — someone arrives wondering what the plan is or
 * whether the clinic will message them, and wants the one paragraph that
 * answers it. A card each gives every statement an edge to be found by and a
 * glyph to be found by without reading. Help and security keep the article
 * shape; those really are read front to back.
 *
 * The glyphs are picked so no two share a family: a person for the account, a
 * dish for what the plan is, an envelope for what the clinic sends, a bell for
 * the page changing under you.
 */
export default async function TermsPage({ params }: TermsPageProps) {
  const locale = await resolveLocale(params);

  const t = await getTranslations({ locale, namespace: 'portal.settings.terms' });

  return (
    <>
      <PortalScreenHeader title={t('title')} fallbackHref="/portal/settings" />

      <main className="min-w-0 flex-1 px-4 py-5 md:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-3">
          <SettingsPoint icon="personOutline" title={t('usingThePortal.title')}>
            <p>{t('usingThePortal.body')}</p>
          </SettingsPoint>

          <SettingsPoint icon="mealLunchOutline" title={t('guidance.title')}>
            <p>{t('guidance.body')}</p>
          </SettingsPoint>

          <SettingsPoint icon="emailOutline" title={t('communications.title')}>
            <p>{t('communications.body')}</p>
          </SettingsPoint>

          <SettingsPoint icon="notifications" title={t('changes.title')}>
            <p>{t('changes.body')}</p>
          </SettingsPoint>
        </div>
      </main>
    </>
  );
}
