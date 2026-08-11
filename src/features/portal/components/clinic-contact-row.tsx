import { useTranslations } from 'next-intl';

import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { clinicContactLinks } from '@/features/portal/clinic-contact';
import { type PortalClinic } from '@/features/portal/types';

/**
 * `تواصل مع العيادة` — the whole screen behind that settings row, as one card.
 *
 * The same two links the profile screen's clinic section offers, in the place
 * someone looks for them when they have a problem with the app rather than with
 * their record. Both screens read `clinicContactLinks`, so the number is parsed
 * once and cannot disagree between them.
 *
 * **Two bands, split by what they answer.** The upper one is *who* and *how* —
 * the clinic named, with the two ways to reach it as discs at the inline-end.
 * The lower one is *when*, and it is behind the rule because "can I call right
 * now" is a second question, asked after the first has been answered. The clock
 * carries a disc of its own so the two bands read as the same kind of row
 * rather than as a card with a footnote.
 *
 * The action discs are 44px, which is the touch floor — they are the only
 * targets on this screen, so they are sized as targets rather than as glyphs.
 *
 * With no usable phone number on the clinic row this renders the clinic's name
 * and says the number is not recorded — it never draws a call button that would
 * dial nothing.
 */
export function ClinicContactRow({
  clinic,
  countryCode,
  hours,
}: {
  clinic: PortalClinic | null;
  countryCode: string;
  /**
   * The opening hours, already formatted in the active locale by the page —
   * this stays render-only, and the page is where the locale and the clinic's
   * minutes are both already in hand.
   */
  hours: string | null;
}) {
  const t = useTranslations('portal.settings.support');
  const tProfile = useTranslations('portal.profile');

  const { tel, whatsapp } = clinic
    ? clinicContactLinks(clinic.phone, countryCode)
    : { tel: null, whatsapp: null };

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <ContactDisc>
            <Icon name="clinicOutline" className="size-6" />
          </ContactDisc>

          <div className="min-w-0 flex-1">
            {/*
              olive-700 (`--secondary-foreground`), the palette's `text.brand`
              at 7.37:1 — not `text-primary`, which is olive-500 at 3.47:1 and
              fails on a heading. Same pair the settings articles already use.
            */}
            <p className="font-heading text-base leading-snug font-semibold text-secondary-foreground">
              {t('contactClinic')}
            </p>
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
              {clinic ? clinic.name : tProfile('clinicUnknown')}
            </p>
          </div>

          {tel || whatsapp ? (
            <div className="flex shrink-0 items-center gap-2">
              {tel ? (
                <ContactAction href={tel} label={tProfile('callClinic')}>
                  <Icon name="phoneOutline" className="size-5" />
                </ContactAction>
              ) : null}

              {whatsapp ? (
                <ContactAction
                  href={whatsapp}
                  label={tProfile('whatsappClinic')}
                  // Opens WhatsApp, which is another origin — so it leaves this
                  // tab intact and carries the usual protection with it.
                  external
                >
                  {/* The registry's own WhatsApp mark, which the staff area's
                      rail already uses for the gateway. */}
                  <Icon name="whatsapp" className="size-5" />
                </ContactAction>
              ) : null}
            </div>
          ) : (
            <span className="shrink-0 text-sm text-muted-foreground">
              {tProfile('notRecorded')}
            </span>
          )}
        </div>

        {hours ? (
          <>
            <div aria-hidden="true" className="h-px bg-border" />

            <div className="flex items-center gap-3">
              <ContactDisc>
                <Icon name="clockOutline" className="size-6" />
              </ContactDisc>

              <p className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
                {hours}
              </p>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** The olive-tinted disc a band is marked by. Decorative — the row's text names it. */
function ContactDisc({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-12 shrink-0 place-items-center rounded-full bg-secondary text-primary"
    >
      {children}
    </span>
  );
}

/**
 * One of the two ways to reach the clinic.
 *
 * A real link, not a button: `tel:` and `wa.me` are navigations, and a link is
 * what lets someone long-press to copy the number or open the chat in the
 * desktop app. Icon-only, so it carries its own `aria-label` — there is no
 * visible text to name it.
 */
function ContactAction({
  href,
  label,
  external = false,
  children,
}: {
  href: string;
  label: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="grid size-11 place-items-center rounded-full bg-secondary text-primary transition-colors hover:bg-status-on-track-bg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo focus-visible:outline-none"
    >
      {children}
    </a>
  );
}
