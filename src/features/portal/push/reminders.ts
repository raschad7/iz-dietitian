import { wallClockIn, type WallClock } from '@/features/booking/completed';
import { type IsoDate } from '@/features/booking/date';
import { isReminderDue, REMINDER_LEAD_MINUTES, reminderDateWindow } from '@/features/whatsapp/reminders';
import { DISPLAY_TIME_ZONE } from '@/lib/format';

import { isWebPushConfigured } from './config';
import { notifyAppointmentReminder, notifyCheckInReminder } from './notify';
import { listCheckInReminderCandidates, listPushReminderCandidates } from './queries';
import { type PushRunSummary } from './types';
import { type SendWebPushDeps } from './send';

/**
 * The two notifications nobody triggers by pressing anything: tomorrow's
 * appointment, and a day that has not been logged.
 *
 * Everything else this feature sends hangs off an action — a plan published, a
 * request answered — and rides out on that request's `after()`. These two are
 * facts about the passage of time, so something outside the app has to decide
 * when "now" is. That is a cron entry hitting `/api/portal/push-reminders`, or
 * `bun run push:reminders` from a shell.
 *
 * **Idempotent by construction, so call it as often as you like.** Nothing here
 * tracks what it has already sent: `sendWebPush` claims a row against a unique
 * `(client_id, dedupe_key)` before it reaches the network, so a second tick, an
 * overlapping run and a manual run in the middle of a scheduled one all
 * converge on exactly one notification per event. Every five minutes is a
 * sensible schedule — frequent enough that a missed tick is invisible, rare
 * enough to be free.
 *
 * ## Why this is not part of the WhatsApp reminder run
 *
 * They answer the same question — "whose appointment is close?" — and they
 * deliberately share the pure functions that answer it, so the two channels can
 * never disagree about when a reminder is due. What they do not share is who
 * they can reach.
 *
 * `sendDueAppointmentReminders` iterates clinics that have **paired a WhatsApp
 * number and switched reminders on**, because a message from a clinic that has
 * not done that has nothing to be sent from. A push has no such dependency: it
 * goes from this application to a device the client themselves registered.
 * Folding push into that loop would mean a client's phone stayed silent because
 * their dietitian had not finished setting up an unrelated integration — which
 * is exactly the coupling this file exists to avoid.
 */

/**
 * Upper bound on one run.
 *
 * Higher than the WhatsApp run's 60, and for a reason that is not "push is
 * cheaper" — though it is. That cap exists because bursts get an unofficial
 * WhatsApp client restricted; there is no equivalent hazard here, and the
 * limit is only a guard against a runaway query. The remainder is never lost:
 * the next tick picks it up, because nothing was claimed for it.
 */
const MAX_PER_RUN = 200;

/**
 * When the day's un-logged nudge goes out, in clinic-local minutes from
 * midnight.
 *
 * 19:00, and closed at 22:00. Early enough that there is still an evening in
 * which to log the day, late enough that most of it has happened — a nudge at
 * noon is asking about a day that is not over. The upper bound is what keeps a
 * tick that runs at 02:00, against a clock that has rolled past midnight, from
 * sending yesterday's reminder into the small hours.
 *
 * ⚠ **The clinic's clock, not the server's** — `DISPLAY_TIME_ZONE`. The same
 * rule the whole booking feature runs on: this is a wall-clock decision about
 * the client's own evening, and a server in another zone must not make it an
 * hour early.
 */
const CHECK_IN_WINDOW = { fromMinute: 19 * 60, toMinute: 22 * 60 };

export type PushReminderRunDeps = SendWebPushDeps & {
  /** The instant the run is judged against. Injected by the tests. */
  now?: Date;
  limit?: number;
};

/** Whether the check-in nudge may go out at this wall-clock moment. */
export function isCheckInWindow(now: WallClock): boolean {
  return now.minute >= CHECK_IN_WINDOW.fromMinute && now.minute < CHECK_IN_WINDOW.toMinute;
}

