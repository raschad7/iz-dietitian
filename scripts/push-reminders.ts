/**
 * Sends every push notification that has fallen due, then exits.
 *
 * The same work as `POST /api/portal/push-reminders`, without HTTP — for a
 * machine where cron can reach the code but not the web server, and for running
 * the automation by hand while setting it up:
 *
 *   bun run push:reminders
 *
 * Safe to run at any time, including while a scheduled run is in flight: each
 * notification is claimed against a unique key before it is sent, so the second
 * attempt sends nothing. See `src/features/portal/push/reminders.ts`.
 *
 * Exits non-zero only when the run itself broke. A run that sent nothing
 * because nothing was due is a success, and a cron entry that emailed the
 * operator every quiet hour would be turned off within a week.
 */
import { isWebPushConfigured } from '@/features/portal/push/config';
import { sendDuePushNotifications } from '@/features/portal/push/reminders';

async function main(): Promise<void> {
  if (!isWebPushConfigured()) {
    console.error(
      'NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not both set. Nothing to do. See .env.example.',
    );
    process.exit(1);
  }

  const summary = await sendDuePushNotifications();

  console.info(
    `[push] candidates=${summary.candidates} sent=${summary.sent} skipped=${summary.skipped} failed=${summary.failed} removed=${summary.removed}`,
  );
}

await main();

// postgres.js keeps its pool open, which would hold the process forever.
process.exit(0);
