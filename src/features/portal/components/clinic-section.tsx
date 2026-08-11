import { Sunrise, Sunset } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { clinicContactLinks, clinicMapLink } from '@/features/portal/clinic-contact';
import { formatClockMinute, formatWorkingDays } from '@/features/portal/clinic-hours';
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
 *
 * ## Why this one section is not a `ProfileSection`
 *
 * Every other section on this screen is a heading over a `<dl>` of label/value
 * rows inside one card, which is the right shape for a list of facts you read
 * down. This one is four facts you *look up* — a name, a number, an address, a
 * set of hours — and the reference design draws each as its own card, sized to
 * how much room the fact needs: the name gets the full width because it is a
 * sentence, the number and the address share a row because each is a line, and
 * the hours get a card of their own because they are two facts (which days, and
 * between what times).
 *
 * That is a different composition, not a restyled `ProfileSection`, so it is
 * built here from `Card` and `Icon` rather than by adding a fifth layout mode
 * to a component whose other three callers all want the list. The pieces are
 * still the shared ones; only the arrangement is local.
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

  /*
    `formatWorkingDays` returns the **empty string** for a clinic with no open
    days, never `null` — so this is a truthiness check and not a `=== null`
    one. Getting that wrong renders an empty card where the "not recorded"
    badge belongs, and it is invisible until a clinic with no schedule opens
    the screen.
  */
  const days = formatWorkingDays(locale, clinic.workingDays);
  const hasHours = days.trim() !== '';

  return (
    <section className="space-y-4">
      {/*
        The section's own heading, on the page rather than inside a card — there
        is no outer card here for it to sit in. The glyph takes a filled disc,
        which `ProfileSection`'s deliberately does not: that one is bare because
        three stacked sections put three olive chips down the screen, and this
        is one heading with cards under it rather than one of three peers.
      */}
      <header className="flex items-start gap-3">
        {/*
          64px, with the glyph at 32px — half the disc, which is the proportion
          the smaller discs on the cards below already keep (20px in 44px is
          close enough that the two read as one family). At 48px the disc was
          shorter than the two lines of type beside it, so the heading looked
          like text with a mark tacked on rather than a mark the heading hangs
          off.
        */}
        <span
          aria-hidden="true"
          className="grid size-16 shrink-0 place-items-center rounded-full bg-secondary text-primary"
        >
          <Icon name="clinicOutline" className="size-8" />
        </span>

        <div className="min-w-0 flex-1">
          {/*
            `heading-sm` (20px), one step down the scale from `heading-lg`.

            At 24px this section heading was set at exactly the size of the
            page's own `h1` — the client's name in `ProfileIdentity` — so a
            section was competing with the person the whole screen is about.
            It is the same argument §Figures makes for the record header's stat
            tiles. One step down keeps it clearly the heading that owns the
            cards below it without matching the title above it.
          */}
          <h2 className="font-heading text-heading-sm leading-snug font-semibold">
            {t('section.clinic')}
          </h2>

          <p className="mt-1 flex items-center gap-2 text-sm leading-relaxed text-muted-foreground">
            {/* The reference's olive pip. Decorative — the sentence reads the
                same without it, so it is `aria-hidden` and not a list marker. */}
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />
            {t('section.clinicDescription')}
          </p>
        </div>
      </header>

      {/*
        The name, full width and set large: it is the one fact here that is a
        phrase rather than a value, and it is what the whole section is about.
      */}
      <Card>
        <CardContent className="space-y-3">
          <FactLabel icon="personOutline" label={t('field.clinicName')} />

          {/*
            `heading-sm` too — the scale's card-title step, which is what this
            is. At `heading-lg` a clinic name long enough to wrap set two 24px
            lines inside a card whose own label is 14px, and the card read as a
            banner rather than as one fact among four.

            A step, not a size with its weight overridden: `heading-sm` is
            20px/600 as declared, so this stays one class (§Typography).
          */}
          <p className="font-heading text-heading-sm leading-snug font-semibold text-balance">
            {clinic.name}
          </p>
        </CardContent>
      </Card>

      {/*
        Two to a row, because each holds a single line. `items-stretch` is the
        grid default, and `Card` is a flex column, so the shorter of the two
        still fills the row's height instead of leaving a step between them.

        `grid-cols-2` from the narrowest width up: these are the reference's
        pair, and at 320px each card is still wide enough for a phone number and
        a street. A long address wraps inside its own card rather than pushing
        the pair apart.
      */}
      <div className="grid grid-cols-2 gap-4">
        <FactTile
          icon="locationOutline"
          label={t('field.clinicAddress')}
          value={clinic.address}
        />

        <FactTile
          icon="phoneOutline"
          label={t('field.clinicPhone')}
          value={clinic.phone}
          ltr
        />
      </div>

      {/*
        The hours are two facts, so the card states them as two. Joined onto one
        line they were long enough at phone width to choose their own break
        point, which landed mid-range — "الأحد - الخميس · 8:00" over "ص – 6:00
        م". Days above, clock below, separated by the rule.
      */}
      <Card>
        <CardContent className="space-y-4">
          <FactLabel icon="clockOutline" label={t('field.workingHours')} />

          {!hasHours ? (
            <Badge variant="unrecorded">{t('notRecorded')}</Badge>
          ) : (
            <>
              <p className="text-center font-heading text-lg leading-snug font-semibold">{days}</p>

              {/* A rule with the section's pip resting in it — the same mark the
                  heading uses, so the card reads as belonging to it. */}
              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-border" />
                <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                <span className="h-px flex-1 bg-border" />
              </div>

              {/*
                Opening beside a sunrise and closing beside a sunset: the two
                figures are the same shape and the same length, so a glyph is
                what tells them apart at a glance rather than their position in
                the row. Source order is open-then-close, which reads
                start-to-end in both scripts with no override.

                Lucide rather than the generated Solar set, as the portal's
                header already does for its own sun — there is no sunrise or
                sunset in `ICONS`, and adding two glyphs to a build step for one
                row is more machinery than the row is worth.
              */}
              <p className="flex items-center justify-center gap-3 text-base font-semibold tabular-nums">
                <span className="inline-flex items-center gap-2">
                  <Sunrise className="size-5 shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" />
                  <bdi>{formatClockMinute(locale, clinic.openMinute)}</bdi>
                </span>

                <span aria-hidden="true" className="text-muted-foreground">
                  —
                </span>

                <span className="inline-flex items-center gap-2">
                  <Sunset className="size-5 shrink-0 text-primary" strokeWidth={1.8} aria-hidden="true" />
                  <bdi>{formatClockMinute(locale, clinic.closeMinute)}</bdi>
                </span>
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/*
        The dietitian closes the section rather than opening it. The heading
        names the clinic *and* the practitioner, and the reference opens on the
        clinic's own name — so the person comes after the place, immediately
        above the controls for reaching them.
      */}
      {practitioner ? <PractitionerTile practitioner={practitioner} /> : null}

      {tel || whatsapp || map ? (
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
      ) : null}
    </section>
  );
}

