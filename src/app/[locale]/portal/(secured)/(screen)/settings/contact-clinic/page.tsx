import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { ClinicContactRow } from '@/features/portal/components/clinic-contact-row';
import { PortalScreenHeader } from '@/features/portal/components/portal-screen-header';
import { formatClockMinute, formatWorkingDays } from '@/features/portal/clinic-hours';
import { getPortalClinic } from '@/features/portal/queries';
import { requirePortalClient } from '@/features/portal/session';
import { defaultCountryCode } from '@/features/whatsapp/config';
import { resolveLocale } from '@/i18n/params';
import { type Locale } from '@/i18n/routing';

type ContactClinicPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: ContactClinicPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'portal.settings.support' });
  return { title: t('contactClinic') };
}

/**
 * `تواصل مع العيادة` — the clinic's number, one tap from the settings list.
 *
 * The same `ClinicContactRow` the support section used to render inline moves
 * here so every row on the settings list behaves the same way: a name, a
 * chevron, and a screen behind it. The opening hours join it because "can I
 * call now" is the question this screen exists to answer.
 */
export default async function ContactClinicPage({ params }: ContactClinicPageProps) {
  const locale = (await resolveLocale(params)) as Locale;

  const context = await requirePortalClient(locale);
  const clinic = await getPortalClinic(context.clinicId);

  const t = await getTranslations('portal.settings.support');

  const days = clinic ? formatWorkingDays(locale, clinic.workingDays) : '';
  const hours =
    clinic && days
      ? `${days} · ${formatClockMinute(locale, clinic.openMinute)} – ${formatClockMinute(locale, clinic.closeMinute)}`
      : null;

  return (
    <>
      <PortalScreenHeader title={t('contactClinic')} fallbackHref="/portal/settings" />

      <main className="min-w-0 flex-1 px-4 py-5 md:px-6">
        <div className="mx-auto w-full max-w-3xl">
          {/*
            The card is `ClinicContactRow`'s own now, rather than one wrapped
            around it here. The hours were a bare paragraph under a rule, which
            made them read as a footnote on the clinic's name; they are a band
            of the card in their own right — see that component.
          */}
          <ClinicContactRow
            clinic={clinic}
            countryCode={defaultCountryCode()}
            hours={hours}
          />
        </div>
      </main>
    </>
  );
}
