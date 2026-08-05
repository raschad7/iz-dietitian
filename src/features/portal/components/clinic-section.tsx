import { Building2, MessageCircle, Phone } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { clinicContactLinks, clinicMapLink } from '@/features/portal/clinic-contact';
import { formatClockMinute, formatWorkingDays } from '@/features/portal/clinic-hours';
import { InfoRow } from '@/features/portal/components/info-row';
import { ProfileSection } from '@/features/portal/components/profile-section';
import { type PortalClinic, type PortalPractitioner } from '@/features/portal/types';
import { type Locale } from '@/i18n/routing';

/**
 * The clinic and the dietitian looking after this client, plus the one thing
 * the client can do about them: get in touch.
 *
 * **Nothing here is a choice the client makes.** Which clinic holds their
 * record and who is assigned to them are decided by the clinic, so this section
 * has no picker and offers none. What it does have is a phone number that
 * works — which is the real answer to "this is wrong", and the reason the
 * update-request block below it can stay as small as it is.
 *
 * **The contact controls appear only when they can work.** With no phone number
 * on the clinic row there is no call button and no WhatsApp button; the section
 * says the number is not recorded and stops. A button that dials nothing is a
 * worse answer than a missing button.
 */
export function ClinicSection({
  clinic,
  practitioner,
  countryCode,
}: {
  clinic: PortalClinic;
  practitioner: PortalPractitioner | null;
  /** For reading `clinic.phone`; supplied by the page so this stays render-only. */
  countryCode: string;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal.profile');

  const { tel, whatsapp } = clinicContactLinks(clinic.phone, countryCode);
  const map = clinicMapLink(clinic.address);

  const days = formatWorkingDays(locale, clinic.workingDays);
  const hours = days
    ? // The day range and the clock, joined once. `formatClockMinute` already
      // renders Western digits in both locales, per the project's Intl rules.
      `${days} · ${formatClockMinute(locale, clinic.openMinute)} – ${formatClockMinute(locale, clinic.closeMinute)}`
    : null;

  return (
    <ProfileSection
      icon={Building2}
      title={t('section.clinic')}
      description={t('section.clinicDescription')}
      action={
        tel || whatsapp || map ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {/*
              Real links, not buttons: `tel:` and `wa.me` are navigations, and a
              link is what lets someone long-press to copy the number or open
              the chat in the desktop app.
            */}
            {tel ? <ContactLink href={tel} icon={Phone} label={t('callClinic')} primary /> : null}

            {whatsapp ? (
              <ContactLink
                href={whatsapp}
                icon={MessageCircle}
                label={t('whatsappClinic')}
                // Opens WhatsApp, which is another origin — so it leaves this
                // tab intact and carries the usual protection against it.
                external
              />
            ) : null}

            {map ? (
              <a
                href={map}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center px-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {t('openMap')}
              </a>
            ) : null}
          </div>
        ) : null
      }
    >
      <InfoRow label={t('field.clinicName')} value={clinic.name} />
      <InfoRow label={t('field.practitioner')} value={practitioner?.name ?? null} />
      <InfoRow label={t('field.specialty')} value={practitioner?.specialty ?? null} />
      <InfoRow label={t('field.clinicPhone')} value={clinic.phone} ltr />
      <InfoRow label={t('field.clinicAddress')} value={clinic.address} block />
      <InfoRow label={t('field.workingHours')} value={hours} block />
    </ProfileSection>
  );
}

function ContactLink({
  href,
  icon: Icon,
  label,
  primary = false,
  external = false,
}: {
  href: string;
  icon: typeof Phone;
  label: string;
  primary?: boolean;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={`inline-flex min-h-11 items-center gap-2 rounded-[10px] rounded-ee-xl px-3.5 text-sm font-medium transition-all duration-200 ease-[cubic-bezier(.2,.6,.2,1)] hover:rounded-ee-[30px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo focus-visible:outline-none ${
        primary
          ? 'bg-primary text-primary-foreground hover:bg-primary/80'
          : 'bg-secondary text-secondary-foreground hover:bg-status-on-track-bg'
      }`}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
      {label}
    </a>
  );
}
