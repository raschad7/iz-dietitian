import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { type PendingRequests } from '../types';

import { AppointmentRequestCard } from './appointment-request-card';
import { ClientRequestCard } from './client-request-card';

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

  const t = await getTranslations('requests');

  // Appointments first, for the same reason the inbox orders them that way: a
  // slot someone else may take is more urgent than a correction.
  const { appointments, clientRequests } = data;

  return (
    <Card className="min-h-0">
      {/* The register's header, disc and all — the same neutral mark, because
          the card is not a target and has nothing to promise the pointer. The
          count beside the title is what says this one is waiting on you, and it
          is a bare numeral rather than a pill: a count is a quantity, not a
          state. See "A badge is a state" in docs/design-system.md. */}
      <CardHeader className="shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon name="chat" className="size-4" />
        </span>
        <CardTitle>{t('dashboard.heading')}</CardTitle>
        {total > 0 ? (
          <span className="text-heading-sm font-semibold tabular-nums">{total}</span>
        ) : null}
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        {total === 0 ? (
          /*
            The empty card is one statement in a dashed box, not three things
            stacked down the inline-start edge. It was a title, a grey sentence
            and a ghost link at three different widths with card-sized gaps
            between them — nothing lined up with anything, and the link floated
            as if it had lost the list it belonged under. Boxed and centred, the
            three read as one panel, and the way to the inbox sits inside it as
            the single next step rather than as leftover furniture.

            The same shape as the agenda's empty state directly above it, which
            is the point: two panels in one column saying "nothing today" should
            say it the same way.
          */
          <div className="flex shrink-0 flex-col items-center gap-3 rounded-lg border border-dashed border-border p-6 text-center">
            <Icon name="chat" className="size-6 text-muted-foreground" />
            <p className="text-body-md text-muted-foreground">{t('dashboard.empty')}</p>
            <Link
              href="/app/requests"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              {t('dashboard.openInbox')}
              <Icon name="chevronEnd" />
            </Link>
          </div>
        ) : (
          /*
            The whole queue, scrolled rather than truncated. `max-h-[22rem]` is
            the ceiling at every width now, not only below `xl`: this card sits
            *under* today's agenda in the narrow column rather than beside the
            register, so it is no longer a full-height panel with the layout
            bounding it — it takes what it needs and gives the rest back to the
            agenda above. `pe-1` leaves the scrollbar somewhere to sit that is
            not on top of the tiles, and `overscroll-contain` keeps a flick at
            the end of the queue off the shell behind it.
          */
          <ul className="flex max-h-[22rem] flex-col gap-2 overflow-y-auto overscroll-contain pe-1">
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
          </ul>
        )}

        {/* The inbox, at the foot of the card rather than in its header — the
            same ghost link, in the same place, as "See all clients" beside it.
            Only when there is a queue: the empty state above carries its own
            way through, and two links to one place is one too many. */}
        {total > 0 ? (
          <Link
            href="/app/requests"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0 self-start')}
          >
            {t('dashboard.openInbox')}
            <Icon name="chevronEnd" />
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
