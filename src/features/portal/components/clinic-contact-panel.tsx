import { useTranslations } from 'next-intl';

import { Icon, type IconName } from '@/components/ui/icon';
import { clinicContactLinks } from '@/features/portal/clinic-contact';
import { type PortalClinic } from '@/features/portal/types';

/**
 * `تواصل مع العيادة` as the thing a help screen ends on, rather than as one more
 * settings row.
 *
 * `ClinicContactRow` next door is the row form, and it stays — the contact
 * screen reached from the settings list is a list of rows, and this would be a
 * panel sitting alone on a page pretending to be one. The difference is what the
 * two are *for*: that one is a destination someone chose, this one is the answer
 * to a question the page above it could not answer, so it is the largest thing
 * on the screen and its two actions are named in words instead of being icons
 * you have to recognise.
 *
 * Both read `clinicContactLinks`, so the number is parsed once and the two
 * screens cannot disagree about what it dials.
 *
 * With no usable number this renders the heading and says so. It never draws a
 * call button that would dial nothing — the same rule the row form keeps.
 */
export function ClinicContactPanel({
  clinic,
  countryCode,
}: {
  clinic: PortalClinic | null;
  countryCode: string;
}) {
  const t = useTranslations('portal.settings.support');
  const tProfile = useTranslations('portal.profile');

  const { tel, whatsapp } = clinic
    ? clinicContactLinks(clinic.phone, countryCode)
    : { tel: null, whatsapp: null };

  return (
    <div className="relative overflow-hidden rounded-lg bg-secondary px-4 py-5 text-center">
      {/*
        The clinic itself, drawn once and very quietly behind its own card.

        A line glyph rather than a bold one, and at 8% rather than a tint you
        could name a colour for: this is the only decorative mark in the portal,
        and the moment it is legible enough to identify it stops being texture
        and becomes a fifth thing on the card to read. `aria-hidden`, because it
        says nothing the heading does not already say.

        Pinned to the **inline-start** edge, so in Arabic it sits under the
        right-hand side and in English under the left — the card's own reading
        side in each. `overflow-hidden` above is what keeps it inside the radius.
      */}
      <Icon
        name="clinicOutline"
        aria-hidden
        className="pointer-events-none absolute -bottom-5 -start-4 size-28 text-primary/8"
      />

      <div className="relative space-y-1">
        <h2 className="font-heading text-base font-semibold text-secondary-foreground">
          {t('contactClinic')}
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {clinic ? clinic.name : tProfile('clinicUnknown')}
        </p>
      </div>

      {tel || whatsapp ? (
        /*
          Centred, and the two actions sit side by side rather than stacked: they
          are alternatives, not a sequence, and a column of two would make the
          first read as the one you are meant to take.

          Source order puts the call first, so RTL mirrors it for free — Arabic
          gets اتصال هاتفي on the right, English gets it on the left, from one
          declaration (§RTL).
        */
        <div className="relative mt-4 flex items-start justify-center gap-6">
          {tel ? <ContactAction href={tel} icon="contact" label={t('callAction')} /> : null}

          {whatsapp ? (
            <ContactAction
              href={whatsapp}
              icon="whatsapp"
              label={t('whatsappAction')}
              external
            />
          ) : null}
        </div>
      ) : (
        <p className="relative mt-3 text-sm text-muted-foreground">{tProfile('notRecorded')}</p>
      )}
    </div>
  );
}

/**
 * One way to reach the clinic: a disc you can hit, with its name under it.
 *
 * **The label is the accessible name, so there is no `aria-label`.** The text is
 * inside the anchor rather than beside it, which is what makes the whole
 * disc-and-word a single 44px-plus target and gives a screen reader the name
 * without the string being written twice and drifting.
 *
 * The disc is white on the card's olive-50 fill rather than the reverse: on a
 * tinted panel `bg-secondary` would be the same colour as the ground it sits on.
 */
function ContactAction({
  href,
  icon,
  label,
  external = false,
}: {
  href: string;
  icon: IconName;
  label: string;
  /** WhatsApp opens its own app or tab; a `tel:` never should. */
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="group/action flex w-20 flex-col items-center gap-2 rounded-lg text-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo"
    >
      <span className="grid size-12 place-items-center rounded-full bg-card text-primary shadow-card transition-colors group-hover/action:bg-primary group-hover/action:text-primary-foreground">
        <Icon name={icon} className="size-5" />
      </span>
      <span className="text-xs leading-snug font-medium text-secondary-foreground">{label}</span>
    </a>
  );
}
