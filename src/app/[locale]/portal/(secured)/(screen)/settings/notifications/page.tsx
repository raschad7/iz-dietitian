import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { Card, CardContent } from '@/components/ui/card';
import { updateNotificationAction } from '@/features/portal/actions';
import { PortalScreenHeader } from '@/features/portal/components/portal-screen-header';
import { SettingsSwitchRow } from '@/features/portal/components/settings-switch-row';
import { EnablePushRow } from '@/features/portal/push/enable-push-row';
import { portalSettings, requirePortalClient } from '@/features/portal/session';
import { NOTIFICATION_KINDS } from '@/features/portal/types';
import { resolveLocale } from '@/i18n/params';
import { getLocaleDirection } from '@/i18n/routing';

type NotificationsPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: NotificationsPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'portal.settings.notifications' });
  return { title: t('title') };
}

/**
 * `تفعيل الإشعارات` — the four things the clinic may send, on or off.
 *
 * Its own screen rather than a card on the settings list: four switches at the
 * top of every other setting made the list read as mostly about notifications,
 * which is one of five things a client can configure here, not the main one.
 * The main list carries a single row in; this is the destination, the same
 * shape the security screen already established for "one setting with more
 * than a name and a value."
 */
export default async function NotificationsPage({ params }: NotificationsPageProps) {
  const locale = await resolveLocale(params);

  const context = await requirePortalClient(locale);
  const settings = await portalSettings(context.id);

  const t = await getTranslations('portal.settings.notifications');

  return (
    <>
      <PortalScreenHeader title={t('title')} fallbackHref="/portal/settings" />

      <main className="min-w-0 flex-1 px-4 py-5 md:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <Card>
            <CardContent className="space-y-1">
              <p className="pb-2 text-xs leading-relaxed text-muted-foreground">{t('description')}</p>

              <div className="divide-y divide-border border-t border-border">
                {/*
                  Where a notification may be delivered, above what may be
                  said. It is a different question from the four below it —
                  those are consent and gate WhatsApp as well, this one is
                  about the phone in the client's hand — and it leads because
                  it is the switch that makes any of the rest arrive while the
                  app is closed.

                  Renders nothing on a deployment with no VAPID keypair, so a
                  checkout without one shows exactly the four switches it
                  always did. See `EnablePushRow`.
                */}
                <EnablePushRow locale={locale} dir={getLocaleDirection(locale)} />

                {NOTIFICATION_KINDS.map((kind) => (
                  <SettingsSwitchRow
                    key={kind}
                    action={updateNotificationAction}
                    name="kind"
                    value={kind}
                    checked={settings.notifications[kind]}
                    label={t(`${kind}.label`)}
                    description={t(`${kind}.description`)}
                    locale={locale}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
