import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { type Locale } from '@/i18n/routing';

import { type RequestsData } from '../types';

import { AppointmentRequestCard } from './appointment-request-card';
import { ClientRequestCard } from './client-request-card';
import { RequestsDialogTrigger } from './requests-dialog-trigger';
import { RequestsInbox } from './requests-inbox';
import { RequestsWindow } from './requests-window';

/**
 * What clients are waiting for, on the dashboard.
 *
 * **It stays on the page when nothing is pending.** It used to return `null`,
 * on the argument that the dashboard is one screen and a card saying "nothing"
 * is a third of it spent on no news. That was the wrong trade for this card in
 * particular: a panel that appears and disappears is one nobody learns the
 * position of, so a request arriving on a quiet morning had to be *noticed*
 * rearranging the page rather than simply read where it always is. It also made
 * the answered history unreachable from here on exactly the days there was time
 * to review it — the inbox link went with the card.
 *
 * What made the old trade look necessary was the card's *place*: it sat beside
 * the register, so an empty one left a hole in the widest row on the page. It
 * spent a release under today's agenda in the narrow column, and now sits in the
 * dashboard's top band as the third card beside the two stat cards — a row where
 * every card is the same width and the same height, so an empty one leaves no
 * hole at all and the panel below takes the rest of the page.
 *
 * **Every pending request is here, and the list scrolls inside the card.** It
 * used to show three and hand the rest to the inbox, because it was then a
 * banner squeezed between the quick actions and the register. "All requests"
 * stays for the answered history, which this panel never shows — it opens the
 * inbox as a dialog over this page now rather than navigating to it, so nothing
 * about working the queue costs the dashboard. See `RequestsDialogTrigger`.
 *
 * **The window is three requests deep.** {@link VISIBLE_REQUESTS} is a bound on
 * height, not a slice — every pending request is rendered and the rest are a
 * scroll away, because a list that renders three and stops cannot be scrolled to
 * the fourth. `RequestsWindow` reads the block-end edge of the Nth tile from the
 * real layout rather than taking a hand-tuned rem, which is the only way the
 * count holds: inside this card a tile's content box is narrow, so a message
 * wraps to more lines than it would anywhere else — and in Arabic, to more
 * again.
 *
 * ⚠ **It was one, and the tile is what changed.** A request tile used to be
 * ~195–207px — every request carries its own Accept and Decline, so it is a
 * panel rather than a row — and three of those was ~600px against the ~230px of
 * the two stat cards this card sits beside. So the window was one deep, and a
 * dietitian had to scroll a two-item queue to learn the second item existed.
 *
 * The fix was the tile, not the window: `p-3` instead of `p-4`, the kind badge
 * moved up into the name's row instead of taking one of its own, an
 * appointment's aside clamped to one line instead of two, and the client's
 * avatar in place of the kind glyph. Nothing about *this* card changed to make
 * room — its padding, its header and its `max-h-[70vh]` ceiling are all as they
 * were. The band is still taller on a morning with three requests waiting than
 * on a quiet one; what it is not is three tiles' worth taller.
 *
 * **The way to the inbox is a labelled link in the header's block-start
 * inline-start corner, not a button under the list.** At the foot it was a
 * full-width-ish ghost button competing with the Accept on every tile above it
 * — three olive-ish controls in a column, one of which merely navigates. It
 * then spent a while as a lone chevron at the far inline-end of the header,
 * which is the furthest point on the card from the heading it qualifies and
 * needed a tooltip to say what it meant. It now sits directly under the title
 * as a quiet subtitle-scale link, so the corner the eye starts from reads
 * "Client requests / All requests" in one movement. The fade over the last few
 * pixels of the list is what says there is more below; the count, at the
 * inline-end, says how much.
 *
 * **It is built to the register and the agenda around it**, because the three
 * panels on this screen have to read as one set: the same padded `Card`, the
 * same header of a disc and a title, the same scrolling list, the same ghost
 * link at the foot pointing at the full view. It used to be the odd one out —
 * a flush, edge-to-edge frame with rules between its rows and its link up in
 * the header — which made the panel read as an alert bar dropped into the
 * dashboard rather than as one of its cards.
 *
 * Accept and decline work here exactly as they do in the inbox — it is the same
 * card component, asked for its `tile` shape rather than its list-row one, so a
 * request sits on this page the way an appointment sits in the agenda: its own
 * rounded surface with air around it. A dietitian who can see a request on this
 * page can answer it on this page.
 */
