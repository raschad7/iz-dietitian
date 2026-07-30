import { addDays, isoToParts } from '@/features/booking/date';
import { formatLongDate, formatMinute } from '@/features/booking/format';
import { wallClockIn, type WallClock } from '@/features/booking/completed';
import { DISPLAY_TIME_ZONE } from '@/lib/format';

import { getWhatsappConfig } from './config';
import { createHttpGateway, type WhatsappGateway } from './gateway';
import { listAppointmentsForReminders, listReminderReadyClinics } from './queries';
import { reminderDedupeKey, sendWhatsappTemplate } from './send';
import { PATIENT_MESSAGE_LOCALE } from './templates';
import { type ReminderCandidate, type ReminderRunSummary } from './types';

/**
 * Appointment reminders — the automation this whole feature exists for.
 *
 * **Wall-clock arithmetic, not instants.** An appointment is a clinic-local date
 * plus minutes from midnight (see the `appointments` table), so "is this due?" is
 * answered by comparing two wall clocks in `Asia/Hebron` — never by converting to
 * a UTC instant. That is what makes the answer stable across a DST change: the
 * 09:00 appointment stays 09:00, and the reminder still goes out 24 hours before
 * the 09:00 the patient will actually read on their own clock.
 *
 * **Idempotent by construction.** The run is expected to fire repeatedly (a cron
 * every few minutes) over a window that overlaps the previous run's, because a
 * missed tick must not mean a missed reminder. Nothing here tracks "already sent"
 * — `sendWhatsappMessage` claims a row against a unique
 * `reminder:<appointmentId>:<date>` key first, so a second attempt never reaches
 * the network. That means this function can be called by hand, twice, mid-run,
 * without consequence.
 */

/**
 * Sends are sequential and spaced out on purpose.
 *
 * The gateway drives an unofficial WhatsApp client, and bursts are the single
 * most reliable way to get a number restricted (its README is explicit about
 * this). A clinic's real volume is a handful of reminders per hour, so pacing
 * costs nothing and removes the failure mode entirely.
 */
const SEND_SPACING_MS = 1_200;

/**
 * One day before the appointment — the clinic's rule, and the only lead time in
 * use.
 *
 * It is the default of `whatsapp_settings.reminder_lead_minutes` and nothing
 * writes that column, so every clinic reminds a day ahead: a 09:00 appointment on
 * Tuesday is reminded at 09:00 on Monday, in clinic-local wall-clock terms. This
 * constant is what that default means; the run still reads the column, so
 * changing one row changes that clinic without a deploy.
 */
export const REMINDER_LEAD_MINUTES = 24 * 60;

/**
 * Upper bound on one run. A clinic with more due reminders than this has either
 * just connected WhatsApp with a full calendar behind it, or something is wrong —
 * either way, draining it slowly across ticks beats emitting hundreds of messages
 * from a number WhatsApp is already watching. The remainder is not lost: the next
 * tick picks it up, and the log line says how many were left.
 */
const MAX_MESSAGES_PER_RUN = 60;

/**
 * Minutes between two wall clocks. Positive when `later` is in the future.
 *
 * Pure day arithmetic — the dates are `YYYY-MM-DD`, so this crosses months,
 * years and leap days by going through `Date.UTC`, and never touches a time zone.
 */
export function wallClockMinutesBetween(now: WallClock, later: { date: string; minute: number }): number | null {
  const from = isoToParts(now.date);
  const to = isoToParts(later.date);

  if (!from || !to) return null;

  const fromDay = Date.UTC(from.year, from.month - 1, from.day);
  const toDay = Date.UTC(to.year, to.month - 1, to.day);
  const wholeDays = Math.round((toDay - fromDay) / 86_400_000);

  return wholeDays * 24 * 60 + (later.minute - now.minute);
}

/**
 * Whether an appointment's reminder is due now.
 *
 * True inside the window `[0, leadMinutes]` before the start: due once it is
 * within the lead time, and **not** once it has started. The lower bound matters
 * more than it looks — without it, connecting WhatsApp on a Monday would fire
 * reminders for every appointment already in the past that week.
 */
export function isReminderDue(
  appointment: { date: string; startMinute: number },
  now: WallClock,
  leadMinutes: number,
): boolean {
  const minutes = wallClockMinutesBetween(now, { date: appointment.date, minute: appointment.startMinute });

  if (minutes === null) return false;

  return minutes >= 0 && minutes <= leadMinutes;
}