/**
 * Sends everything that has fallen due, for every client who has a device and
 * has consented.
 *
 * Never throws: it is called from an HTTP route and from a CLI script, and one
 * client's broken subscription must not stop the rest. Failures land in the
 * summary and in each subscription's `last_error`.
 */
export async function sendDuePushNotifications(deps: PushReminderRunDeps = {}): Promise<PushRunSummary> {
  const summary: PushRunSummary = { candidates: 0, sent: 0, skipped: 0, failed: 0, removed: 0 };

  // Nothing to send with. Not an error: a deployment without a keypair has
  // simply not turned this on. See `config.ts`.
  if (!isWebPushConfigured()) return summary;

  const now = wallClockIn(DISPLAY_TIME_ZONE, deps.now ?? new Date());
  const limit = deps.limit ?? MAX_PER_RUN;
  const send: SendWebPushDeps = { transport: deps.transport };

  await runAppointmentReminders(now, limit, send, summary);
  await runCheckInReminders(now, limit, send, summary);

  return summary;
}

async function runAppointmentReminders(
  now: WallClock,
  limit: number,
  deps: SendWebPushDeps,
  summary: PushRunSummary,
): Promise<void> {
  const { fromDate, toDate } = reminderDateWindow(now, REMINDER_LEAD_MINUTES);

  let due: Awaited<ReturnType<typeof listPushReminderCandidates>>;

  try {
    const candidates = await listPushReminderCandidates(fromDate, toDate);

    due = candidates
      // The shared rule, imported rather than restated — see the module note.
      // Due once inside the lead window and **not** once the slot has started.
      .filter((candidate) => isReminderDue(candidate, now, REMINDER_LEAD_MINUTES))
      // Soonest first, so a capped run reminds the people whose appointment is
      // closest rather than an arbitrary subset.
      .sort((a, b) => (a.date === b.date ? a.startMinute - b.startMinute : a.date < b.date ? -1 : 1))
      .slice(0, limit);
  } catch (error) {
    summary.failed += 1;
    console.error('[push] appointment reminder lookup failed', error);
    return;
  }

  for (const candidate of due) {
    summary.candidates += 1;

    /*
      Sequentially, and without the WhatsApp run's pacing delay.

      Sequential because each send is a small database transaction (the claim)
      plus one HTTPS request per device, and a tick that fired two hundred of
      those at once would take the connection pool with it. There is no
      `SEND_SPACING_MS` equivalent because there is nothing to pace *for*: a
      push service is built to be pushed to, unlike the unofficial WhatsApp
      client the other run has to protect.
    */
    const result = await notifyAppointmentReminder(
      candidate.clientId,
      { id: candidate.appointmentId, date: candidate.date as IsoDate, startMinute: candidate.startMinute },
      deps,
    );

    tally(summary, result);
  }
}

async function runCheckInReminders(
  now: WallClock,
  limit: number,
  deps: SendWebPushDeps,
  summary: PushRunSummary,
): Promise<void> {
  if (!isCheckInWindow(now)) return;

  let candidates: Awaited<ReturnType<typeof listCheckInReminderCandidates>>;

  try {
    candidates = (await listCheckInReminderCandidates(now.date)).slice(0, limit);
  } catch (error) {
    summary.failed += 1;
    console.error('[push] check-in reminder lookup failed', error);
    return;
  }

  for (const candidate of candidates) {
    summary.candidates += 1;

    const result = await notifyCheckInReminder(candidate.clientId, now.date as IsoDate, deps);

    tally(summary, result);
  }
}

/**
 * `duplicate` counts as skipped rather than as anything else, and that is the
 * common case rather than an exception: every tick after the first one that
 * sent a given reminder lands here. A run whose summary is all skips is a run
 * that found nothing new, which is what most of them are.
 */
function tally(summary: PushRunSummary, result: Awaited<ReturnType<typeof notifyCheckInReminder>>): void {
  if (result.status === 'skipped') {
    summary.skipped += 1;
    return;
  }

  summary.removed += result.removed;

  if (result.delivered > 0) {
    summary.sent += 1;
  } else {
    summary.failed += 1;
  }
}

export { MAX_PER_RUN, CHECK_IN_WINDOW };
