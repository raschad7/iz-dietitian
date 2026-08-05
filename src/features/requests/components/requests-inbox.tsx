import { getTranslations } from 'next-intl/server';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { type Locale } from '@/i18n/routing';

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
export async function RequestsInbox({ data, locale, now }: { data: RequestsData; locale: Locale; now: Date }) {
  const t = await getTranslations('requests');

  const nothingPending = data.appointments.length === 0 && data.clientRequests.length === 0;

  return (
    <div className="space-y-6">
      {nothingPending ? (
        <EmptyState icon="check" title={t('empty.title')} description={t('empty.description')} />
      ) : null}

      {data.appointments.length > 0 ? (
        <section className="space-y-2" aria-labelledby="requests-appointments">
          <h2 id="requests-appointments" className="text-heading-sm font-semibold">
            {t('sections.appointments', { count: data.appointments.length })}
          </h2>

          {/* `p-0` because the rows draw themselves edge to edge — the card is
              the frame around the list, not a box with a list inside it. */}
          <Card className="overflow-hidden p-0">
            <ul className="flex flex-col">
              {data.appointments.map((request) => (
                <li key={request.id}>
                  <AppointmentRequestCard
                    request={request}
                    locale={locale}
                    hours={data.hours}
                    today={data.today}
                    now={now}
                  />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {data.clientRequests.length > 0 ? (
        <section className="space-y-2" aria-labelledby="requests-records">
          <h2 id="requests-records" className="text-heading-sm font-semibold">
            {t('sections.records', { count: data.clientRequests.length })}
          </h2>

          <Card className="overflow-hidden p-0">
            <ul className="flex flex-col">
              {data.clientRequests.map((request) => (
                <li key={request.id}>
                  <ClientRequestCard request={request} locale={locale} now={now} />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {data.answered.length > 0 ? (
        <section className="space-y-2" aria-labelledby="requests-answered">
          <h2 id="requests-answered" className="text-heading-sm font-semibold">
            {t('sections.answered')}
          </h2>

          <AnsweredList requests={data.answered} locale={locale} now={now} />
        </section>
      ) : null}
    </div>
  );
}
