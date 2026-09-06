// TEMPORARY verification harness — delete after measuring the calendar's fill.
import { notFound } from 'next/navigation';

import { Calendar } from '@/features/booking/components/calendar';

const HOURS = { workingDays: [0, 1, 2, 3, 4, 5, 6], openMinute: 8 * 60, closeMinute: 18 * 60 };

const CLIENTS = [
  { id: 'c1', name: 'Sara Halabi', seq: 0 },
  { id: 'c2', name: 'Omar Nasser', seq: 1 },
];

const APPOINTMENTS = [
  {
    id: 'a1',
    practitionerId: 'p1',
    clientId: 'c1',
    date: '2026-08-12',
    startMinute: 9 * 60,
    durationMinutes: 60,
    reason: null,
    clientName: 'Sara Halabi',
    clientSeq: 0,
  },
];

/**
 * The staff shell's frame, reproduced exactly: `.q-app-shell` is `100svh` with
 * `overflow: hidden`, the inset is `min-block-size: 0`, and `main` is the one
 * scroller. Measuring the calendar outside this would measure nothing.
 */
/**
 * Midnight on the fixture day, so nothing reads as completed.
 *
 * A probe compares screenshots, and the real clock would grey a different
 * number of blocks every hour it ran. Fixed, this page draws the same picture
 * today as it did the day it was written — which is the only thing it is for.
 */
const PROBE_CLOCK = { date: '2026-08-12', minute: 0 };

export default async function CalCheckPage({ params }: { params: Promise<{ locale: string }> }) {
  /*
    Dev-only, like every other route under `/dev`. This one was the exception
    and had no reason to be: it ships a fixture calendar and no guard, so in
    production it was a real screen anyone could open. It carries no clinic
    data, which is why nothing caught it — but the rule is the route, not the
    payload, and the next harness copied from this one would not be so empty.
  */
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const { locale } = await params;

  return (
    <div className="q-app-shell flex flex-col">
      <div data-slot="sidebar-inset" className="flex min-h-0 w-full flex-1 flex-col">
        <main data-slot="shell-scroll" className="min-w-0 p-3 md:p-5">
          <div className="h-full min-h-0 min-w-0">
            <div className="flex h-full min-h-0 flex-col" data-probe="page">
              <div className="min-h-0 flex-1" data-probe="calendar-slot">
                <Calendar
                  locale={locale as 'en' | 'ar'}
                  view="week"

                  serverClock={PROBE_CLOCK}
                  anchorDate="2026-08-12"
                  hours={HOURS}
                  appointments={APPOINTMENTS}
                  clients={CLIENTS}
                />
              </div>

              {/* The embedded case — the client record's Visit History tab. */}
              <div className="min-h-0 flex-1" data-probe="embedded-slot">
                <Calendar
                  locale={locale as 'en' | 'ar'}
                  view="week"

                  serverClock={PROBE_CLOCK}
                  anchorDate="2026-08-12"
                  hours={HOURS}
                  appointments={APPOINTMENTS}
                  clients={CLIENTS}
                  fullBleed={false}
                />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
