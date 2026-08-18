import { getTranslations } from 'next-intl/server';
import { type ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { type RequestsData } from '../types';

import { AnsweredList } from './answered-list';
import { AppointmentRequestCard } from './appointment-request-card';
import { ClientRequestCard } from './client-request-card';

/**
 * The inbox page's body.
 *
 * Two lists, not one. Appointment requests and record corrections are answered
 * by different actions — one writes the calendar, the other is a message a
 * person reads and acts on elsewhere — and merging them would put two different
 * pairs of buttons in one column and make the reader check which they were
 * looking at on every row.
 *
 * Appointments come first: a request has a person waiting on a slot that
 * someone else may take, and a correction does not.
 *
 * Answered history sits below both, and only when there is any.
 */
export async function RequestsInbox({
  data,
  locale,
  now,
  presentation = 'list',
  appointmentsHeading = true,
}: {
  data: RequestsData;
  locale: Locale;
  now: Date;
  /**
   * How the requests are drawn.
   *
   * `list` is the page at `/app/requests`: rows in one framed, ruled column,
   * which is what a screen with nothing else on it should be — a scan down a
   * single edge, no repeated frames.
   *
   * `cards` is the dialog: every request on its own rounded surface, the tile
   * the dashboard already draws. In a box five rows deep with a header above it
   * and a scrim behind, one framed list inside a framed surface is a box in a
   * box, and the rules between rows read as the dialog's own divisions.
   *
   * ⚠ It is the cards' `sm` size, so it also brings the tile's economies: dates
   * shorten, an appointment's aside clamps to one line and a correction's
   * message to two, and a correction's topic badge drops. That is the trade for
   * fitting five requests in a window — the full text is a click away on the
   * page.
   */
  presentation?: 'list' | 'cards';
  /**
   * Whether the appointments list draws its own heading.
   *
   * False in the dialog, where that heading and its count sit up in the header
   * bar beside the close button — see `RequestsDialogTrigger`. The list still
   * names itself to a screen reader; only the visible line moves.
   */
  appointmentsHeading?: boolean;
}) {
  const t = await getTranslations('requests');

  const cards = presentation === 'cards';

  const nothingPending = data.appointments.length === 0 && data.clientRequests.length === 0;

  return (
    <div className="space-y-6">
      {nothingPending ? (
        <EmptyState icon="check" title={t('empty.title')} description={t('empty.description')} />
      ) : null}

      {data.appointments.length > 0 ? (
        <section
          className="space-y-2"
          {...(appointmentsHeading
            ? { 'aria-labelledby': 'requests-appointments' }
            : /* The heading moved into the dialog's own header bar, so the
                 section has no element left to be labelled by — it carries the
                 same words itself instead, and a screen reader announces the
                 list exactly as it did. */
              { 'aria-label': t('sectionLabels.appointments') })}
        >
          {appointmentsHeading ? (
            <SectionHeading
              id="requests-appointments"
              count={cards ? data.appointments.length : undefined}
            >
              {cards
                ? t('sectionLabels.appointments')
                : t('sections.appointments', { count: data.appointments.length })}
            </SectionHeading>
          ) : null}

          <List cards={cards}>
            {data.appointments.map((request) => (
              <li key={request.id} data-window-row>
                <AppointmentRequestCard
                  request={request}
                  locale={locale}
                  hours={data.hours}
                  today={data.today}
                  now={now}
                  size={cards ? 'sm' : 'default'}
                />
              </li>
            ))}
          </List>
        </section>
      ) : null}

      {/* `space-y-3` in the dialog: its lists are separate cards with air
          between them, so a heading sitting 8px above the first one reads as
          attached to that card rather than as the label of the stack. */}
      {data.clientRequests.length > 0 ? (
        <section className={cn(cards ? 'space-y-3' : 'space-y-2')} aria-labelledby="requests-records">
          <SectionHeading
            id="requests-records"
            count={cards ? data.clientRequests.length : undefined}
          >
            {cards
              ? t('sectionLabels.records')
              : t('sections.records', { count: data.clientRequests.length })}
          </SectionHeading>

          <List cards={cards}>
            {data.clientRequests.map((request) => (
              <li key={request.id} data-window-row>
                <ClientRequestCard
                  request={request}
                  locale={locale}
                  now={now}
                  size={cards ? 'sm' : 'default'}
                />
              </li>
            ))}
          </List>
        </section>
      ) : null}

      {data.answered.length > 0 ? (
        <section className="space-y-2" aria-labelledby="requests-answered">
          <SectionHeading id="requests-answered">{t('sections.answered')}</SectionHeading>

          <AnsweredList requests={data.answered} locale={locale} now={now} />
        </section>
      ) : null}
    </div>
  );
}

/**
 * A list's heading: the name and its count together, at the inline end.
 *
 * The count used to be inside the name — "Appointments (5)" — which put the
 * one number on the row wherever that sentence happened to end, in a different
 * place in each section and different again in Arabic. It is its own numeral
 * now, at the far edge of the row, and the name sits directly beside it rather
 * than across the row from it: split to opposite ends, a two-word heading and a
 * single digit read as two separate things that happen to share a line.
 *
 * The pair sits at the inline end — the left edge in Arabic, which is the side
 * this was asked for, and the mirror of it in English. `justify-end`, never a
 * hard `left`: a fixed side would drive the pair into the heading's own first
 * word in one of the two languages.
 *
 * `tabular-nums` so a 9 and a 12 occupy the same column, and a bare numeral
 * rather than a pill — see "A badge is a state" in docs/design-system.md.
 */
function SectionHeading({
  id,
  count,
  children,
}: {
  id: string;
  /** Omitted where the heading's own words already carry it. */
  count?: number;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex items-baseline gap-2', count !== undefined && 'justify-end')}>
      <h2 id={id} className="text-heading-sm font-semibold">
        {children}
      </h2>

      {count === undefined ? null : (
        /* The heading's own size and weight, not a smaller muted one: the two
           are read as a single phrase — "Appointments 5" — and a numeral set
           two steps down beside it read as a footnote to the word rather than
           as the other half of it. Muted still, so the word leads. */
        <span className="text-heading-sm font-semibold tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
    </div>
  );
}

/**
 * The rows themselves — one framed column, or a stack of separate tiles.
 *
 * See `presentation` on `RequestsInbox` for which goes where. `p-0` on the
 * framed one because its rows draw themselves edge to edge: the card is the
 * frame around the list, not a box with a list inside it.
 */
function List({ cards, children }: { cards: boolean; children: ReactNode }) {
  if (cards) {
    return <ul className="flex flex-col gap-2">{children}</ul>;
  }

  return (
    <Card className="overflow-hidden p-0">
      <ul className="flex flex-col">{children}</ul>
    </Card>
  );
}
