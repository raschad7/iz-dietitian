// TEMPORARY verification harness — delete after measuring the calendar's fill.
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
export default async function CalCheckPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return (
    <div className="q-app-shell flex flex-col">
      <div data-slot="sidebar-inset" className="flex min-h-0 w-full flex-1 flex-col">
        <main data-slot="shell-scroll" className="min-w-0 p-3 md:p-5">
          <div className="q-route-stage h-full min-h-0 min-w-0">
            <div className="flex h-full min-h-0 flex-col" data-probe="page">
              <div className="min-h-0 flex-1" data-probe="calendar-slot">
                <Calendar
                  locale={locale as 'en' | 'ar'}
                  view="week"
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
