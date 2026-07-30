/**
 * Sends every appointment reminder that is due, then exits.
 *
 * The same work as `POST /api/whatsapp/reminders`, without HTTP — for a machine
 * where cron can reach the code but not the web server, and for running the
 * automation by hand while setting it up:
 *
 *   bun run wa:reminders
 *
 * Safe to run at any time, including while a scheduled run is in flight: each
 * reminder is claimed against a unique key before it is sent, so the second
 * attempt sends nothing. See `src/features/whatsapp/reminders.ts`.
 *
 * Exits non-zero only when the run itself broke. A run that sent nothing because
 * nothing was due is a success, and a cron entry that emailed the operator every
 * quiet hour would be turned off within a week.
 */
import { isWhatsappEnabled } from '@/features/whatsapp/config';
import { sendDueAppointmentReminders } from '@/features/whatsapp/reminders';

async function main(): Promise<void> {
  if (!isWhatsappEnabled()) {
    console.error('WHATSAPP_ENABLED is not "true". Nothing to do. See .env.example.');
    process.exit(1);
  }

  const summary = await sendDueAppointmentReminders();

  console.info(
    `[whatsapp] clinics=${summary.clinics} sent=${summary.sent} skipped=${summary.skipped} failed=${summary.failed}`,
  );

  if (summary.appointmentIds.length > 0) {
    console.info(`[whatsapp] reminded: ${summary.appointmentIds.join(', ')}`);
  }
}

await main();

// postgres.js keeps its pool open, which would hold the process forever.
process.exit(0);
