import { and, between, eq, exists, isNull, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  appointments,
  clientPlanAdherence,
  clientSettings,
  clients,
  defaultClientSettings,
  pushSubscriptions,
  weeklyPlans,
} from '@/db/schema';

import { type PushKind, type PushTarget } from './types';

/**
 * Reads for the push feature.
 *
 * Deliberately free of Next.js and of React's `cache`, like
 * `whatsapp/queries.ts` and unlike `portal/queries.ts`: every caller here is
 * either a cron tick or an `after()` continuation, neither of which has a
 * request to scope a cache to.
 *
 * **Consent is enforced in SQL, not after the read.** Every candidate query
 * below joins `client_settings` and tests the flag for the kind being sent, so
 * a client who switched a notification off is not a row this code has to
 * remember to skip — they are not a row at all. The `left join` plus
 * `coalesce(..., true)` is what makes that correct for the majority of clients,
 * who have no settings row: `client_settings` is created lazily on first save
 * (see the table's own note), and its absence means the documented defaults, not
 * "no consent".
 */

/**
 * The `client_settings` column that gates each kind of push.
 *
 * One mapping, so "may we send this?" is a lookup rather than a judgement made
 * again at each call site. It mirrors `NOTIFICATION_COLUMNS` in
 * `portal/mutations.ts`, which maps the *UI's* names onto the same four columns
 * — the two are separate because they are keyed by different things (a switch's
 * name, a delivery's kind) and neither should have to know the other's spelling.
 */
export const PUSH_CONSENT_COLUMNS = {
  appointment_reminder: clientSettings.notifyAppointmentReminder,
  check_in_reminder: clientSettings.notifyCheckInReminder,
  plan_update: clientSettings.notifyPlanUpdate,
  clinic_message: clientSettings.notifyClinicMessage,
} as const satisfies Record<PushKind, unknown>;

/** The defaults those same four columns carry, for a client with no row yet. */
const CONSENT_DEFAULTS = {
  appointment_reminder: defaultClientSettings.notifyAppointmentReminder,
  check_in_reminder: defaultClientSettings.notifyCheckInReminder,
  plan_update: defaultClientSettings.notifyPlanUpdate,
  clinic_message: defaultClientSettings.notifyClinicMessage,
} as const satisfies Record<PushKind, boolean>;

/**
 * Whether this client has agreed to be told about this kind of thing.
 *
 * The same four flags the notifications settings screen writes. They are
 * consent for the *message*, not for a channel — see the note on
 * `client_settings`: "A false here means the message is not sent, on any
 * channel." So this gates push exactly as it gates WhatsApp, and a client who
 * turned appointment reminders off is not reminded on either.
 *
 * No row means the defaults, which are all four on.
 */
export async function hasPushConsent(clientId: string, kind: PushKind): Promise<boolean> {
  const [row] = await db
    .select({ allowed: PUSH_CONSENT_COLUMNS[kind] })
    .from(clientSettings)
    .where(eq(clientSettings.clientId, clientId))
    .limit(1);

  return row?.allowed ?? CONSENT_DEFAULTS[kind];
}

/**
 * Every device this client has switched notifications on for.
 *
 * The one read the send path makes. Returns the three fields `web-push` needs
 * plus the locale the message is rendered in; the row's diagnostics columns are
 * never selected, so nothing downstream can accidentally depend on them.
 */
export async function listPushTargets(clientId: string): Promise<PushTarget[]> {
  const rows = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      locale: pushSubscriptions.locale,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.clientId, clientId));

  // `locale` is plain `text` guarded by a check constraint, so the union is
  // reasserted on the way out rather than trusted from the driver's `string` —
  // the same convention `listPortalRequests` follows for `kind` and `status`.
  return rows.map((row) => ({ ...row, locale: row.locale === 'en' ? 'en' : 'ar' }));
}

/**
 * How many devices a client has subscribed, without reading the keys.
 *
 * The portal's own settings screen uses it to say "notifications are on for
 * this device, and N others" — and to stay honest when the browser says it holds
 * a subscription that the server has since deleted as expired.
 */
export async function countPushSubscriptions(clientId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.clientId, clientId));

  return row?.value ?? 0;
}

