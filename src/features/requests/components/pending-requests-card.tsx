import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

import { type PendingRequests } from '../types';

import { AppointmentRequestCard } from './appointment-request-card';
import { ClientRequestCard } from './client-request-card';

/**
 * What clients are waiting for, on the dashboard.
 *
 * **It renders nothing when nothing is pending, and that is deliberate.** The
 * dashboard's stated constraint is that it fits one screen from `xl` up and
 * does not scroll, so a permanently-present card would spend a third of that
 * screen on the word "nothing" — the same reasoning that removed the four
 * summary counters that used to head this column. On a quiet morning the
 * register takes the whole row and the page is exactly what it was before this
 * feature existed; on a busy one, the thing with a person waiting at the other
 * end sits beside the register at full height. The page owns that switch — see
 * `src/app/[locale]/app/page.tsx`.
 *
 * **Every pending request is here, and the list scrolls inside the card.** It
 * used to show three and hand the rest to the inbox, because it was then a
 * banner squeezed between the quick actions and the register; it now owns a
 * column of its own and is bounded by the one-screen layout the way the agenda
 * and the register are, so a busy morning is a scroll rather than a link to
 * somewhere else. The inbox link stays in the header — it carries the answered
 * history, which this panel never shows.
 *
 * Accept and decline work here exactly as they do in the inbox — it is the same
 * card component. A dietitian who can see a request on this page can answer it
 * on this page.
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

  if (total === 0) return null;

  const t = await getTranslations('requests');

  // Appointments first, for the same reason the inbox orders them that way: a
  // slot someone else may take is more urgent than a correction.
  const { appointments, clientRequests } = data;

  return (
    <Card className="min-h-0 gap-0 p-0 xl:h-full">
      <CardHeader className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-3">
        <CardTitle className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-status-attention-bg text-status-attention-fg">
            <Icon name="chat" className="size-4" />
          </span>
          {t('dashboard.title', { count: total })}
        </CardTitle>

        <Link href="/app/requests" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          {t('dashboard.openInbox')}
          <Icon name="chevronEnd" />
        </Link>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        {/*
          The whole queue, scrolled rather than truncated. At `xl` the height is
          the row's — `flex-1`/`min-h-0` against a card the one-screen layout
          already bounds. Below `xl` nothing bounds it, so `max-h-[32rem]` is the
          ceiling there, the same fallback the register's list carries;
          `overscroll-contain` keeps a flick at the end of the queue off the
          shell behind it.
        */}
        <ul className="flex max-h-[32rem] flex-col overflow-y-auto overscroll-contain border-t border-border xl:max-h-none xl:min-h-0 xl:flex-1">
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
      </CardContent>
    </Card>
  );
}
