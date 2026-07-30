import { isWhatsappEnabled } from '@/features/whatsapp/config';
import { sendDueAppointmentReminders } from '@/features/whatsapp/reminders';
import { timingSafeEquals } from '@/features/whatsapp/signature';

/**
 * The appointment-reminder tick.
 *
 * Something outside the app has to decide when "now" is — a cron entry, a systemd
 * timer, a platform scheduler — so like the webhook, this is one of the two HTTP
 * endpoints that exist because a server action cannot be called from outside a
 * browser session. `scripts/whatsapp-reminders.ts` does the same job without HTTP
 * for anyone who would rather run it from the shell.
 *
 * **Call it as often as you like.** The run is idempotent by construction (see
 * `src/features/whatsapp/reminders.ts`): each reminder is claimed against a unique
 * key before it is sent, so overlapping ticks, retries and a manual run in the
 * middle of a scheduled one all converge on exactly one message per appointment.
 * Every five minutes is a sensible schedule — frequent enough that a missed tick
 * is invisible, rare enough to be free.
 *
 * Auth is a shared secret in an `Authorization: Bearer` header, compared in
 * constant time. Without `WHATSAPP_CRON_SECRET` the route answers 404: an
 * unauthenticated endpoint that makes a clinic send WhatsApp messages is not
 * something to leave open by default.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Runs the reminders, or explains why it will not.
 *
 * Answers 200 with the summary even when nothing was sent — "zero due" is a
 * successful tick, and a scheduler that treats it as a failure would alert every
 * quiet hour.
 */
async function run(request: Request): Promise<Response> {
  const secret = process.env.WHATSAPP_CRON_SECRET;

  if (!secret) return new Response('Not found', { status: 404 });

  const header = request.headers.get('authorization');
  const provided = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;

  if (!timingSafeEquals(provided, secret)) {
    console.warn('[whatsapp] rejected a reminder run with an invalid bearer token');
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isWhatsappEnabled()) {
    return Response.json({ ok: false, reason: 'disabled' }, { status: 503 });
  }

  try {
    const summary = await sendDueAppointmentReminders();

    // One line per run, so the scheduler's own log is enough to see the feature
    // working without opening the database.
    console.info('[whatsapp] reminder run', {
      clinics: summary.clinics,
      sent: summary.sent,
      skipped: summary.skipped,
      failed: summary.failed,
    });

    return Response.json({ ok: true, ...summary });
  } catch (error) {
    // `sendDueAppointmentReminders` swallows per-clinic failures itself, so
    // reaching here means something structural — the database, or the config.
    console.error('[whatsapp] reminder run failed', error);

    return Response.json({ ok: false, reason: 'run_failed' }, { status: 500 });
  }
}

/** POST is the honest verb: this changes things. */
export function POST(request: Request): Promise<Response> {
  return run(request);
}

/**
 * GET does the same, because several hosted schedulers can only issue one. It is
 * behind the same bearer secret, and browsers do not send that header by accident.
 */
export function GET(request: Request): Promise<Response> {
  return run(request);
}
