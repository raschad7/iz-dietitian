import { MINUTES_PER_DAY } from '@/lib/time-constants';

/**
 * Which greeting the header shows, from the clinic's wall clock.
 *
 * Pure and minute-based so it reads from the same `WallClock` every other
 * time-dependent thing in the portal uses — the greeting and the week strip
 * cannot end up on different days.
 *
 * The boundaries are the ordinary Arabic ones: صباح الخير until noon, مساء
 * الخير after it, with a late-evening variant so someone opening the app at
 * midnight is not wished a good afternoon.
 */
export type GreetingKey = 'morning' | 'afternoon' | 'evening';

const NOON = 12 * 60;
const EVENING = 17 * 60;

export function greetingKey(minute: number): GreetingKey {
  // A clock that has wrapped is a bug upstream, but a greeting is no place to
  // throw — fold it back into the day rather than returning nothing.
  const inDay = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

  if (inDay < NOON) return 'morning';
  if (inDay < EVENING) return 'afternoon';
  return 'evening';
}
