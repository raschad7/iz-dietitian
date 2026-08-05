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
 * does not scroll, so a permanently-present card would spend the page's most
 * valuable row on the word "nothing" — the same reasoning that removed the four
 * summary counters that used to head this column. On a quiet morning the
 * dashboard is exactly the page it was before this feature existed; on a busy
 * one, the thing with a person waiting at the other end is the first thing on
 * it.
 *
 * The full inbox is one click away and carries the answered history, so this
 * shows the first few and links out rather than growing without limit. The list
 * scrolls inside the card, like the agenda beside it, instead of pushing the
 * page taller.
 *
 * Accept and decline work here exactly as they do in the inbox — it is the same
 * card component. A dietitian who can see a request on this page can answer it
 * on this page.
 */

/**
 * How many rows the panel shows before deferring to the inbox.
 *
 * Three: enough that a normal morning is answered without leaving the
 * dashboard, few enough that the card cannot take the screen from the register
 * and the charts below it.
 */
const PREVIEW_LIMIT = 3;

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
  const appointments = data.appointments.slice(0, PREVIEW_LIMIT);
  const clientRequests = data.clientRequests.slice(0, Math.max(0, PREVIEW_LIMIT - appointments.length));
  const hidden = total - appointments.length - clientRequests.length;

  return (
    <Card className="shrink-0 gap-0 p-0 xl:min-h-0">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-3">
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

      <CardContent className="p-0">
        {/* Capped rather than free-growing: three rows of controls is already a
            tall card, and the page below it has work of its own to show. */}
        <ul className="flex max-h-96 flex-col overflow-y-auto border-t border-border">
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

        {hidden > 0 ? (
          <Link
            href="/app/requests"
            className="flex items-center justify-center gap-1 border-t border-border bg-muted/50 px-4 py-2 text-caption text-muted-foreground hover:text-foreground"
          >
            {t('dashboard.more', { count: hidden })}
            <Icon name="chevronEnd" className="size-3.5" />
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
