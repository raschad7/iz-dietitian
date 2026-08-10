import { describe, expect, test } from 'bun:test';

import type { PlannableClient } from './queries';
import { plannerClientSuggestions } from './client-suggestions';

function client(
  id: string,
  appointments: Pick<PlannableClient, 'nextAppointment' | 'lastAppointment'>,
): PlannableClient {
  return {
    id,
    fullName: id,
    color: '#223414',
    hasProfile: true,
    latestPlanStatus: null,
    latestWeekStartDate: null,
    ...appointments,
  };
}

describe('plannerClientSuggestions', () => {
  test('puts the nearest upcoming visit first, then the most recent past visit', () => {
    const suggestions = plannerClientSuggestions([
      client('later', {
        nextAppointment: { date: '2026-08-15', startMinute: 600 },
        lastAppointment: null,
      }),
      client('recent', {
        nextAppointment: null,
        lastAppointment: { date: '2026-08-09', startMinute: 900 },
      }),
      client('next', {
        nextAppointment: { date: '2026-08-11', startMinute: 540 },
        lastAppointment: null,
      }),
    ]);

    expect(suggestions.map(({ client: item, reason }) => [item.id, reason])).toEqual([
      ['next', 'nextAppointment'],
      ['later', 'nextAppointment'],
      ['recent', 'lastAppointment'],
    ]);
  });

  test('does not repeat a client and fills from active clients', () => {
    const suggestions = plannerClientSuggestions([
      client('both', {
        nextAppointment: { date: '2026-08-11', startMinute: 540 },
        lastAppointment: { date: '2026-08-01', startMinute: 540 },
      }),
      client('active', { nextAppointment: null, lastAppointment: null }),
    ]);

    expect(suggestions.map(({ client: item, reason }) => [item.id, reason])).toEqual([
      ['both', 'nextAppointment'],
      ['active', 'activeClient'],
    ]);
  });
});