/** A card's glyph and its label: the disc at the inline-start, the name beside it. */
function FactLabel({ icon, label }: { icon: IconName; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-primary"
      >
        <Icon name={icon} className="size-5" />
      </span>

      <span className="min-w-0 text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * One of the pair: the glyph centred over its label and value rather than
 * beside them.
 *
 * Centred because the card is half a phone wide — at that measure a start-hung
 * label with the value under it leaves a column of air down the far side, and
 * two of them side by side read as two things that failed to fill their boxes.
 */
function FactTile({
  icon,
  label,
  value,
  ltr = false,
}: {
  icon: IconName;
  label: string;
  /** `null` and `''` both render as "not recorded". */
  value: string | null;
  /**
   * Keeps the value in left-to-right order inside Arabic text — for a phone
   * number, whose internal order is Latin whichever language the page is in.
   */
  ltr?: boolean;
}) {
  const t = useTranslations('portal.profile');

  const empty = value === null || value.trim() === '';

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 text-center">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-primary"
        >
          <Icon name={icon} className="size-5" />
        </span>

        <span className="text-sm text-muted-foreground">{label}</span>

        {empty ? (
          <Badge variant="unrecorded">{t('notRecorded')}</Badge>
        ) : (
          <p className="text-base leading-relaxed font-semibold text-balance">
            {/*
              `<bdi>` and not `dir`: `dir` would also re-resolve this card's
              `text-center` against the value instead of the page, and the
              isolation is all a phone number needs.
            */}
            {ltr ? <bdi dir="ltr">{value}</bdi> : value}
          </p>
        )}
      </CardContent>
    </Card>
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
        `w-full max-w-none` — these three fill the section's width rather than
        stopping at §Buttons' 320px cap.

        ⚠ That cap is deliberate and this is a knowing exception to it. The rule
        exists because a control stretched across a desktop measure is a target
        the size of a paragraph; here the requirement is the opposite and
        specific — the row has to end where the cards above it end, and at 320px
        on a 390px phone it stopped ~48px short on each of three stacked
        buttons, which read as a column that had failed to line up rather than
        as a deliberate width. The page's own `max-w-3xl` is what bounds it on a
        desktop.

        It is scoped to this component. `max-w-80` stays on `buttonVariants`,
        and nothing else should reach for `max-w-none` without the same reason.
      */
      className={cn(buttonVariants({ variant }), 'w-full max-w-none')}
    >
      <Icon name={icon} className="size-5 shrink-0" />
      {label}
    </a>
  );
}
