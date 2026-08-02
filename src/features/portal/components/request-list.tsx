import { useLocale, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatMediumDate, formatMinute } from '@/features/booking/format';
import { type PortalRequest, type RequestStatus } from '@/features/portal/types';
import { type Locale } from '@/i18n/routing';

/**
 * What the client asked for, and where each ask got to.
 *
 * Shown alongside the appointments themselves rather than on a page of its own:
 * a request is only ever read in the context of "so what is happening with my
 * appointments?", and a separate screen would make the client hunt for it.
 *
 * **Historical, and read-only.** The portal no longer opens requests of any kind
 * — appointments are the dietitian's to make and to move — so nothing new can
 * appear here, and there is no longer a withdraw button. What is kept is the
 * record: a client who filed a request before that change should still be able
 * to see it and its answer, rather than watch it vanish. The section renders
 * only when there is something in it, so it disappears on its own once these
 * have been answered.
 */

/**
 * Status is not a traffic light (design-system.md §06). `attention` is amber
 * because a pending request is genuinely waiting on someone; `incomplete` is
 * neutral grey rather than red because a declined request is information, not a
 * failure — the dietitian answered, and the answer was no.
 */
const STATUS_VARIANTS = {
  pending: 'attention',
  approved: 'onTrack',
  declined: 'incomplete',
  withdrawn: 'muted',
} as const satisfies Record<RequestStatus, 'muted' | 'attention' | 'onTrack' | 'incomplete'>;

export function RequestList({ requests }: { requests: readonly PortalRequest[] }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal');

  return (
    <ul className="space-y-3">
      {requests.map((request) => (
        <li key={request.id}>
          <Card size="sm">
            <CardContent className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-heading text-sm font-medium">
                  {t(`request.kind.${request.kind}`)}
                </span>
                <Badge variant={STATUS_VARIANTS[request.status]}>
                  {t(`request.status.${request.status}`)}
                </Badge>
              </div>

              {request.appointment || (request.preferredDate !== null && request.preferredStartMinute !== null) ? (
                <div className="space-y-1 border-s-2 border-border ps-2.5 text-sm text-muted-foreground">
                  {request.appointment ? (
                    <p>
                      {t('request.currentSlot', {
                        date: formatMediumDate(locale, request.appointment.date),
                        time: formatMinute(locale, request.appointment.date, request.appointment.startMinute),
                      })}
                    </p>
                  ) : null}

                  {request.preferredDate !== null && request.preferredStartMinute !== null ? (
                    <p>
                      {t('request.preferredSlot', {
                        date: formatMediumDate(locale, request.preferredDate),
                        time: formatMinute(locale, request.preferredDate, request.preferredStartMinute),
                      })}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {request.note ? (
                <p className="rounded-md bg-muted px-3 py-2 text-sm leading-relaxed whitespace-pre-line">
                  {request.note}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