/**
 * The date range to fetch for a given lead time.
 *
 * Reading a range and filtering in memory (rather than expressing the whole
 * wall-clock comparison in SQL) keeps the due-ness rule in one tested pure
 * function. The range is small: a day's lead time means three days of rows.
 */
export function reminderDateWindow(now: WallClock, leadMinutes: number): { fromDate: string; toDate: string } {
  const daysAhead = Math.ceil((now.minute + leadMinutes) / (24 * 60));

  return { fromDate: now.date, toDate: addDays(now.date, daysAhead) };
}

/** Sorted, capped, and only the ones actually due. */
export function selectDueReminders(
  candidates: readonly ReminderCandidate[],
  now: WallClock,
  leadMinutes: number,
  limit = MAX_MESSAGES_PER_RUN,
): ReminderCandidate[] {
  return candidates
    .filter((candidate) => isReminderDue(candidate, now, leadMinutes))
    // Soonest first, so a capped run reminds the people whose appointment is
    // closest rather than an arbitrary subset.
    .sort((a, b) => (a.date === b.date ? a.startMinute - b.startMinute : a.date < b.date ? -1 : 1))
    .slice(0, limit);
}

export type ReminderRunDeps = {
  gateway?: WhatsappGateway;
  /** The instant the run is judged against. Injected by the tests. */
  now?: Date;
  /** Pacing between sends. Zero in tests; see {@link SEND_SPACING_MS}. */
  spacingMs?: number;
  limit?: number;
};

/**
 * Sends every reminder that is due, for every clinic that has WhatsApp connected
 * and reminders switched on.
 *
 * Never throws: it is called from an HTTP route and from a CLI script, and a
 * single clinic's broken session must not stop the others. Failures land in the
 * summary and in each clinic's `last_error`.
 */
export async function sendDueAppointmentReminders(deps: ReminderRunDeps = {}): Promise<ReminderRunSummary> {
  const summary: ReminderRunSummary = { clinics: 0, sent: 0, skipped: 0, failed: 0, appointmentIds: [] };

  const config = getWhatsappConfig();
  if (!config) return summary;

  const gateway = deps.gateway ?? createHttpGateway(config);
  const instant = deps.now ?? new Date();
  const spacing = deps.spacingMs ?? SEND_SPACING_MS;
  const limit = deps.limit ?? MAX_MESSAGES_PER_RUN;

  const clinics = await listReminderReadyClinics();

  for (const { settings, clinicName } of clinics) {
    summary.clinics += 1;

    // Every clinic is judged against its own read of the clock, but they all
    // share one time zone — the clinic zone, not the server's.
    const now = wallClockIn(DISPLAY_TIME_ZONE, instant);
    const { fromDate, toDate } = reminderDateWindow(now, settings.reminderLeadMinutes);

    let due: ReminderCandidate[];

    try {
      const candidates = await listAppointmentsForReminders(settings.clinicId, fromDate, toDate);
      due = selectDueReminders(candidates, now, settings.reminderLeadMinutes, limit);
    } catch (error) {
      summary.failed += 1;
      console.error('[whatsapp] reminder lookup failed', { clinicId: settings.clinicId, error });
      continue;
    }

    for (const [index, candidate] of due.entries()) {
      if (index > 0 && spacing > 0) await sleep(spacing);

      const result = await sendWhatsappTemplate(
        {
          kind: 'appointmentReminder',
          // Arabic for every patient, whatever their record's portal locale says.
          locale: PATIENT_MESSAGE_LOCALE,
          variables: {
            clientName: candidate.clientName,
            clinicName,
            date: formatLongDate(PATIENT_MESSAGE_LOCALE, candidate.date),
            time: formatMinute(PATIENT_MESSAGE_LOCALE, candidate.date, candidate.startMinute),
          },
        },
        {
          clinicId: settings.clinicId,
          clientId: candidate.clientId,
          appointmentId: candidate.appointmentId,
          kind: 'appointment_reminder',
          phone: candidate.phone,
          dedupeKey: reminderDedupeKey(candidate.appointmentId, candidate.date),
        },
        { gateway, settings },
      );

      if (result.status === 'sent') {
        summary.sent += 1;
        summary.appointmentIds.push(candidate.appointmentId);
      } else if (result.status === 'skipped') {
        summary.skipped += 1;
      } else {
        summary.failed += 1;
      }
    }
  }

  return summary;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export { MAX_MESSAGES_PER_RUN, SEND_SPACING_MS };
