'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

import { Segmented } from '@/components/ui/segmented';

/**
 * The appointments screen's one control: upcoming, or past.
 *
 * **Local state, not `?view=`.** The plan's day strip keeps its choice in the
 * URL because the server renders one day out of seven and the other six are a
 * payload worth not sending. This is the opposite case — `loadAppointments`
 * already reads every appointment in a single query and splits them by the
 * clock, so both halves exist before the page renders and a round-trip would be
 * spent re-fetching what is already on screen.
 *
 * **The two panels arrive as slots, already rendered.** `upcoming` and `past`
 * are React nodes built by the server component above; this file only decides
 * which is mounted. That keeps the cards, the dates and the practitioner names
 * out of the client bundle — the dish-heavy plan board makes the same trade —
 * and it means `AppointmentCard` stays a server component with the date
 * formatters it needs.
 *
 * Only the chosen panel is mounted, rather than both with one `hidden`. A
 * hidden panel is still in the DOM for find-in-page to match and for a screen
 * reader to walk past, and there is nothing here that has to survive the
 * switch — no scroll position, no form, no open disclosure.
 */
export function AppointmentTabs({
  label,
  upcomingLabel,
  pastLabel,
  upcoming,
  past,
}: {
  /** Names the switch for a screen reader — the section it controls. */
  label: string;
  upcomingLabel: string;
  pastLabel: string;
  upcoming: ReactNode;
  past: ReactNode;
}) {
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming');

  return (
    <div className="space-y-6">
      <Segmented
        label={label}
        shape="pill"
        role="tablist"
        value={view}
        onChange={setView}
        /*
          A white half on the grey well — the raised thumb `shape="pill"` is
          built around, stated here rather than left to the default because the
          default is the solid olive every other segmented control wears.

          This switch sits directly under the page's one button and directly
          above the next appointment. Every tinted version of it — the solid
          olive, then an green-100 fill with a 3px olive rule, then that fill
          alone — was a brand-coloured block competing with the two things
          around it for the same 200px, and the rule at one point read as an
          underlined *link*: the one decoration on the page that looked
          pressable and was not.

          Elevation instead of hue settles it. n-900 on white is 16.64:1, so the
          selected label is the strongest text on the screen while the control
          itself is the quietest thing on it.
        */
        activeClassName="bg-card text-foreground"
        options={[
          { value: 'upcoming', label: upcomingLabel },
          { value: 'past', label: pastLabel },
        ]}
      />

      {/*
        `aria-label` rather than `aria-labelledby`: `Segmented` owns its own
        buttons and emits no ids to point at, and a panel named by the tab it
        belongs to is the thing a screen reader actually needs announced.
      */}
      <div role="tabpanel" aria-label={view === 'upcoming' ? upcomingLabel : pastLabel}>
        {view === 'upcoming' ? upcoming : past}
      </div>
    </div>
  );
}
