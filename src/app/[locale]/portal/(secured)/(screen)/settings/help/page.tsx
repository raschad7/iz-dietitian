import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { PortalScreenHeader } from '@/features/portal/components/portal-screen-header';
import { SettingsPoint } from '@/features/portal/components/settings-detail';
import { requirePortalClient } from '@/features/portal/session';
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
 * **The page is the four answers and nothing else.** It used to end on the
 * clinic — a tinted panel with the number and a WhatsApp action, then a sunken
 * line offering the same clinic again in plainer words. Both are gone. Reaching
 * the clinic is its own row in the settings list this screen was opened from
 * (`/portal/settings/contact-clinic`), one back press away, so the way out is
 * still one tap from here and is no longer duplicated on a screen whose job is
 * to answer the question instead.
 *
 * **A card each, and a glyph each**, the same shape the privacy screen takes —
 * see `SettingsPoint` for why these two screens left the article form and why
 * terms and security kept it. It matters more here than there: these are
 * *symptoms*, and someone arriving with one is scanning for the line that
 * matches what just happened to them, not reading four answers in order.
 *
 * The glyphs name the screen each answer sends you to rather than the problem —
 * a plan, a calendar, a record, a password — so the mark is a signpost rather
 * than a picture of being stuck.
 *
 * Then the clinic, and the page ends there. A sunken line under the panel used
 * to offer the same clinic a second time in plainer words, on the argument that
 * a client who recognised none of the four cards might not realise the panel
 * was meant for them. It sat directly beneath a panel headed "تواصل مع العيادة"
 * with the number under it — the restatement was never reaching anyone the
 * panel had not already reached.
 */
export default async function HelpPage({ params }: HelpPageProps) {
  const locale = await resolveLocale(params);

  // Still guarded, but nothing on the screen is the client's own any more: the
  // four answers are the same for everyone, so no clinic is loaded for them.
  await requirePortalClient(locale);

  const t = await getTranslations({ locale, namespace: 'portal.settings.help' });

  return (
    <>
      <PortalScreenHeader title={t('title')} fallbackHref="/portal/settings" />

      <main className="min-w-0 flex-1 px-4 py-5 md:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-3">
          <SettingsPoint icon="weeklyPlans" title={t('plan.title')}>
            <p>{t('plan.body')}</p>
          </SettingsPoint>

          <SettingsPoint icon="myAppointments" title={t('appointments.title')}>
            <p>{t('appointments.body')}</p>
          </SettingsPoint>

          <SettingsPoint icon="notes" title={t('record.title')}>
            <p>{t('record.body')}</p>
          </SettingsPoint>

          <SettingsPoint icon="edit" title={t('signIn.title')}>
            <p>{t('signIn.body')}</p>
          </SettingsPoint>
        </div>
      </main>
    </>
  );
}
