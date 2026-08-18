import { getTranslations } from 'next-intl/server';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatLongDate, formatMediumDate, formatMinute } from '@/features/booking/format';
import { type ClinicHours } from '@/features/booking/validation';
import { patientToneStyle } from '@/features/booking/patient-color';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { formatTimeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

import { type StaffAppointmentRequest } from '../types';

import { AppointmentRequestActions } from './appointment-request-actions';

/**
 * One appointment request, as a row in the inbox.
 *
 * A server component: the dates, the plurals and the whole message catalogue
 * stay on the server, and only the two buttons ship as
 * `AppointmentRequestActions`.
 *
 * The row answers three questions in the order they are asked — who, what did
 * they ask for, and what is on the calendar now — and then offers the two
 * things that can be done about it. The client's own words come last and
 * unstyled apart from the quotation marks: it is the one part of the row nobody
 * else wrote.
 *
 * **Except when the words are the whole request.** A `new` request that names
 * no time is a note: the client wrote to their dietitian, who reads it and
 * books an appointment in the ordinary way, from the calendar. There is nothing
 * to approve — approving it would have to invent the time the client did not
 * give — so the row drops its action buttons entirely, and with them the amber
 * that means somebody is waiting on a decision. It is a message in an inbox,
 * and it looks like one.
 *
 * Requests filed before the portal stopped asking for a day still carry one,
 * are still answerable, and still get the buttons and the amber.
 */

/** See the note above: a `new` request with no proposed time is a message. */
function isNote(request: StaffAppointmentRequest): boolean {
  return request.kind === 'new' && request.preferredDate === null;
}

export type AppointmentRequestCardProps = {
  request: StaffAppointmentRequest;
  locale: Locale;
  hours: ClinicHours | null;
  today: string;
  now: Date;
  /**
   * `sm` is the dashboard panel: the card is narrower, dates shorten, and the
   * request draws itself as a `tile` — its own rounded surface, the shape the
   * agenda beside it gives an appointment — rather than as a ruled row in the
   * inbox's edge-to-edge list.
   */
  size?: 'default' | 'sm';
};

export async function AppointmentRequestCard({
  request,
  locale,
  hours,
  today,
  now,
  size = 'default',
}: AppointmentRequestCardProps) {
  const t = await getTranslations('requests');

  const compact = size === 'sm';
  const formatDate = compact ? formatMediumDate : formatLongDate;
  const note = isNote(request);

  return (
    <Card
      variant={compact ? 'tile' : 'listRow'}
      size={compact ? 'sm' : 'default'}
      /*
        `p-3` on the tile, against the variant's own `p-4`.

        The dashboard card around this one shows three requests before it
        scrolls, and a tile is the only part of that stack whose height is ours
        to spend: 8px off each tile is 24px back across the window. The inbox
        row keeps its `px-4` — it has a page to itself and no third tile to fit.
      */
      className={compact ? 'p-3' : 'px-4'}
    >
      {/* Tighter on the dashboard tile than in the inbox: three of these have to
          fit a window in a column that is also carrying today's agenda, and the
          inbox has a whole page to spend. */}
      <CardContent className={cn('flex flex-col', compact ? 'gap-2' : 'gap-3')}>
        <div className={cn('flex items-start', compact ? 'gap-2' : 'gap-3')}>
          {/*
            The client's own mark on the tile, not a glyph for the kind of
            request.

            On the dashboard the first question a queue answers is *who*, and
            every other list on this page — the agenda, the register, the
            calendar block — already answers it with this disc, in the same
            colour that person's appointments are drawn in. A calendar or a
            refresh glyph in its place said what the badge beside the name says
            in words, and said it in the one position the eye uses to tell one
            row from the next.

            The colour is the client's own, not a decorative one:
            `patientToneStyle` sets the single hue their position in the clinic
            maps to and `.patient-tone` builds the ramp from it, exactly as the
            register and the calendar do. `contents` keeps the wrapper out of
            the flex row's layout, so the span is a scope for the variables and
            nothing else. Without it `--tone-mark` is undefined here and every
            disc paints the same grey — which reads as "the colours are broken"
            rather than as a missing scope.

            **The inbox rows draw the same disc.** They kept the kind glyph for
            a release, on the argument that the page is scanned by kind — but a
            real inbox settles it: five messages from one client in a column,
            each opening with an identical grey speech bubble, so the position
            the eye uses to tell rows apart said the same thing five times. The
            kind is still there in words, as the badge under the name.
          */}
          <span className="patient-tone contents" style={patientToneStyle(request.clientSeq)}>
            <Avatar name={request.clientName} color="var(--tone-mark)" size="sm" className="mt-0.5" />
          </span>

          <div className={cn('min-w-0 flex-1', compact ? 'space-y-0.5' : 'space-y-1')}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="flex min-w-0 items-baseline gap-1.5">
                {/* The name links to the record, so "who is this?" is one click
                    rather than a search in another tab. */}
                <Link
                  href={`/app/clients/${request.clientId}`}
                  className="min-w-0 truncate text-body-md font-medium hover:underline"
                  dir="auto"
                >
                  {request.clientName}
                </Link>

                {compact && !note ? (
                  <Badge variant="attention" size="sm" className="shrink-0">
                    {t(`kind.${request.kind}`)}
                  </Badge>
                ) : null}
              </span>

              <span className="shrink-0 text-label text-muted-foreground">
                {formatTimeAgo(locale, request.createdAt, now)}
              </span>
            </div>

            {/*
              The kind, and on the tile it rides in the name's row rather than
              taking one of its own — a badge on its own line costs ~24px, and
              three tiles have to fit a window that was sized for one.

              **A note gets none at all.** "Client message" over a client's
              message, under their name and their avatar, was a label naming the
              thing directly beneath it; on the tile the words are the request
              and nothing else needs saying. The inbox keeps it, where the badge
              column is how that page is scanned.
            */}
            {compact ? null : (
              <Badge variant={note ? 'muted' : 'attention'} size="sm">
                {note ? t('kind.note') : t(`kind.${request.kind}`)}
              </Badge>
            )}

            {/*
              The day they asked for. Absent on a cancellation, which proposes
              none — the badge above has already said what it is.

              No time, because clients name a day and the dietitian sets the
              hour; the time is offered in the approve dialog instead. Rows filed
              before that rule do carry one, and still show it.
            */}
            {request.preferredDate !== null ? (
              <p className="text-body-sm">
                {request.preferredStartMinute === null
                  ? t('askedDay', { when: formatDate(locale, request.preferredDate) })
                  : t('asked', {
                      when: `${formatDate(locale, request.preferredDate)} · ${formatMinute(
                        locale,
                        request.preferredDate,
                        request.preferredStartMinute,
                      )}`,
                    })}
              </p>
            ) : null}

            {/* What is on the calendar now — the other half of a reschedule or
                a cancellation, and the thing approving one will change. */}
            {request.appointment ? (
              <p className="text-caption text-muted-foreground">
                {t('currently', {
                  when: `${formatDate(locale, request.appointment.date)} · ${formatMinute(
                    locale,
                    request.appointment.date,
                    request.appointment.startMinute,
                  )}`,
                })}
              </p>
            ) : null}

            {/*
              On a note this is the request, so it reads at full strength and
              keeps its line height. Everywhere else it is the client's aside
              beside the time they asked for, and stays quiet.
            */}
            {request.note ? (
              <p
                className={cn(
                  'text-body-sm',
                  note ? 'leading-relaxed whitespace-pre-line' : 'text-muted-foreground',
                  /*
                    On the dashboard tile the aside is clamped to one line. It
                    is what made this tile's height unpredictable — an Arabic
                    message wrapping to five lines pushed one request past the
                    height of two — and one line is what buys the third tile in
                    the window: this is the client's aside beside a time they
                    already named, not the request itself. The full text is one
                    click away in the inbox, which is what the link in that
                    card's header is for.

                    A note is not clamped: there the message *is* the request,
                    and hiding it would hide the item.
                  */
                  compact && !note && 'line-clamp-1',
                )}
                dir="auto"
              >
                “{request.note}”
              </p>
            ) : null}
          </div>
        </div>

        {/* Indented to the text column, so the controls line up under what they
            act on rather than under the mark: 44px past the inbox's disc, 36px
            past the tile's avatar (28px disc + the tile's 8px gap).

            A note has none: there is no time in it to approve, and a decline
            would be refusing a message. The dietitian reads it and books from
            the calendar like any other appointment. */}
        {note ? null : (
          <div className={cn('space-y-2', compact ? 'ps-9' : 'ps-11')}>
            <AppointmentRequestActions
              request={request}
              locale={locale}
              hours={hours}
              today={today}
              size={compact ? 'sm' : 'default'}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
