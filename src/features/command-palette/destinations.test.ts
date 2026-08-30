import { describe, expect, test } from 'bun:test';

import { type NavSection } from '@/components/layout/sidebar';

import { paletteDestinations } from './destinations';

describe('paletteDestinations', () => {
  test('lists every screen in the staff rail, in the rail’s own order', () => {
    expect(paletteDestinations().map((destination) => destination.href)).toEqual([
      '/app',
      '/app/calendar',
      '/app/clients',
      '/app/clients/bills',
      '/app/weekly-plans',
      '/app/dishes',
    ]);
  });

  /*
    The calendar is one destination, not three. Its day/week/month rows left the
    rail — the page's own toolbar switches views — so the palette offers the
    screen once, under its own name, with nothing to qualify it.
  */
  test('offers the calendar once, as a screen rather than three views', () => {
    const calendar = paletteDestinations().filter((destination) =>
      destination.href.startsWith('/app/calendar'),
    );

    expect(calendar.map((entry) => entry.labelKey)).toEqual(['calendar']);
    expect(calendar[0]?.parentLabelKey).toBeUndefined();
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
