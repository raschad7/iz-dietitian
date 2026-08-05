import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatMediumDate, formatMinute } from '@/features/booking/format';
import { type Locale } from '@/i18n/routing';
import { formatTimeAgo } from '@/lib/format';

import { type RequestStatus, type StaffAppointmentRequest } from '../types';

/**
 * What has already been answered, newest first.
 *
 * Read-only, and deliberately not undoable: an approval is an appointment on
 * the calendar, so taking one back is a change to *that*, made where
 * appointments are changed. A button here promising to reverse a booking would
 * be promising something this screen does not own.
 *
 * `withdrawn` is listed alongside approved and declined because a client taking
 * a request back is part of the story of that request — without it, an item the
 * dietitian saw this morning would simply be gone.
 */

const STATUS_VARIANTS = {
  approved: 'onTrack',
  declined: 'muted',
  withdrawn: 'muted',
  pending: 'attention',
} as const satisfies Record<RequestStatus, 'onTrack' | 'muted' | 'attention'>;

export async function AnsweredList({
  requests,
  locale,
  now,
}: {
  requests: StaffAppointmentRequest[];
  locale: Locale;
  now: Date;
}) {
  const t = await getTranslations('requests');

  return (
    <Card className="overflow-hidden p-0">
      <ul className="flex flex-col">
        {requests.map((request) => (
          <li key={request.id}>
            <Card variant="listRow" size="sm" className="px-4">
              <CardContent className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate text-body-sm font-medium" dir="auto">
                    {request.clientName}
                  </p>

                  {/* The day asked for, and the hour too on rows old enough to
                      carry one. See `AppointmentRequestCard`. */}
                  <p className="text-caption text-muted-foreground">
                    {t(`kind.${request.kind}`)}
                    {request.preferredDate === null
                      ? null
                      : request.preferredStartMinute === null
                        ? ` · ${formatMediumDate(locale, request.preferredDate)}`
                        : ` · ${formatMediumDate(locale, request.preferredDate)} · ${formatMinute(
                            locale,
                            request.preferredDate,
                            request.preferredStartMinute,
                          )}`}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={STATUS_VARIANTS[request.status]} size="sm">
                    {t(`status.${request.status}`)}
                  </Badge>
                  {/* When it was answered, not when it was asked — that is what
                      this list is a record of. */}
                  <span className="text-label text-muted-foreground">
                    {formatTimeAgo(locale, request.updatedAt, now)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </Card>
  );
}
