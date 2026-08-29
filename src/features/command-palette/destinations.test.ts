import { describe, expect, test } from 'bun:test';

import { type NavSection } from '@/components/layout/sidebar';

import { paletteDestinations } from './destinations';

describe('paletteDestinations', () => {
  test('lists every screen in the staff rail, in the rail’s own order', () => {
    expect(paletteDestinations().map((destination) => destination.href)).toEqual([
      '/app',
      '/app/calendar?view=day',
      '/app/calendar?view=week',
      '/app/calendar?view=month',
      '/app/clients',
      '/app/clients/bills',
      '/app/weekly-plans',
      '/app/dishes',
    ]);
  });

  /*
    The distinction this whole module exists for. `flatten` in `sidebar.tsx`
    answers a different question — what the 56px icon strip draws — and there
    التقويم must collapse to one row pointing at the week. A palette that
    borrowed that walk would make two of the three calendar views unaskable.
  */
  test('spells out all three calendar views rather than collapsing them', () => {
    const views = paletteDestinations().filter((destination) =>
      destination.href.startsWith('/app/calendar'),
    );

    expect(views.map((view) => view.labelKey)).toEqual(['day', 'week', 'month']);
    expect(views.every((view) => view.parentLabelKey === 'calendar')).toBe(true);
  });

  test('leaves a top-level destination without a parent to qualify it', () => {
    const dashboard = paletteDestinations().find((destination) => destination.href === '/app');
    expect(dashboard?.parentLabelKey).toBeUndefined();
  });

  test('carries the rail’s own glyph for the screens that have one', () => {
    const byHref = new Map(paletteDestinations().map((d) => [d.href, d.icon]));
    expect(byHref.get('/app')).toBe('dashboard');
    expect(byHref.get('/app/clients')).toBe('clients');
    expect(byHref.get('/app/dishes')).toBe('dishes');
  });

  /*
    A category is transparent: it contributes its children and never itself.
    Without this, the calendar would appear twice — once as التقويم and again as
    each of the three views under it.
  */
  test('drops a category in favour of the destinations inside it', () => {
    const nav = [
      {
        id: 'overview',
        children: [
          { href: '/app', labelKey: 'dashboard' },
          {
            id: 'calendar',
            labelKey: 'calendar',
            collapsedHref: '/app/calendar?view=week',
            children: [{ href: '/app/calendar?view=day', labelKey: 'day' }],
          },
        ],
      },
    ] as const satisfies readonly NavSection[];

    expect(paletteDestinations(nav).map((d) => d.href)).toEqual([
      '/app',
      '/app/calendar?view=day',
    ]);
  });
});
