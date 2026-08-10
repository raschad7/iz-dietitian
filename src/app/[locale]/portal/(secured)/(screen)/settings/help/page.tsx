import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { ClinicContactPanel } from '@/features/portal/components/clinic-contact-panel';
import { PortalScreenHeader } from '@/features/portal/components/portal-screen-header';
import { SettingsAssurance, SettingsPoint } from '@/features/portal/components/settings-detail';
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
 * Then the clinic, then one line offering it again in plainer words. Two ways
 * out and not one, because a client who did not recognise their problem in any
 * of the four cards has no reason to think the panel above is meant for them.
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

          <ClinicContactPanel clinic={clinic} countryCode={defaultCountryCode()} />

          <SettingsAssurance icon="suggestion" title={t('noAnswer.title')}>
            {t('noAnswer.body')}
          </SettingsAssurance>
        </div>
      </main>
    </>
  );
}
