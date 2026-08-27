import { isWebPushConfigured } from '@/features/portal/push/config';
import { sendDuePushNotifications } from '@/features/portal/push/reminders';
import { timingSafeEquals } from '@/features/whatsapp/signature';

/**
 * The push reminder tick.
 *
 * Something outside the app has to decide when "now" is — a cron entry, a
 * systemd timer, a platform scheduler — so like the WhatsApp reminder route
 * this exists because a server action cannot be called from outside a browser
 * session. `scripts/push-reminders.ts` does the same job without HTTP for
 * anyone who would rather run it from the shell.
 *
 * **Its own route and its own secret, deliberately.** It would have been fewer
 * files to add this to `/api/whatsapp/reminders`, and it would have been wrong:
 * that route answers 404 without `WHATSAPP_CRON_SECRET`, so a deployment that
 * uses push and not WhatsApp — the ordinary case — would have had its client
 * notifications gated behind an integration it does not run. The two channels
 * are independent all the way down; see the note in
 * `features/portal/push/reminders.ts`.
 *
 * **Call it as often as you like.** The run is idempotent by construction (see
 * that same file): each notification is claimed against a unique key before it
 * is sent, so overlapping ticks, retries and a manual run in the middle of a
 * scheduled one all converge on exactly one notification per event. Every five
 * minutes is a sensible schedule.
 *
 * Auth is a shared secret in an `Authorization: Bearer` header, compared in
 * constant time with the WhatsApp route's own helper — one implementation of
 * that comparison in the codebase, not two. Without `PUSH_CRON_SECRET` the
 * route answers 404: an unauthenticated endpoint that makes an app notify
 * every client on it is not something to leave open by default.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Runs the tick, or explains why it will not.
 *
 * Answers 200 with the summary even when nothing was sent — "zero due" is a
 * successful tick, and a scheduler that treated it as a failure would alert
 * every quiet hour.
 */
async function run(request: Request): Promise<Response> {
  const secret = process.env.PUSH_CRON_SECRET;

  if (!secret) return new Response('Not found', { status: 404 });

  const header = request.headers.get('authorization');
  const provided = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;

  if (!timingSafeEquals(provided, secret)) {
    console.warn('[push] rejected a reminder run with an invalid bearer token');
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isWebPushConfigured()) {
    return Response.json({ ok: false, reason: 'not_configured' }, { status: 503 });
  }

  try {
    const summary = await sendDuePushNotifications();

    // One line per run, so the scheduler's own log is enough to see the feature
    // working without opening the database.
    console.info('[push] reminder run', {
      candidates: summary.candidates,
      sent: summary.sent,
      skipped: summary.skipped,
      failed: summary.failed,
      removed: summary.removed,
    });

    return Response.json({ ok: true, ...summary });
  } catch (error) {
    // `sendDuePushNotifications` swallows per-client failures itself, so
    // reaching here means something structural — the database, or the config.
    console.error('[push] reminder run failed', error);

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
