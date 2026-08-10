import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

import { type PendingRequests } from '../types';

import { AppointmentRequestCard } from './appointment-request-card';
import { ClientRequestCard } from './client-request-card';
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
 * now sits under today's agenda in the narrow column, where an empty state is
 * one line and the row above it takes back the height.
 *
 * **Every pending request is here, and the list scrolls inside the card.** It
 * used to show three and hand the rest to the inbox, because it was then a
 * banner squeezed between the quick actions and the register; it now owns a
 * column of its own and is bounded by the one-screen layout the way the agenda
 * and the register are, so a busy morning is a scroll rather than a link to
 * somewhere else. The link to the inbox stays for the answered history, which
 * this panel never shows.
 *
 * **The window is three requests deep.** {@link VISIBLE_REQUESTS} is a bound on
 * height, not a slice — every pending request is rendered and the rest are a
 * scroll away, because a list that renders three and stops cannot be scrolled to
 * the fourth. `RequestsWindow` reads the block-end edge of the third tile from
 * the real layout rather than taking a hand-tuned rem, which is the only way the
 * count holds: inside this card a tile's content box is only ~296px wide, so a
 * message wraps to more lines than it would anywhere else — and in Arabic, to
 * more again. The tile helps by running tighter here than in the inbox (8px gaps
 * rather than 12px) and clamping a message to two lines, but even then three
 * tiles are ~600–640px depending on what is in them, and a fixed height that
 * fits one of those shows two-and-a-bit of the other.
 *
 * ⚠ That is still a big card, and what remains is inherent to the tile rather
 * than to this window: every request carries its own Accept and Decline, so a
 * request is a panel and not a row. Three of them is most of the column. If the
 * one-screen dashboard matters more than the third request,
 * {@link VISIBLE_REQUESTS} is now the only number to change.
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
  data: PendingRequests;
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
      `shrink-0`, so the card is never squeezed below its own contents. It is
      bounded already — the queue inside it stops at `22rem` and scrolls — so
      "what it needs" is a small, known number, and the agenda above takes the
      rest of the column. Without this the flex column was free to compress the
      card while its padded empty state stayed full size, which put the text
      out through the bottom edge.
    */
    <Card className="min-h-0 xl:shrink-0">
      {/* The register's header, disc and all — the same neutral mark, because
          the card is not a target and has nothing to promise the pointer. The
          count beside the title is what says this one is waiting on you. */}
      <CardHeader className="shrink-0 grid-cols-[auto_1fr_auto] items-start gap-x-2 gap-y-0">
        <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon name="chat" className="size-4" />
        </span>

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
          <CardTitle>{t('dashboard.heading')}</CardTitle>
          <Link
            href="/app/requests"
            className="-ms-1 mt-0.5 inline-flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-label font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t('dashboard.openInbox')}
            <Icon name="chevronEnd" className="size-3.5" />
          </Link>
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
            third tile ends. A tile is ~195px with no message and ~207px with a
            two-line one, so three of them plus two 8px gaps is anywhere between
            601px and 637px — the reason this is measured rather than declared.
            The fourth is a scroll away, and the third sitting flush against the
            bottom edge is what the fade below is drawn over.

            `max-h-[70vh]` is the guard on top of it: on a short laptop screen
            three tiles would be most of the viewport, and the card would stop
            being a panel on a dashboard. On a normal desktop the measurement is
            the smaller of the two and the window really is three deep.

            ⚠ This card is `shrink-0` inside the dashboard's one-screen column,
            so this height comes straight out of the agenda above it. See the
            note on `VISIBLE_REQUESTS` if that trade needs revisiting.

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