/**
 * How many requests the card shows before the list starts scrolling.
 *
 * The one number: `RequestsWindow` turns it into a height by measuring the Nth
 * tile, and it also decides whether the "there is more" fade is drawn. CSS
 * cannot size a box to its first N children when those children differ in
 * height, which is why that measurement exists at all.
 */
const VISIBLE_REQUESTS = 3;

export async function PendingRequestsCard({
  data,
  locale,
  now,
}: {
  data: RequestsData;
  locale: Locale;
  now: Date;
}) {
  const total = data.appointments.length + data.clientRequests.length;
  const hasMore = total > VISIBLE_REQUESTS;

  const t = await getTranslations('requests');

  // Appointments first, for the same reason the inbox orders them that way: a
  // slot someone else may take is more urgent than a correction.
  const { appointments, clientRequests } = data;

  return (
    /*
      `min-h-0` so the queue inside can be the thing that scrolls. The card no
      longer needs the `xl:shrink-0` it carried in the narrow column: it is a
      grid item now, not a flex child, and nothing is trying to compress it.
    */
    <Card className="min-h-0">
      {/* The register's header, disc and all — the same neutral mark, because
          the card is not a target and has nothing to promise the pointer. The
          count beside the title is what says this one is waiting on you. */}
      {/*
        Two columns, not three. The disc that used to head this card — a 32px
        muted circle with the glyph inside it — went with the dashboard's other
        two panel headings: `CardTitle`'s own `icon` draws a bare glyph, and
        three cards in one row cannot each pick their own way of marking a
        heading. The disc was matching the register card's header, and the
        register card no longer exists.
      */}
      <CardHeader className="shrink-0 grid-cols-[1fr_auto] items-start gap-x-2 gap-y-0">
        {/*
          Title, and the way to the inbox directly under it at the block-start
          inline-start corner of the card.

          It used to be an icon-only chevron at the far inline-end of this row,
          which put the one navigational control on the card as far as it could
          get from the thing it navigates *about* — and made it lean on a
          tooltip for a name, because a lone chevron says "more" without saying
          more of what. Here it is a labelled link in the corner the eye starts
          from, reading as a subtitle to the heading it sits under: "Client
          requests / All requests". The tooltip goes with the icon-only shape;
          the text is now the accessible name, which is the shape that never
          needed one.

          `chevronEnd` rather than an arrow or an external-link mark: it is the
          only one of the three in `DIRECTIONAL` (see `icon.tsx`), so it flips
          for Arabic on its own — an arrow that keeps pointing right on a
          right-to-left page points back at the page it came from.

          Always rendered, empty queue or not. It used to appear only when
          something was pending, with the empty state carrying its own outline
          button to the same page — which meant the one control on this card
          moved from the header to the middle of a dashed box and changed shape
          on its way, depending on a condition the reader has no view of. A
          control that relocates is one nobody learns the position of, which is
          the same argument this card's own doc makes about the card. It sits in
          the corner now and stays there; the empty state below drops its button
          rather than duplicating it.
        */}
        <div className="min-w-0">
          <CardTitle as="h2" size="sm" tone="muted" icon="chat">
            {t('dashboard.heading')}
          </CardTitle>
          {/*
            It opens the inbox over this page rather than navigating to it —
            see `RequestsDialogTrigger`. Same words, same corner, same styling
            as the link it replaces; what changes is that answering the fourth
            request no longer costs the dashboard.
          */}
          <RequestsDialogTrigger
            locale={locale}
            className="-ms-1 mt-0.5 inline-flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-label font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            inbox={
              <RequestsInbox
                data={data}
                locale={locale}
                now={now}
                presentation="cards"
                appointmentsHeading={false}
              />
            }
            heading={
              appointments.length > 0 ? (
                /*
                  The appointments list's heading, for the dialog's header bar.

                  It is built here rather than inside the dialog because this is
                  the server: the words and the number are both `t()` and data,
                  and the trigger is a client component that holds neither.

                  `items-baseline` and the heading's own size on the numeral, so
                  the word and the count read as one phrase rather than as a
                  label with a footnote — the same pair `SectionHeading` draws
                  for the record corrections below.
                */
                <span className="flex items-baseline gap-2 self-center">
                  <span className="text-heading-sm font-semibold">
                    {t('sectionLabels.appointments')}
                  </span>
                  <span className="text-heading-sm font-semibold tabular-nums text-muted-foreground">
                    {appointments.length}
                  </span>
                </span>
              ) : null
            }
          >
            {t('dashboard.openInbox')}
          </RequestsDialogTrigger>
        </div>

        {/* A bare numeral, not a pill: a count is a quantity, not a state. See
            "A badge is a state" in docs/design-system.md. */}
        {total > 0 ? (
          <span className="text-heading-sm font-semibold tabular-nums">{total}</span>
        ) : null}
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        {total === 0 ? (
          /*
            The empty card is one statement in a dashed box: a glyph and a
            sentence on one centred axis, the same shape the agenda's empty
            state has directly above it. Two panels in one column saying
            "nothing today" should say it the same way.

            **No button.** It carried an outline link to the inbox, which was
            the whole reason this box needed `p-6` and three stacked children.
            That link now lives in the header and is there whether the queue is
            empty or not — so a button here is the same destination twice, and
            the louder of the two is the one on the card that has nothing to
            report. The agenda keeps its button because "book an appointment"
            is an action; "read the answered history" is navigation, and this
            card already has a place for that.

            The box shrinks with it: `px-4 py-6` rather than `p-6` all round,
            because with the widest child gone the horizontal padding was
            holding the box out to a width nothing inside it needed.
          */
          <div className="flex shrink-0 flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center">
            <Icon name="chat" className="size-6 text-muted-foreground" />
            <p className="text-body-md text-muted-foreground">{t('dashboard.empty')}</p>
          </div>
        ) : (
          /*
            The whole queue, scrolled rather than truncated, in a window three
            requests deep.

            The height comes from `RequestsWindow`, which measures where the
            third tile ends rather than trusting a figure written here — a tile
            with no message and one with a wrapped Arabic message do not measure
            the same, and neither do the appointment and client shapes. The
            fourth is a scroll away, and the third sitting flush against the
            bottom edge is what the fade below is drawn over.

            `max-h-[70vh]` is the guard on top of it and is unchanged. With
            three of the tightened tiles it is the looser of the two on a normal
            screen and the binding one on a short laptop, where it shows the
            third tile part-way and scrolls rather than taking the appointments
            panel off the page.

            `pe-1` leaves the scrollbar somewhere to sit that is not on top of
            the tiles, and `overscroll-contain` keeps a flick at the end of the
            queue off the shell behind it.
          */
          <div className="relative min-h-0">
            <RequestsWindow visible={VISIBLE_REQUESTS} count={total} className="max-h-[70vh]">
              {appointments.map((request) => (
                <li key={request.id}>
                  <AppointmentRequestCard
                    request={request}
                    locale={locale}
                    hours={data.hours}
                    today={data.today}
                    now={now}
                    size="sm"
                  />
                </li>
              ))}

              {clientRequests.map((request) => (
                <li key={request.id}>
                  <ClientRequestCard request={request} locale={locale} now={now} size="sm" />
                </li>
              ))}
            </RequestsWindow>

            {/*
              "There is more below", as a fade rather than a label.

              An overlay rather than a `mask-image` on the scroller itself: a
              mask would fade the scrollbar along with the tiles, and the
              scrollbar is the other half of what tells you this list moves.
              `pointer-events-none` keeps it from eating a click on the tile
              underneath.

              `end-1` matches the list's own `pe-1` rather than the scrollbar's
              full width — a classic scrollbar measures ~15px here, so the
              gradient does still pass over part of the track. Left as is on
              purpose: the alternative is hard-coding a width that is wrong on
              every platform drawing overlay scrollbars, and what passes over the
              track is the transparent end of a card-coloured gradient.

              Only when the queue is deeper than the window — with three or
              fewer there is nothing below to hint at, and a permanent fade over
              a list that does not scroll is a lie about the content.

              A vertical gradient, so unlike a horizontal one it needs no
              mirroring in Arabic.
            */}
            {hasMore ? (
              <div
                aria-hidden
                /*
                  Logical insets only. `inset-x-0` is physical (`left`/`right`)
                  and `end-1` is logical (`inset-inline-end`); at equal
                  specificity the winner is whichever Tailwind emits last, which
                  is not something to depend on — measured, the physical pair won
                  and the fade sat on top of the scrollbar. `start-0 end-1` says
                  the same thing in one family and mirrors for Arabic for free.
                */
                className="pointer-events-none absolute start-0 end-1 bottom-0 h-8 bg-linear-to-t from-card to-transparent"
              />
            ) : null}
          </div>
        )}

      </CardContent>
    </Card>
  );
}
