import type { PlannableClient } from './queries';

export type PlannerClientSuggestion = {
  client: PlannableClient;
  reason: 'nextAppointment' | 'lastAppointment' | 'activeClient';
};

function appointmentKey(appointment: { date: string; startMinute: number }): string {
  return `${appointment.date}:${String(appointment.startMinute).padStart(4, '0')}`;
}

/**
 * The useful first clients for a planning session.
 *
 * Upcoming visits win because those plans have a deadline. Recent visits come
 * next because their measurements and decisions are freshest. The active list
 * fills any remaining space, so a clinic with clients never gets a blank door.
 */
export function plannerClientSuggestions(
  clients: readonly PlannableClient[],
  limit = 6,
): PlannerClientSuggestion[] {
  const selected = new Set<string>();
  const result: PlannerClientSuggestion[] = [];

  function take(client: PlannableClient, reason: PlannerClientSuggestion['reason']): void {
    if (result.length >= limit || selected.has(client.id)) return;
    selected.add(client.id);
    result.push({ client, reason });
  }

  [...clients]
    .filter((client) => client.nextAppointment !== null)
    .sort((a, b) =>
      appointmentKey(a.nextAppointment!).localeCompare(appointmentKey(b.nextAppointment!)),
    )
    .forEach((client) => take(client, 'nextAppointment'));

  [...clients]
    .filter((client) => client.lastAppointment !== null)
    .sort((a, b) =>
      appointmentKey(b.lastAppointment!).localeCompare(appointmentKey(a.lastAppointment!)),
    )
    .forEach((client) => take(client, 'lastAppointment'));

  clients.forEach((client) => take(client, 'activeClient'));

  return result;
}
