import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { formatTimeAgo } from '@/lib/format';

import { type StaffClientRequest } from '../types';

import { ClientRequestActions } from './client-request-actions';

/**
 * One request about the client's own record.
 *
 * Nothing on the staff side read `client_requests` before this — the portal
 * wrote rows and they sat there, which meant a client filing a correction was
 * told it had been sent to a clinic that could not see it.
 *
 * The row leads with the client's words rather than with a category, because a
 * correction *is* its message: "my phone number is wrong, it should be …" is
 * the whole item, and `topic` is only how it gets routed. A deletion request
 * carries no message and says so with its badge alone.
 */

const KIND_ICONS = {
  data_update: 'edit',
  account_deletion: 'attention',
} as const satisfies Record<StaffClientRequest['kind'], IconName>;

export type ClientRequestCardProps = {
  request: StaffClientRequest;
  locale: Locale;
  now: Date;
  size?: 'default' | 'sm';
};

export async function ClientRequestCard({ request, locale, now, size = 'default' }: ClientRequestCardProps) {
  const t = await getTranslations('requests');

  const compact = size === 'sm';
  const isDeletion = request.kind === 'account_deletion';

  return (
    <Card variant="listRow" size={compact ? 'sm' : 'default'} className="px-4">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          {/*
            A deletion is the one item in this inbox that ends someone's care,
            so it takes the medical tone. A correction is ordinary work and
            stays amber with everything else.
          */}
          <span
            className={
              isDeletion
                ? 'flex size-8 shrink-0 items-center justify-center rounded-full bg-status-medical-bg text-status-medical-fg'
                : 'flex size-8 shrink-0 items-center justify-center rounded-full bg-status-attention-bg text-status-attention-fg'
            }
          >
            <Icon name={KIND_ICONS[request.kind]} className="size-4" />
          </span>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
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

            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={isDeletion ? 'medical' : 'attention'} size="sm">
                {t(`clientKind.${request.kind}`)}
              </Badge>

              {/* The topic is how staff route the item without reading it, so
                  it sits beside the kind rather than inside the message. */}
              {request.topic ? (
                <Badge variant="outline" size="sm">
                  {t(`topic.${request.topic}`)}
                </Badge>
              ) : null}
            </div>

            {request.message ? (
              <p className="text-body-sm" dir="auto">
                “{request.message}”
              </p>
            ) : null}

            {isDeletion ? (
              <p className="text-caption text-muted-foreground">{t('clientKind.deletionExplain')}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-2 ps-11">
          <ClientRequestActions request={request} locale={locale} size={compact ? 'sm' : 'default'} />
        </div>
      </CardContent>
    </Card>
  );
}
