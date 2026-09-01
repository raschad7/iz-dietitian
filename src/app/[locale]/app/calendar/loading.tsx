import { PageLoading } from '@/components/layout/page-loading';

/**
 * The wait for the diary.
 *
 * Its own boundary rather than the generic one under `/app`, because arriving
 * at the diary is a real wait and the route should commit on the click like
 * every other one.
 *
 * No `h-full` override any more: `PageLoading` fills the staff shell's `main`
 * on its own, and the override was a second opinion about the same box.
 *
 * Switching between day, week and month inside the screen does not come through
 * here and shows nothing: every view at an anchor is drawn from appointments
 * the browser is already holding, so the switch happens in the frame of the
 * press. See the note in `calendar.tsx`.
 */
export default function CalendarLoading() {
  return <PageLoading />;
}
