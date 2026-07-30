import { useLocale, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { formatMediumDate, formatMinute } from '@/features/booking/format';
import { withdrawRequestAction } from '@/features/portal/actions';
import { type PortalRequest, type RequestStatus } from '@/features/portal/types';
import { type Locale } from '@/i18n/routing';

/**
 * What the client has asked for, and where each ask has got to.
 *
 * Shown alongside the appointments themselves rather than on a page of its own:
 * a request is only ever read in the context of "so what is happening with my
 * appointments?", and a separate screen would make the client hunt for it.
 */

const STATUS_VARIANTS = {
  pending: 'muted',
  approved: 'default',
  declined: 'outline',
  withdrawn: 'outline',
} as const satisfies Record<RequestStatus, 'default' | 'muted' | 'outline'>;

export function RequestList({ requests }: { requests: readonly PortalRequest[] }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal');

  return (
    <ul className="space-y-3">
      {requests.map((request) => (
        <li key={request.id}>
          <Card size="sm">
            <CardContent className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{t(`request.kind.${request.kind}`)}</span>
                <Badge variant={STATUS_VARIANTS[request.status]}>{t(`request.status.${request.status}`)}</Badge>
              </div>

              {request.appointment ? (
                <p className="text-sm text-muted-foreground">
                  {t('request.currentSlot', {
                    date: formatMediumDate(locale, request.appointment.date),
                    time: formatMinute(locale, request.appointment.date, request.appointment.startMinute),
                  })}
                </p>
              ) : null}

              {request.preferredDate !== null && request.preferredStartMinute !== null ? (
                <p className="text-sm text-muted-foreground">
                  {t('request.preferredSlot', {
                    date: formatMediumDate(locale, request.preferredDate),
                    time: formatMinute(locale, request.preferredDate, request.preferredStartMinute),
                  })}
                </p>
              ) : null}

              {request.note ? <p className="text-sm whitespace-pre-line">{request.note}</p> : null}

              {request.status === 'pending' ? (
                <form action={withdrawRequestAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="requestId" value={request.id} />
                  <ConfirmSubmitButton
                    label={t('request.withdraw')}
                    confirmMessage={t('request.confirmWithdraw')}
                    size="sm"
                  />
                </form>
              ) : null}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
