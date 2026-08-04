import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { Card, CardContent } from '@/components/ui/card';
import { ClinicContactRow } from '@/features/portal/components/clinic-contact-row';
import { PortalScreenHeader } from '@/features/portal/components/portal-screen-header';
import { SettingsArticle, SettingsArticleBlock } from '@/features/portal/components/settings-detail';
import { getPortalClinic } from '@/features/portal/queries';
import { requirePortalClient } from '@/features/portal/session';
import { defaultCountryCode } from '@/features/whatsapp/config';
import { resolveLocale } from '@/i18n/params';

type HelpPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: HelpPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'portal.settings.help' });
  return { title: t('title') };
}

/**
 * `المساعدة والدعم` — the four questions this app actually gets asked, and the
 * clinic's number underneath them.
 *
 * The answers are about the parts of the product a client can be confused by
 * without anything being broken: a plan that has not appeared yet is a plan the
 * dietitian has not published, a requested appointment is not a booked one, and
 * a correction goes through a person. Each of those is a real behaviour of this
 * system rather than generic help-centre filler, and each one heads off a phone
 * call.
 *
 * The last block is the clinic itself, because every question this page cannot
 * answer ends there.
 */
export default async function HelpPage({ params }: HelpPageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);
  const clinic = await getPortalClinic(context.clinicId);

  const t = await getTranslations({ locale, namespace: 'portal.settings.help' });

  return (
    <>
      <PortalScreenHeader title={t('title')} fallbackHref="/portal/settings" />

      <main className="min-w-0 flex-1 px-4 py-5 md:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          <SettingsArticle>
            <SettingsArticleBlock title={t('plan.title')}>
              <p>{t('plan.body')}</p>
            </SettingsArticleBlock>

            <SettingsArticleBlock title={t('appointments.title')}>
              <p>{t('appointments.body')}</p>
            </SettingsArticleBlock>

            <SettingsArticleBlock title={t('record.title')}>
              <p>{t('record.body')}</p>
            </SettingsArticleBlock>

            <SettingsArticleBlock title={t('signIn.title')}>
              <p>{t('signIn.body')}</p>
            </SettingsArticleBlock>
          </SettingsArticle>

          <Card>
            <CardContent>
              <ClinicContactRow clinic={clinic} countryCode={defaultCountryCode()} />
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
