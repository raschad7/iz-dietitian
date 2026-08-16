import { getTranslations } from 'next-intl/server';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
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

/**
 * The glyph that rides *inside* the row's actions, not in front of the name —
 * the disc there is the client's avatar now, in both sizes.
 *
 * `chat` rather than `edit` for a correction: what arrived is the client's
 * message about their record, and `edit` is the app's verb for *writing* one —
 * it is the glyph on every edit button, including the one this row sends the
 * reader to. Two meanings on one glyph in one row is one too many.
 */
const KIND_ICONS = {
  data_update: 'chat',
  account_deletion: 'attention',
} as const satisfies Record<StaffClientRequest['kind'], IconName>;

/**
 * Where a request is answered — the tab of the client's record that holds the
 * thing they are asking about.
 *
 * The row's own buttons only *close* the item; the correction itself is made on
 * the record, and until now finding it was the reader's job: open the client,
 * then work out which of four views holds a phone number. A request names its
 * own topic, so the link can land on the view that answers it.
 */
const TOPIC_TABS = {
  basic: 'account',
  contact: 'account',
  health: 'nutrition',
  other: 'account',
} as const satisfies Record<NonNullable<StaffClientRequest['topic']>, string>;

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
      <CardContent className="flex flex-col gap-2">
        <div className={cn('flex items-start', compact ? 'gap-2' : 'gap-3')}>
          {/*
            The client's own mark, in both sizes now. The dashboard tile swapped
            its kind glyph for this disc a release ago and the inbox kept the
            glyph, so the same request wore two different marks depending on
            which screen you met it on — and the inbox's was the weaker of the
            two: a queue is read by who is in it, and every row in that list is
            already the same kind of item, so an amber `edit` disc twenty rows
            deep said nothing the section heading had not.

            Nothing is lost with the glyph. The kind is a badge in the name's
            row, which is where a reader was taking it from anyway, and the
            deletion's clay is that badge's `medical` tone.

            The disc is painted in the client's own hue — see the matching note
            in `AppointmentRequestCard` for what `.patient-tone` and
            `patientToneStyle` are doing.
          */}
          <span className="patient-tone contents" style={patientToneStyle(request.clientSeq)}>
            <Avatar name={request.clientName} color="var(--tone-mark)" size="sm" className="mt-0.5" />
          </span>

          <div className={cn('min-w-0 flex-1', compact ? 'space-y-0.5' : 'space-y-1')}>
            {/*
              Name, kind, topic and age on one line.

              In the inbox the two badges used to take a row of their own under
              the name — a full line of the row's height carrying two words,
              above a message that is the item itself. They ride in the name's
              row now, the way the dashboard tile has always carried the kind,
              so the row opens with everything a reader routes on ("who / what /
              which part of the record / how old") and then goes straight into
              the client's words.

              `items-baseline` keeps the badges sitting on the name's baseline
              as it wraps, and the time stays `shrink-0` at the inline end.
            */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
              <span className="flex min-w-0 flex-wrap items-baseline gap-1.5">
                <Link
                  href={`/app/clients/${request.clientId}`}
                  className="min-w-0 truncate text-body-md font-medium hover:underline"
                  dir="auto"
                >
                  {request.clientName}
                </Link>

                <Badge variant={isDeletion ? 'medical' : 'attention'} size="sm" className="shrink-0">
                  {t(`clientKind.${request.kind}`)}
                </Badge>

                {/* The topic is how staff route the item without reading it, so
                    it sits beside the kind rather than inside the message. The
                    dashboard tile still goes without: one line of the message
                    is right underneath doing the same job in less height. */}
                {!compact && request.topic ? (
                  <Badge variant="outline" size="sm" className="shrink-0">
                    {t(`topic.${request.topic}`)}
                  </Badge>
                ) : null}
              </span>

              <span className="shrink-0 text-label text-muted-foreground">
                {formatTimeAgo(locale, request.createdAt, now)}
              </span>
            </div>

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

            {/*
              In the inbox the controls sit in the message's own column rather
              than in a block of their own under the avatar. That row was an
              indent (`ps-11`) under a gap under the text — three separate ways
              of saying "the buttons are below", on a card whose content is two
              short lines. Here they read as the end of the sentence they answer.

              **The record link is the thing this row was missing.** Mark done
              and Decline both only close the item; the correction itself is
              made on the client's record, and the reader had to go find which
              of four views held it. `TOPIC_TABS` sends them to the view that
              answers this request — a health correction to the nutrition
              record, a phone number to the account. It is `neutral` and last:
              exactly one control in the row wears the brand colour, and it is
              the one that closes the item.

              The tile keeps its own block below — it is a card, not a row, and
              its buttons are its floor.
            */}
            {compact ? null : (
              <div className="pt-1">
                <ClientRequestActions
                  request={request}
                  locale={locale}
                  size="default"
                  trailing={
                    <Link
                      href={{
                        pathname: `/app/clients/${request.clientId}`,
                        query: { tab: request.topic ? TOPIC_TABS[request.topic] : 'account' },
                      }}
                      className={cn(buttonVariants({ variant: 'neutral' }), 'ms-auto')}
                    >
                      <Icon name={KIND_ICONS[request.kind]} />
                      {t('actions.openRecord')}
                    </Link>
                  }
                />
              </div>
            )}
          </div>
        </div>

        {compact ? (
          <div className="space-y-2 ps-9">
            <ClientRequestActions request={request} locale={locale} size="sm" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
