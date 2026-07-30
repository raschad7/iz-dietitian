import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMinute } from '@/features/booking/format';
import { type PendingRequestPreview } from '@/features/dashboard/queries';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

type RequestsCardProps = {
  items: PendingRequestPreview[];
  total: number;
  locale: Locale;
};

/**
 * An unanswered request means a real person is waiting, so this is the most
 * urgent thing on the page — and the one place lime appears (§ design-system.md).
 *
 * There is no dedicated requests-review page yet (nothing in the app reads
 * `appointment_requests` from the staff side today), so the button lands on
 * the calendar's day view as the closest real destination. Flagged in the
 * PR description as a natural follow-up feature.
 */
export async function RequestsCard({ items, total, locale }: RequestsCardProps) {
  const t = await getTranslations('dashboard.requests');

  if (total === 0) {
    return <p className="px-1 text-sm text-muted-foreground">{t('empty')}</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('count', { count: total })}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((request) => (
          <div key={request.id} className="border-s-2 border-border ps-3 text-start text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{request.clientName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{t(`kind.${request.kind}`)}</span>
            </div>
            {request.preferredDate && request.preferredStartMinute !== null ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatMinute(locale, request.preferredDate, request.preferredStartMinute)}
              </p>
            ) : null}
            {request.note ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{request.note}</p> : null}
          </div>
        ))}
      </CardContent>
      <CardFooter>
        {/* The page's one lime element — never add a second accent button anywhere else. */}
        <Link href="/app/calendar/day" className={buttonVariants({ variant: 'accent', size: 'sm' })}>
          {t('cta')}
        </Link>
      </CardFooter>
    </Card>
  );
}
