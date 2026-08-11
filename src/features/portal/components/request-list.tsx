import { useLocale, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { formatMediumDate, formatMinute } from '@/features/booking/format';
import { type PortalRequest, type RequestKind, type RequestStatus } from '@/features/portal/types';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

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
 *
 * ## Reading the list at a glance
 *
 * These rows used to be identical white boxes distinguished only by a chip in
 * the corner, so finding "the one still waiting" meant reading every card. A
 * row now states its status in one hue across up to three weights — a rule down
 * the inline-start edge, a tinted disc behind the glyph, and a chip carrying the
 * words. One colour per card, so a list of four is four colours rather than
 * twelve.
 *
 * **A note is the exception, and carries no chip.** Its status never changes, so
 * the words channel had nothing to say; the rule and the disc go neutral and the
 * row is left as a title and the client's message. Colour is never the only
 * channel on the rows that *do* vary, which is where that rule earns its keep.
 *
 * The rule is a positioned span rather than a `border-s-*`, because `Card` is
 * already `relative` and `overflow-hidden`: the span gets clipped to the card's
 * own 16px radius, where a border would square the corners off against it. It
 * is the same device `Card`'s own `flagged` marker uses.
 */

/**
 * Status is not a traffic light (design-system.md §06). `attention` is amber
 * because a pending request is genuinely waiting on someone; `incomplete` is
 * neutral grey rather than red because a declined request is information, not a
 * failure — the dietitian answered, and the answer was no.
 */
type RequestTone = 'attention' | 'onTrack' | 'incomplete' | 'muted';

const STATUS_TONES = {
  pending: 'attention',
  approved: 'onTrack',
  declined: 'incomplete',
  withdrawn: 'muted',
} as const satisfies Record<RequestStatus, RequestTone>;

/**
 * The rule and the disc, per tone. `Badge` already owns the chip, and this
 * keeps the three in step by deriving all of them from one key.
 *
 * The two answered-or-inert tones draw a `border` rule rather than their own
 * n-700: at full strength a neutral rule is the *darkest* mark on the card, so
 * a finished request would shout louder than one still waiting. Having no
 * colour is the signal — the hairline only says where the card starts.
 */
const TONE_STYLES = {
  attention: {
    rule: 'bg-status-attention-fg',
    disc: 'bg-status-attention-bg text-status-attention-fg',
  },
  onTrack: {
    rule: 'bg-status-on-track-fg',
    disc: 'bg-status-on-track-bg text-status-on-track-fg',
  },
  incomplete: {
    rule: 'bg-border',
    disc: 'bg-status-incomplete-bg text-status-incomplete-fg',
  },
  muted: {
    rule: 'bg-border',
    // `accent` rather than `muted`: the portal's dark theme resolves `--muted`
    // and `--card` to the same olive-900, so a muted disc on a card is a disc
    // nobody can see. `--accent` steps away from the surface in both themes.
    disc: 'bg-accent text-muted-foreground',
  },
} as const satisfies Record<RequestTone, { rule: string; disc: string }>;

/**
 * The glyph says what was asked; the colour around it says how it went. Two
 * facts, two channels — a row is identifiable by shape before it is read, which
 * is what a list scanned on a phone needs.
 */
const KIND_ICONS = {
  new: 'bookAppointment',
  reschedule: 'refresh',
  cancel: 'close',
} as const satisfies Record<RequestKind, IconName>;

/**
 * A `new` request that names no time is a note, not an ask awaiting a verdict.
 *
 * The dietitian reads it and books — or does not — from their own screen;
 * nothing ever moves it out of `pending`. So it must not wear the amber
 * "waiting for your dietitian" chip, which promises an answer that is not
 * coming. It says "sent", in neutral grey, and that is the honest end of it.
 *
 * Rows filed before the portal stopped asking for a day still carry one, and
 * are still genuinely pending — they keep the amber chip.
 */
function isNote(request: PortalRequest): boolean {
  return request.kind === 'new' && request.preferredDate === null;
}

export function RequestList({ requests }: { requests: readonly PortalRequest[] }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal');

  return (
    <ul className="space-y-3">
      {requests.map((request) => {
        const note = isNote(request) && request.status === 'pending';
        const tone: RequestTone = note ? 'muted' : STATUS_TONES[request.status];
        const styles = TONE_STYLES[tone];
        const hasWhen = request.appointment !== null || request.preferredDate !== null;

        return (
          <li key={request.id}>
            <Card size="sm">
              {/*
                Flush to the inline-start edge and clipped by the card's radius.
                `start-0` rather than `left-0`, so it swaps sides with the page
                — in Arabic the list is read from the right and the rule has to
                be the first thing met, not the last.
              */}
              <span
                aria-hidden
                className={cn('absolute inset-y-0 start-0 w-1', styles.rule)}
              />

              <CardContent className="flex gap-3">
                {/*
                  A disc, and a read-only one: it takes no hover classes,
                  because nothing on this card is clickable and a disc that
                  lights up under the pointer promises otherwise
                  (design-system.md, "Cards").
                */}
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-full',
                    styles.disc,
                  )}
                >
                  <Icon name={note ? 'chat' : KIND_ICONS[request.kind]} className="size-4" />
                </span>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <span className="font-heading text-body-md leading-snug font-semibold">
                      {note ? t('request.kind.note') : t(`request.kind.${request.kind}`)}
                    </span>

                    {/*
                      A note carries no chip.

                      It had one reading "sent", and it failed the badge test in
                      §Colour: a pill marks a state, and a state has to vary.
                      Nothing ever moves a note out of `pending`, so that chip
                      said the same word on every note row a client had ever
                      written — three identical pills down a list of three. The
                      row's own title already says it is a message, and the disc
                      beside it already carries the neutral tone.

                      A real ask still gets one, because there the word does
                      change: it is what the client opens this section to read.
                    */}
                    {note ? null : (
                      <Badge variant={tone}>{t(`request.status.${request.status}`)}</Badge>
                    )}
                  </div>

                  {/*
                    Icon-led lines rather than the ruled block these used to sit
                    in. The rule down the card's edge is now the only vertical
                    mark on it, and a second one 40px inside the first read as
                    the card having two inline-start edges. A clock for the slot
                    that exists and a calendar for the day being asked for also
                    tell the two apart without reading them, which the shared
                    grey rule never did.
                  */}
                  {hasWhen ? (
                    <div className="space-y-1 text-sm text-muted-foreground">
                      {request.appointment ? (
                        <p className="flex items-start gap-1.5">
                          <Icon name="clock" className="mt-0.5 size-3.5" />
                          <span>
                            {t('request.currentSlot', {
                              date: formatMediumDate(locale, request.appointment.date),
                              time: formatMinute(
                                locale,
                                request.appointment.date,
                                request.appointment.startMinute,
                              ),
                            })}
                          </span>
                        </p>
                      ) : null}

                      {/*
                        The day asked for. No time, because the client named
                        none — their dietitian sets the hour when they approve
                        it. Requests filed before that rule still carry one, and
                        still show it.
                      */}
                      {request.preferredDate !== null ? (
                        <p className="flex items-start gap-1.5">
                          <Icon name="calendar" className="mt-0.5 size-3.5" />
                          <span>
                            {request.preferredStartMinute === null
                              ? t('request.preferredDay', {
                                  date: formatMediumDate(locale, request.preferredDate),
                                })
                              : t('request.preferredSlot', {
                                  date: formatMediumDate(locale, request.preferredDate),
                                  time: formatMinute(
                                    locale,
                                    request.preferredDate,
                                    request.preferredStartMinute,
                                  ),
                                })}
                          </span>
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {/*
                    The client's own words, set plainly.

                    They sat in a sunken fill with a hairline round it, on the
                    argument that a box makes them read as quoted rather than as
                    another line the app wrote. On a `note` row that argument
                    collapses: the row is *nothing but* the message, so the box
                    was a container drawn around the only content there —
                    a second card inside the card, which §Shape rules out
                    anyway. Nesting it also put a filled panel inside a panel on
                    every row of a list read on a phone.

                    No label above it either: the card's title already says this
                    is a message, and on the other kinds the sentence explains
                    itself.
                  */}
                  {request.note ? (
                    <p className="text-sm leading-relaxed whitespace-pre-line">{request.note}</p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
