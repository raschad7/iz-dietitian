import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon, type IconName } from '@/components/ui/icon';
import { formatMinute } from '@/features/booking/format';
import { type NotificationsData } from '@/features/notifications/types';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { formatTimeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Everything waiting on the dietitian, as two lists.
 *
 * ## What this stopped being
 *
 * It was the feed inside the bell's popover, and after the bell went away it
 * was still shaped like one: a `max-h-96` scroll region inside a card on a page
 * that already scrolls, a footer strip of buttons repeating the link every row
 * already carried, and the actual message — "New booking request" — set at
 * `text-caption`, the 12px step the design system reserves for things nobody
 * needs to read. The client's name was the only thing on the row at a legible
 * size, and a name is the label, not the news.
 *
 * ## Two lists, not one feed
 *
 * A request is a person waiting for an answer, and it is answered on
 * `/app/requests`. An attention flag is the system noticing a client has
 * drifted, and it is answered — if at all — inside that client's record. They
 * were interleaved and told apart by the tint of a small disc, which is a lot
 * of work to ask of a reader deciding what to do next. Separated, each card
 * states its own job in its heading and every row inside it goes to the same
 * kind of place.
 *
 * The requests card is first and stays first, empty or not, because it is the
 * one with someone at the other end.
 */

const REQUEST_ICONS = {
  new: 'bookAppointment',
  reschedule: 'refresh',
  cancel: 'close',
} as const satisfies Record<string, IconName>;

/**
 * A request lands in the inbox that can answer it; anything else lands on the
 * client it is about.
 *
 * This used to send requests to the calendar day they asked about, because
 * there was no staff-side inbox and the day view was the closest thing to one.
 * There is now — `/app/requests` — and it is where accepting or declining
 * actually happens, so a feed row that dropped the reader on a calendar to
 * re-do the booking by hand would be sending them the long way round.
 */

export async function NotificationsList({
  data,
  locale,
}: {
  data: NotificationsData;
  locale: Locale;
}) {
  const t = await getTranslations('notifications');
  const { requests, attention, pendingRequestCount, now } = data;

  // Nothing in either list is a real state, and it deserves the shape the
  // system gives an empty screen rather than two cards each saying "none".
  if (requests.length === 0 && attention.length === 0) {
    return <EmptyState icon="check" title={t('empty')} description={t('emptyDescription')} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <Section
        title={t('groups.requests')}
        description={t('groups.requestsDescription')}
        icon="bookAppointment"
        count={pendingRequestCount}
        empty={t('groups.requestsEmpty')}
        isEmpty={requests.length === 0}
        /*
         * Only when the list is capped. The rows already link here, so an
         * always-on "review requests" button would be the same destination
         * said twice — it earns its place solely by naming the ones this card
         * is not showing.
         */
        more={
          pendingRequestCount > requests.length
            ? { href: '/app/requests', label: t('reviewRequests', { count: pendingRequestCount }) }
            : null
        }
      >
        {requests.map((item) => (
          <Row
            key={item.id}
            href="/app/requests"
            icon={REQUEST_ICONS[item.requestKind]}
            tone="attention"
            name={item.clientName}
            message={t(`request.${item.requestKind}`)}
            detail={
              item.preferredDate && item.preferredStartMinute !== null
                ? t('preferred', {
                    when: formatMinute(locale, item.preferredDate, item.preferredStartMinute),
                  })
                : null
            }
            time={formatTimeAgo(locale, item.createdAt, now)}
          />
        ))}
      </Section>

      <Section
        title={t('groups.attention')}
        description={t('groups.attentionDescription')}
        icon="attention"
        count={attention.length}
        empty={t('groups.attentionEmpty')}
        isEmpty={attention.length === 0}
        more={null}
      >
        {attention.map((item) => (
          <Row
            key={item.id}
            href={`/app/clients/${item.clientId}`}
            icon="attention"
            tone="incomplete"
            name={item.clientName}
            message={t(`attention.${item.reason}`)}
            detail={null}
            time={null}
          />
        ))}
      </Section>
    </div>
  );
}

/**
 * One of the two lists.
 *
 * The rows run edge to edge inside the card, so `CardContent` drops its inline
 * padding and each row carries the card's own spacing instead — that is what
 * keeps a hover fill reaching the card's edge rather than floating in a gutter.
 * The list is ruled with `divide-y` rather than a border per row, so the line
 * lands once between each pair and never doubles at the ends.
 */
function Section({
  title,
  description,
  icon,
  count,
  empty,
  isEmpty,
  more,
  children,
}: {
  title: string;
  description: string;
  icon: IconName;
  count: number;
  empty: string;
  isEmpty: boolean;
  more: { href: '/app/requests'; label: string } | null;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-0">
      <CardHeader className="grid-cols-[auto_1fr_auto] items-center gap-3">
        {/*
          Static: the card is not a target — its rows are — so the disc has
          nothing to promise the pointer and keeps its neutral fill.
        */}
        <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon name={icon} className="size-4" />
        </span>

        <div className="min-w-0">
          <CardTitle as="h2">{title}</CardTitle>
          {/*
            `body-sm`, not `caption`: this line says what the list is for, and
            a reader who has not seen the screen before needs it.
          */}
          <p className="text-body-sm text-muted-foreground">{description}</p>
        </div>

        {/*
          A bare numeral, not a pill — see "A badge is a state" in
          docs/design-system.md. A count is a quantity, and this screen would
          otherwise wear two chips saying nothing a digit does not.
        */}
        {count > 0 ? (
          <span className="text-heading-sm font-semibold tabular-nums">{count}</span>
        ) : null}
      </CardHeader>

      {isEmpty ? (
        <CardContent className="pb-(--card-spacing)">
          <p className="text-body-md text-muted-foreground">{empty}</p>
        </CardContent>
      ) : (
        <ul className="flex flex-col divide-y divide-border border-t border-border">{children}</ul>
      )}

      {more ? (
        <div className="border-t border-border px-2 py-2">
          <Link href={more.href} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            {more.label}
            <Icon name="chevronEnd" />
          </Link>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * One row.
 *
 * Built to the register's rhythm on purpose — the same hover tint, the same
 * `body-sm` for the supporting facts — because this list and that one are read
 * by the same person minutes apart and had no business having two.
 *
 * The name is `body-md` and the message `body-sm`: the message is what the row
 * is telling you, and it used to be 12px under a 16px name, which put the
 * emphasis on knowing *who* rather than *what*.
 */
function Row({
  href,
  icon,
  tone,
  name,
  message,
  detail,
  time,
}: {
  href: string;
  icon: IconName;
  tone: 'attention' | 'incomplete';
  name: string;
  message: string;
  detail: string | null;
  time: string | null;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-start gap-3 px-(--card-spacing) py-3 transition-colors hover:bg-secondary/60"
      >
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full',
            tone === 'attention'
              ? 'bg-status-attention-bg text-status-attention-fg'
              : 'bg-status-incomplete-bg text-status-incomplete-fg',
          )}
        >
          <Icon name={icon} className="size-4" />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-body-md font-medium" dir="auto">
              {name}
            </span>
            {time ? (
              <span className="shrink-0 text-caption text-muted-foreground">{time}</span>
            ) : null}
          </span>

          <span className="text-body-sm text-muted-foreground">{message}</span>
          {detail ? <span className="text-body-sm text-muted-foreground">{detail}</span> : null}
        </span>
      </Link>
    </li>
  );
}
