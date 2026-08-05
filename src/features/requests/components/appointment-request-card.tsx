import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { formatLongDate, formatMediumDate, formatMinute } from '@/features/booking/format';
import { type ClinicHours } from '@/features/booking/validation';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { formatTimeAgo } from '@/lib/format';

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
 */

const KIND_ICONS = {
  new: 'bookAppointment',
  reschedule: 'refresh',
  cancel: 'close',
} as const satisfies Record<StaffAppointmentRequest['kind'], IconName>;

export type AppointmentRequestCardProps = {
  request: StaffAppointmentRequest;
  locale: Locale;
  hours: ClinicHours | null;
  today: string;
  now: Date;
  /** `sm` is the dashboard panel, where the card is narrower and dates shorten. */
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

  return (
    <Card variant="listRow" size={compact ? 'sm' : 'default'} className="px-4">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          {/*
            Amber, never clay: clay is reserved for a genuine medical flag, and
            a person waiting for an answer is not one. Same rule the
            notifications feed follows.
          */}
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-status-attention-bg text-status-attention-fg">
            <Icon name={KIND_ICONS[request.kind]} className="size-4" />
          </span>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              {/* The name links to the record, so "who is this?" is one click
                  rather than a search in another tab. */}
              <Link
                href={`/app/clients/${request.clientId}`}
                className="min-w-0 truncate text-body-md font-medium hover:underline"
                dir="auto"
              >
                {request.clientName}
              </Link>

              <span className="shrink-0 text-label text-muted-foreground">
                {formatTimeAgo(locale, request.createdAt, now)}
              </span>
            </div>

            <Badge variant="attention" size="sm">
              {t(`kind.${request.kind}`)}
            </Badge>

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

            {request.note ? (
              <p className="text-body-sm text-muted-foreground" dir="auto">
                “{request.note}”
              </p>
            ) : null}
          </div>
        </div>

        {/* Indented to the text column, so the controls line up under what they
            act on rather than under the icon. */}
        <div className="space-y-2 ps-11">
          <AppointmentRequestActions
            request={request}
            locale={locale}
            hours={hours}
            today={today}
            size={compact ? 'sm' : 'default'}
          />
        </div>
      </CardContent>
    </Card>
  );
}
