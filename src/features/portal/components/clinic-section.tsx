import { useLocale, useTranslations } from 'next-intl';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import {
  formatClockMinute,
  formatWeekdayRun,
  formatWorkingDays,
  workingHourRuns,
} from '@/features/portal/clinic-hours';
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
}: {
  clinic: PortalClinic;
  practitioner: PortalPractitioner | null;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal.profile');

  /*
    `formatWorkingDays` returns the **empty string** for a clinic with no open
    days, never `null` — so this is a truthiness check and not a `=== null`
    one. Getting that wrong renders an empty card where the "not recorded"
    badge belongs, and it is invisible until a clinic with no schedule opens
    the screen.
  */
  const days = formatWorkingDays(locale, clinic.workingDays);
  const hasHours = days.trim() !== '';

  /*
    The lines the hours card draws: one per stretch of days sharing a clock.

    A clinic with a full seven-row schedule gets the truth. One without falls
    back to `workingDays` and the envelope — the vaguer single line this card
    has always drawn — because the alternative is inventing per-day hours the
    database does not have. Both shapes are the same `{ days, open, close }`, so
    the card below does not branch on which one it got, only on how many lines
    came back.
  */
  const runs = clinic.schedule ? workingHourRuns(clinic.schedule) : [];

  const hourRows =
    runs.length > 0
      ? runs.map((run) => ({ ...run, days: formatWeekdayRun(locale, run) }))
      : hasHours
        ? [
            {
              from: 0,
              to: 6,
              openMinute: clinic.openMinute,
              closeMinute: clinic.closeMinute,
              days,
            },
          ]
        : [];

  return (
    <section className="space-y-4">
      {/*
        The section's own heading, on the page rather than inside a card — the
        same place `ProfileSection` now puts its own, so the two halves of the
        profile screen are labelled identically.

        It is bare type: no disc, no glyph, no supporting line. The disc was
        64px and the line under it read "the people who hold your file", which
        is what the four cards immediately below it demonstrate by being a
        name, an address, a phone number and a set of opening hours. `text-base`
        matches `ProfileSection`'s heading exactly — these are two peers on one
        screen, and the earlier `heading-sm` made this half look like the more
        important one.
      */}
      <h2 className="font-heading text-base leading-snug font-semibold">{t('section.clinic')}</h2>

      {/*
        The name, full width and set large: it is the one fact here that is a
        phrase rather than a value, and it is what the whole section is about.
      */}
      <Card>
        <CardContent className="space-y-3">
          <FactLabel icon="clinicNameOutline" label={t('field.clinicName')} />

          {/*
            `text-base` — the same step as the practitioner's name in the tile
            below and as the section heading above.

            This came down from `heading-lg` to `heading-sm` once already, on
            the argument that a wrapping clinic name set two 24px lines in a
            card whose own label is 14px and read as a banner. 20px was still
            the largest type on the screen: the name of the clinic was being
            announced louder than the client's own record, in a card that is
            one of four equal facts. At 16px it is a fact, stated plainly.
          */}
          {/* `ps-14`: the same disc gutter (`size-11` + `gap-3`) `FactTile`'s
              own value clears below it, so the name starts where the label's
              text starts rather than under the disc beside it. */}
          <p className="ps-14 font-heading text-base leading-snug font-semibold text-balance">
            {clinic.name}
          </p>
        </CardContent>
      </Card>

      {/*
        Two to a row from `sm`, one to a row on a phone. `items-stretch` is the
        grid default, and `Card` is a flex column, so the shorter of the two
        still fills the row's height instead of leaving a step between them.

        ⚠ **This was `grid-cols-2` at every width, on the claim that a 320px
        card is still wide enough for a phone number and a street.** It is wide
        enough for the phone number. It is not wide enough for a street: half of
        a 320px screen leaves the address 104px of text column, and a real one —
        `عمان، شارع مكة، مجمع الحسيني التجاري، الطابق الثالث، مكتب ٣٠٤` — set
        six words deep and one or two words wide. The pair then took 272px of
        height, most of it blank space beside a phone number on one line,
        because `items-stretch` gives the short card the tall one's height.

        A phone gets them stacked instead: the address has the full column, so
        it is two lines rather than six, and each card is as tall as its own
        fact. `sm` is where half the column is wide enough for a street again —
        296px per card, which is the width the pair was designed against.
      */}
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
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
        One line per set of hours, and usually that is one line.

        **The shape follows the data rather than being fixed.** A clinic that
        keeps the same hours all week is a single fact — the days and the clock
        belong on one line, and splitting them across a rule made two facts out
        of one. A clinic whose Saturday closes early is genuinely several, and
        the old card could not say so: it drew `clinics.open_minute` and
        `close_minute`, which are the *envelope* — earliest open, latest close —
        so Sunday 08:00–14:00 beside Monday 10:00–18:00 rendered as 08:00–18:00,
        a range the clinic is never actually open for. `workingHourRuns` splits
        on a change of hours as well as a gap in the days, so each line is true
        of every day it names.

        **No sunrise and sunset glyphs.** They sat beside the two figures to
        tell open from close, which the order and the dash between them already
        do; against a column of times they would have been two marks per row
        repeating the same thing down the card.
      */}
      <Card>
        <CardContent className="space-y-4">
          <FactLabel icon="clockOutline" label={t('field.workingHours')} />

          {hourRows.length === 0 ? (
            <Badge variant="unrecorded">{t('notRecorded')}</Badge>
          ) : hourRows.length === 1 && hourRows[0] ? (
            /*
              Days and clock on one line, centred like the fact it is. `gap-x-3`
              with `flex-wrap` rather than a nowrap line: "الأحد – الخميس" and
              the range together can outrun a 320px card, and wrapping between
              the two halves is the one break that does not land mid-range.
            */
            <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center font-heading text-base leading-snug font-semibold">
              <span>{hourRows[0].days}</span>
              <Clock open={hourRows[0].openMinute} close={hourRows[0].closeMinute} locale={locale} />
            </p>
          ) : (
            /*
              Days at the reading edge, hours at the far one, divided — a table
              of two columns without being a `<table>`, which for two to four
              rows would be more structure than the content earns. `gap-3` keeps
              the two apart when a long day range pushes them together.
            */
            <ul className="divide-y divide-border">
              {hourRows.map((row) => (
                <li
                  key={`${row.from}-${row.to}`}
                  className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0"
                >
                  <span className="min-w-0 font-heading leading-snug font-semibold">
                    {row.days}
                  </span>
                  <Clock open={row.openMinute} close={row.closeMinute} locale={locale} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/*
        The dietitian closes the section rather than opening it. The heading
        names the clinic *and* the practitioner, and the reference opens on the
        clinic's own name — so the person comes after the place, and the section
        ends on them.
      */}
      {practitioner ? <PractitionerTile practitioner={practitioner} /> : null}
    </section>
  );
}

/**
 * `8:00 ص – 6:00 م`.
 *
 * Each time is its own `<bdi>`: a clock is Latin digits with an Arabic marker
 * beside it, and left to the paragraph's direction the two halves of `6:00 م`
 * can reorder around the dash. Isolating each keeps every figure internally
 * correct while the paragraph still orders open-before-close in both scripts.
 *
 * Size is inherited rather than set, so the one-line form and the rows below it
 * can each choose their own step and the clock matches the days beside it.
 */
function Clock({ open, close, locale }: { open: number; close: number; locale: Locale }) {
  return (
    <span className="shrink-0 font-semibold tabular-nums">
      <bdi>{formatClockMinute(locale, open)}</bdi>
      <span aria-hidden="true" className="mx-1 font-normal text-muted-foreground">
        –
      </span>
      <bdi>{formatClockMinute(locale, close)}</bdi>
    </span>
  );
}

/**
 * A card's glyph and its label: the disc at the inline-start, the name beside it.
 *
 * `className` is how `FactTile` turns the same pair into a centred column from
 * `sm` up — the two arrangements are one component rather than two copies of
 * this markup, so the disc's size, fill and gap are stated once.
 */
function FactLabel({
  icon,
  label,
  className,
}: {
  icon: IconName;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded-full bg-icon-chip text-icon-chip-foreground"
      >
        <Icon name={icon} className="size-5" />
      </span>

      <span className="min-w-0 text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * One of the pair: the address or the phone number.
 *
 * From `sm` the glyph is centred over its label and value rather than beside
 * them, because there the card is half the column wide — at that measure a
 * start-hung label with the value under it leaves air down the far side, and
 * two of them side by side read as two things that failed to fill their boxes.
 *
 * On a phone the pair is stacked instead of paired (see the grid above), each
 * card is the full column, and that reasoning inverts: the centred column is
 * then three short lines floating in the middle of a wide card. So the phone
 * shape is the start-hung one its full-width siblings already use.
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
    /*
      **Two shapes, and the breakpoint that swaps them is the same one that
      breaks the pair above.**

      Centred — disc over label over value — is a tile's shape, and it is right
      from `sm` up where these two sit side by side and each is read as one of a
      matched pair.

      Stacked full-width on a phone, that centring stops being a tile and starts
      being a card whose three lines all float in the middle of an otherwise
      empty row. So below `sm` the card takes the shape its two full-width
      siblings already have — the disc and the label together on one line, the
      value on the next, both starting at the reading edge — and the clinic
      section is four cards built the same way instead of two and two.
    */
    <Card>
      {/*
        `items-start` on the phone shape, so the "not recorded" chip stays the
        width of its own two words — a flex column's default `stretch` would
        pull the badge across the whole card and turn a chip into a banner. The
        centred shape sets its own alignment at `sm`.
      */}
      <CardContent className="flex flex-col items-start gap-2 sm:items-center sm:text-center">
        <FactLabel icon={icon} label={label} className="sm:flex-col sm:gap-2" />

        {/*
          **Below `sm`, the value starts where the label's text starts, not
          where the disc does.** Same gutter `InfoRow` clears for its own
          stacked value — the disc is `size-11` and its gap is `gap-3`, 56px
          together, written as `ps-14`/`ms-14` for the arithmetic to stay
          visible (spacing(14) is 3.5rem, the sum of the two). `sm:ps-0`/
          `sm:ms-0` drop it once the layout centres both under the disc
          instead of hanging them off it.
        */}
        {empty ? (
          <Badge variant="unrecorded" className="ms-14 sm:ms-0">{t('notRecorded')}</Badge>
        ) : (
          <p className="ps-14 text-base leading-relaxed font-semibold text-balance sm:ps-0">
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

      {/*
        ⚠ **Both lines used to be `truncate`, and on a phone that cut the one
        thing this tile exists to say.** The tile is the full column wide, the
        avatar and its gap take 60px of it, and a full Arabic name with a title
        — `د. هبة عبد الرحمن المحاسنة` — is longer than the ~228px left at
        320px. It rendered as an ellipsis mid-surname, and the specialty under
        it lost its last word or two the same way.

        They wrap now. A name is not a table cell that can afford an ellipsis:
        it is the person looking after you, and two lines of it cost less than
        the height of the avatar beside them. `min-w-0` stays — it is what lets
        a long unbroken run wrap inside this column instead of pushing the
        avatar off the card.
      */}
      <div className="min-w-0 flex-1">
        <p className="font-heading text-base leading-snug font-semibold">{practitioner.name}</p>
        {practitioner.specialty ? (
          <p className="text-sm leading-snug text-muted-foreground">{practitioner.specialty}</p>
        ) : null}
      </div>
    </Card>
  );
}

/*
 * `ContactLink` used to live here — the three full-width links this section
 * ended on: اتصال, عرض على الخريطة and واتساب, styled with `buttonVariants` on
 * real anchors so a `tel:` or `wa.me` could still be long-pressed.
 *
 * It took a knowing exception to §Buttons' 320px cap to do it, because three
 * stacked buttons capped at 320px on a 390px phone read as a column that had
 * failed to line up. That exception goes with them: nothing else here reaches
 * for `max-w-none`, and `max-w-80` stays the rule on `buttonVariants`.
 *
 * Reaching the clinic is its own settings row (`/portal/settings/contact-clinic`),
 * which draws the same number through `ClinicContactRow`.
 */
