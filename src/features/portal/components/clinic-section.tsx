import { useLocale, useTranslations } from 'next-intl';

import { Avatar } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { clinicContactLinks, clinicMapLink } from '@/features/portal/clinic-contact';
import { formatClockMinute, formatWorkingDays } from '@/features/portal/clinic-hours';
import { InfoRow } from '@/features/portal/components/info-row';
import { ProfileSection } from '@/features/portal/components/profile-section';
import { type PortalClinic, type PortalPractitioner } from '@/features/portal/types';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

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
      icon="clinicOutline"
      title={t('section.clinic')}
      description={t('section.clinicDescription')}
      lead={practitioner ? <PractitionerTile practitioner={practitioner} /> : null}
      action={
        tel || whatsapp || map ? (
          /*
            **Calling is the action; the other two are alternatives to it.** The
            phone gets a full-width row of its own and the map and WhatsApp share
            the one below, so the group says which control answers "I need to
            reach my clinic" without three identical boxes making the reader pick.
            §Buttons puts the primary at the inline-start of a group — here it is
            simply first, which is the same thing one row up.

            Below `sm` the pair stacks too: two 150px buttons on a 375px screen
            put "عرض على الخريطة" on two lines, and a label that needs two lines
            is one the system does not allow.
          */
          <div className="flex flex-col gap-3 pt-1">
            {/*
              Real links, not buttons: `tel:` and `wa.me` are navigations, and a
              link is what lets someone long-press to copy the number or open
              the chat in the desktop app. Styled with `buttonVariants` on a real
              anchor rather than `<Button render={<Link/>}>` — Base UI's Button
              warns when it renders anything but a `<button>`, and silently drops
              the native semantics with it.
            */}
            {tel ? <ContactLink href={tel} icon="phoneOutline" label={t('callClinic')} /> : null}

            {map || whatsapp ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                {map ? (
                  <ContactLink
                    href={map}
                    icon="mapOutline"
                    label={t('openMap')}
                    variant="outline"
                    external
                  />
                ) : null}

                {whatsapp ? (
                  <ContactLink
                    href={whatsapp}
                    icon="chatOutline"
                    label={t('whatsappClinic')}
                    variant="neutral"
                    // Opens WhatsApp, which is another origin — so it leaves
                    // this tab intact and carries the usual protection with it.
                    external
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null
      }
    >
      <InfoRow label={t('field.clinicName')} value={clinic.name} icon="clinicNameOutline" />
      <InfoRow label={t('field.clinicPhone')} value={clinic.phone} icon="phoneOutline" ltr />
      <InfoRow
        label={t('field.clinicAddress')}
        value={clinic.address}
        icon="locationOutline"
        block
      />
      <InfoRow label={t('field.workingHours')} value={hours} icon="clockOutline" block />
    </ProfileSection>
  );
}

/**
 * The assigned dietitian, as a person rather than as two more rows.
 *
 * A name and a specialty read as record fields in a `<dl>`; the point of this
 * section is that a person is looking after you, so they get a face and the
 * space around it. `Card variant="tile"` is the system's "an item inside a card
 * that is its own thing" — plain radius, muted fill, no second ring or shadow
 * stacked on the card containing it (§Cards).
 *
 * It replaces the `practitioner` / `specialty` rows that used to sit in the list
 * below, rather than joining them — the same two facts drawn twice would be the
 * section answering "who is looking after me" in two places.
 *
 * Rendered only when someone is assigned: a clinic with nobody assigned yet gets
 * no tile at all, instead of one saying nobody is.
 */
function PractitionerTile({ practitioner }: { practitioner: PortalPractitioner }) {
  return (
    <Card variant="tile" className="flex-row items-center gap-3">
      <Avatar name={practitioner.name} color={practitioner.color} size="lg" />

      <div className="min-w-0 flex-1">
        <p className="truncate font-heading text-base leading-snug font-semibold">
          {practitioner.name}
        </p>
        {practitioner.specialty ? (
          <p className="truncate text-sm text-muted-foreground">{practitioner.specialty}</p>
        ) : null}
      </div>
    </Card>
  );
}

function ContactLink({
  href,
  icon,
  label,
  variant = 'default',
  external = false,
}: {
  href: string;
  icon: IconName;
  label: string;
  variant?: 'default' | 'neutral' | 'outline';
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      /*
        `w-full` fills the row on a phone, which is what the reference draws.
        §Buttons' `max-w-80` still caps it at 320px on a wide screen — a control
        stretched across 768px is a target the size of a paragraph, and that cap
        is the system's answer to it rather than something to override here.
      */
      className={cn(buttonVariants({ variant }), 'w-full')}
    >
      <Icon name={icon} className="size-5 shrink-0" />
      {label}
    </a>
  );
}