/** One appointment worth reminding somebody about. */
export type PushReminderCandidate = {
  clientId: string;
  appointmentId: string;
  date: string;
  startMinute: number;
};

/**
 * Appointments in a date range belonging to clients who could actually be
 * reminded — they have at least one device subscribed and have not turned
 * appointment reminders off.
 *
 * **Across every clinic, and that is the difference from
 * `listAppointmentsForReminders` in the WhatsApp feature.** That one is scoped
 * to a clinic because a WhatsApp message is sent *from* the clinic's own paired
 * number, so a clinic that has not connected one has nothing to send with. A
 * push is sent by this application, from one VAPID keypair, to a device the
 * client themselves registered — the clinic is not a participant, and scoping
 * to one would mean a client's phone stayed silent because their dietitian had
 * not set up an unrelated integration.
 *
 * The range is small — a day's lead time means three days of rows — and the
 * due-ness rule is applied in memory afterwards by `isReminderDue`, which is
 * shared with the WhatsApp run so that both channels answer "is this due?" the
 * same way. See `reminders.ts`.
 */
export async function listPushReminderCandidates(
  fromDate: string,
  toDate: string,
): Promise<PushReminderCandidate[]> {
  return db
    .select({
      clientId: appointments.clientId,
      appointmentId: appointments.id,
      date: appointments.date,
      startMinute: appointments.startMinute,
    })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .leftJoin(clientSettings, eq(clientSettings.clientId, appointments.clientId))
    .where(
      and(
        between(appointments.date, fromDate, toDate),
        // At least one device. `exists` rather than a join, so a client with a
        // phone and a tablet is one candidate rather than two.
        exists(
          db
            .select({ one: sql`1` })
            .from(pushSubscriptions)
            .where(eq(pushSubscriptions.clientId, appointments.clientId)),
        ),
        consentPredicate('appointment_reminder'),
      ),
    );
}

/**
 * Clients who should be nudged to log today: they are on a published plan that
 * covers today, they have not filed an adherence report for it, they have a
 * device, and they have not turned check-in reminders off.
 *
 * This is the push twin of the in-app `adherenceReminder` item, which appears
 * on exactly the same condition (`todayAdherenceLevel === null`, see
 * `buildNotifications`). The extra clause here is the published plan: the feed
 * can afford to ask someone with no plan to log their day, because it is a line
 * on a screen they opened themselves. A notification cannot — there would be
 * nothing to do when they arrived.
 */
export async function listCheckInReminderCandidates(date: string): Promise<{ clientId: string }[]> {
  return db
    .select({ clientId: clients.id })
    .from(clients)
    .leftJoin(clientSettings, eq(clientSettings.clientId, clients.id))
    .leftJoin(
      clientPlanAdherence,
      and(eq(clientPlanAdherence.clientId, clients.id), eq(clientPlanAdherence.date, date)),
    )
    .where(
      and(
        // Nothing logged for today. The left join plus this is the whole test.
        isNull(clientPlanAdherence.id),
        // A published plan whose week contains today — the same window
        // `getPublishedBoard` opens the plan screen on.
        exists(
          db
            .select({ one: sql`1` })
            .from(weeklyPlans)
            .where(
              and(
                eq(weeklyPlans.clientId, clients.id),
                eq(weeklyPlans.status, 'published'),
                sql`${weeklyPlans.weekStartDate} <= ${date}`,
                sql`${weeklyPlans.weekStartDate} + 6 >= ${date}`,
              ),
            ),
        ),
        exists(
          db
            .select({ one: sql`1` })
            .from(pushSubscriptions)
            .where(eq(pushSubscriptions.clientId, clients.id)),
        ),
        consentPredicate('check_in_reminder'),
      ),
    );
}

/**
 * "This client consents to this kind", as SQL.
 *
 * `coalesce` against the column's own documented default is what makes a
 * missing `client_settings` row mean "yes" rather than "no". Every client who
 * has never opened the settings screen is in that state, so getting this
 * backwards would silence the feature for almost everybody — see
 * `defaultClientSettings`.
 */
function consentPredicate(kind: PushKind) {
  return sql`coalesce(${PUSH_CONSENT_COLUMNS[kind]}, ${CONSENT_DEFAULTS[kind]})`;
}
