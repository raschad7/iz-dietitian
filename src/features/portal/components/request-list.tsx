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
 * **Read-only.** A request is a record of an ask and its answer, not something
 * to edit: the client files it from the request form and the dietitian answers
 * it from their inbox. There is no withdraw button here — `withdrawRequest`
 * exists in the mutations and nothing in this redesign exposes it.
 *
 * A pending row shows the day asked for and no time, because the client named
 * none. The section renders only when there is something in it, so it
 * disappears on its own once everything has been answered.
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

              {request.appointment || request.preferredDate !== null ? (
                <div className="space-y-1 border-s-2 border-border ps-2.5 text-sm text-muted-foreground">
                  {request.appointment ? (
                    <p>
                      {t('request.currentSlot', {
                        date: formatMediumDate(locale, request.appointment.date),
                        time: formatMinute(locale, request.appointment.date, request.appointment.startMinute),
                      })}
                    </p>
                  ) : null}

                  {/*
                    The day asked for. No time, because the client named none —
                    their dietitian sets the hour when they approve it. Requests
                    filed before that rule still carry one, and still show it.
                  */}
                  {request.preferredDate !== null ? (
                    <p>
                      {request.preferredStartMinute === null
                        ? t('request.preferredDay', {
                            date: formatMediumDate(locale, request.preferredDate),
                          })
                        : t('request.preferredSlot', {
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
