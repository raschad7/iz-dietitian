import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { Card, CardContent } from '@/components/ui/card';
import { DataUpdateRequest } from '@/features/portal/components/data-update-request';
import { PortalScreenHeader } from '@/features/portal/components/portal-screen-header';
import { SettingsValueRow } from '@/features/portal/components/settings-rows';
import { getOpenClientRequest } from '@/features/portal/queries';
import { requirePortalClient } from '@/features/portal/session';
import { resolveLocale } from '@/i18n/params';

type ContactPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: ContactPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'portal.settings.account' });
  return { title: t('contactRow') };
}

/**
 * `البريد الإلكتروني ورقم الهاتف` — the two identifiers, and the one way to
 * change either of them.
 *
 * Its own screen for the same reason security got one: a setting that is more
 * than a name and a value earns a destination rather than a card that grows
 * past its neighbours on the main list. The email and phone come straight off
 * `context.profile` — the guard already loaded them, so this costs nothing
 * beyond the one open-request read.
 */
export default async function ContactPage({ params }: ContactPageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);
  const openUpdateRequest = await getOpenClientRequest(context.id, 'data_update');

  const t = await getTranslations('portal.settings.account');

  return (
    <>
      <PortalScreenHeader title={t('contactRow')} fallbackHref="/portal/settings" />

      <main className="min-w-0 flex-1 px-4 py-5 md:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          <Card>
            <CardContent className="space-y-1">
              <div className="divide-y divide-border border-t border-border">
                <SettingsValueRow label={t('email')} value={context.profile.email} ltr />
                <SettingsValueRow label={t('phone')} value={context.profile.phone} ltr />
              </div>

              <p className="pt-2 text-xs leading-relaxed text-muted-foreground">{t('identifierNote')}</p>
            </CardContent>
          </Card>

          <DataUpdateRequest topic="contact" openRequest={openUpdateRequest} locale={locale} />
        </div>
      </main>
    </>
  );
}
