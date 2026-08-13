import { getTranslations } from 'next-intl/server';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { patientToneStyle } from '@/features/booking/patient-color';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { formatTimeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

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
  /** See `AppointmentRequestCardProps.size` — `sm` is the dashboard's tile. */
  size?: 'default' | 'sm';
};

export async function ClientRequestCard({ request, locale, now, size = 'default' }: ClientRequestCardProps) {
  const t = await getTranslations('requests');

  const compact = size === 'sm';
  const isDeletion = request.kind === 'account_deletion';

  return (
    <Card
      variant={compact ? 'tile' : 'listRow'}
      size={compact ? 'sm' : 'default'}
      /* `p-3` on the tile against the variant's `p-4` — see the matching note in
         `AppointmentRequestCard`. The two tiles share one list and have to
         measure the same. */
      className={compact ? 'p-3' : 'px-4'}
    >
      {/* Tighter on the dashboard tile than in the inbox — see the matching note
          in `AppointmentRequestCard`. The two tiles sit in one list and have to
          measure the same. */}
      <CardContent className={cn('flex flex-col', compact ? 'gap-2' : 'gap-3')}>
        <div className={cn('flex items-start', compact ? 'gap-2' : 'gap-3')}>
          {/*
            The client's own mark on the tile — the same swap the appointment
            tile makes, and for the same reason: on the dashboard a queue is
            read by who is in it. The deletion's clay is not lost with the
            glyph; its badge is the `medical` one, which is the thing a reader
            was actually reading.

            The disc is painted in the client's own hue — see the matching note
            in `AppointmentRequestCard` for what `.patient-tone` and
            `patientToneStyle` are doing.

            In the inbox the disc stays, and a deletion takes the medical tone
            there — it is the one item in that list that ends someone's care. A
            correction is ordinary work and stays amber with everything else.
          */}
          {compact ? (
            <span className="patient-tone contents" style={patientToneStyle(request.clientSeq)}>
              <Avatar name={request.clientName} color="var(--tone-mark)" size="sm" className="mt-0.5" />
            </span>
          ) : (
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full',
                isDeletion
                  ? 'bg-status-medical-bg text-status-medical-fg'
                  : 'bg-status-attention-bg text-status-attention-fg',
              )}
            >
              <Icon name={KIND_ICONS[request.kind]} className="size-4" />
            </span>
          )}

          <div className={cn('min-w-0 flex-1', compact ? 'space-y-0.5' : 'space-y-1')}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <Link
                  href={`/app/clients/${request.clientId}`}
                  className="min-w-0 truncate text-body-md font-medium hover:underline"
                  dir="auto"
                >
                  {request.clientName}
                </Link>

                {/* On the tile the kind rides in the name's row rather than
                    taking one of its own — see `AppointmentRequestCard`. */}
                {compact ? (
                  <Badge variant={isDeletion ? 'medical' : 'attention'} size="sm" className="shrink-0">
                    {t(`clientKind.${request.kind}`)}
                  </Badge>
                ) : null}
              </span>

              <span className="shrink-0 text-label text-muted-foreground">
                {formatTimeAgo(locale, request.createdAt, now)}
              </span>
            </div>

            {/* In the inbox the kind and the topic are a row of their own. On
                the tile the kind is up beside the name and the topic goes: it
                is how a list is routed without reading it, and the tile has one
                line of the message right under it doing that better. */}
            {compact ? null : (
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
            )}

            {/* Clamped on the dashboard tile only — see the matching note in
                `AppointmentRequestCard`. Unlike an appointment's aside this
                message *is* the correction, so it keeps two lines where that
                one drops to one: enough to tell one correction from another,
                with the rest in the inbox. */}
            {request.message ? (
              <p className={cn('text-body-sm', compact && 'line-clamp-2')} dir="auto">
                “{request.message}”
              </p>
            ) : null}

            {isDeletion ? (
              <p className="text-caption text-muted-foreground">{t('clientKind.deletionExplain')}</p>
            ) : null}
          </div>
        </div>

        <div className={cn('space-y-2', compact ? 'ps-9' : 'ps-11')}>
          <ClientRequestActions request={request} locale={locale} size={compact ? 'sm' : 'default'} />
        </div>
      </CardContent>
    </Card>
  );
}
