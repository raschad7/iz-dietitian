import { formatLongDate, formatMinute } from '@/features/booking/format';
import { type IsoDate } from '@/features/booking/date';
import { type Locale } from '@/i18n/routing';

import { type PushKind, type PushPayload } from './types';

/**
 * The text of every push notification, and where each one lands.
 *
 * Not in the next-intl catalogue, for the reason `whatsapp/templates.ts` and
 * `lib/mail/templates.ts` both give: the catalogue resolves inside a request
 * scope, and these are rendered from a cron tick that has none. It also keeps a
 * notification's own conventions — a short title, one sentence, no markup — out
 * of a catalogue full of UI strings.
 *
 * **Unlike WhatsApp, this is written in the client's own language.** A WhatsApp
 * message goes out in Arabic for every patient (`PATIENT_MESSAGE_LOCALE`),
 * because staff have to be able to read back exactly what a patient was told.
 * A push is different on both counts: it is drawn *inside* the app the client
 * chose the language of, and it is not a record the clinic keeps. The locale
 * travels on the subscription row — see `push_subscriptions.locale` — so a
 * household with one account and two devices can honestly get two answers.
 *
 * ## What may go in one, and what may not
 *
 * ⚠ **Nothing clinical, ever.** A push is decrypted by the browser and painted
 * on a lock screen, which is the one surface in this product a stranger holding
 * the phone can read without signing in. So: no weight, no measurements, no
 * diagnosis, no dish names, no note the client wrote to their dietitian. Every
 * template below names an *event* and points at the screen that holds the
 * detail — "your plan for this week is ready", not what is in it.
 *
 * The same rule is why no template interpolates a free-text value. The only
 * variables are an appointment's date and start minute, and they arrive raw —
 * formatting happens here, against the device's locale, so that a message is
 * written in one language throughout rather than carrying a date rendered in
 * whichever one the sender happened to be holding.
 */

/** Where each notification opens, under the locale prefix. */
const DESTINATIONS = {
  appointment_reminder: 'appointments',
  appointment_changed: 'appointments',
  appointment_booked: 'appointments',
  check_in_reminder: '',
  plan_update: '',
  clinic_message: 'notifications',
} as const satisfies Record<PushMessageKind, string>;

/**
 * Which consent flag each message answers to.
 *
 * **The two are not the same list, and that is the point of this map.** A
 * message is a thing to say; a {@link PushKind} is one of the four switches on
 * the client's notifications screen. `appointment_changed` and
 * `appointment_booked` — the clinic moved, cancelled or just made your visit —
 * have no switch of their own, and both are deliberately filed under
 * `clinic_message` ("رسائل العيادة": what the clinic sends you) rather than
 * under `appointment_reminder`.
 *
 * That is a judgement, so here is the reasoning. The reminder switch turns off
 * *nudges before an appointment* — a client who does not want to be prodded the
 * day before. A new booking, a move or a cancellation are not nudges: each is
 * news the client has to act on or plan around, and silently withholding it
 * from someone who only opted out of reminders would be the worse failure.
 * Filing them under "what the clinic sends you" keeps them with the other
 * things a person at the clinic decided to tell them — and keeps this message
 * independent of the reminder that is still coming closer to the visit itself
 * (see `notifyAppointmentBooked` in `push/notify.ts`).
 *
 * Deriving the consent kind from the message — rather than having the caller
 * pass both — is what stops the two from ever disagreeing. A caller that named
 * the wrong one would check the wrong switch and file the delivery under the
 * wrong heading, and nothing would look broken.
 */
const MESSAGE_CONSENT = {
  appointment_reminder: 'appointment_reminder',
  appointment_changed: 'clinic_message',
  appointment_booked: 'clinic_message',
  check_in_reminder: 'check_in_reminder',
  plan_update: 'plan_update',
  clinic_message: 'clinic_message',
} as const satisfies Record<PushMessageKind, PushKind>;

/** The switch a message answers to. See {@link MESSAGE_CONSENT}. */
export function pushConsentKind(message: PushMessage): PushKind {
  return MESSAGE_CONSENT[message.kind];
}

/**
 * The app-relative destination for a kind, with the locale prefix every portal
 * URL carries (`routing.localePrefix: 'always'`).
 *
 * A path and not an absolute URL: the worker resolves it against its own
 * origin, which is the only origin it could be. Building an absolute one here
 * would mean this module needed to know the deployment's public URL, and would
 * put a stale one in every notification the day that changed.
 *
 * `tail` overrides the kind's default destination with another segment under
 * `/portal` — `'profile'`, not `'/ar/portal/profile'`. One caller uses it: a
 * request about the client's own record is answered on their profile screen
 * rather than in the notifications feed, which only lists appointment requests.
 */
export function pushDestination(locale: Locale, kind: PushMessageKind, tail?: string): string {
  const segment = tail ?? DESTINATIONS[kind];
  return segment ? `/${locale}/portal/${segment}` : `/${locale}/portal`;
}

/**
 * Every notification this app can send, as a discriminated union.
 *
 * One shape per message rather than the flat variable bag `whatsapp/templates.ts`
 * uses. That file's set is larger and its templates share most of their
 * variables; here all but one take none at all, and a union means the
 * appointment reminder cannot be rendered without its date the way a flat
 * optional field would allow.
 */
export type PushMessage =
  /** An appointment is close. Raw values — see the note above on formatting. */
  | { kind: 'appointment_reminder'; date: IsoDate; startMinute: number }
  /**
   * The clinic moved or cancelled a visit. `date`/`startMinute` are where it is
   * **now** for a move, and where it *was* for a cancellation — in both cases
   * the slot the sentence names.
   */
  | { kind: 'appointment_changed'; change: 'cancelled' | 'moved'; date: IsoDate; startMinute: number }
  /**
   * A new appointment was just booked for the client. Sent immediately, on the
   * booking write itself — see `notifyAppointmentBooked` in `push/notify.ts`
   * for why this is a separate message and dedupe key from the day-before
   * reminder rather than a replacement for it.
   */
  | { kind: 'appointment_booked'; date: IsoDate; startMinute: number }
  /** Today has not been logged yet, and the day is nearly over. */
  | { kind: 'check_in_reminder' }
  /** A plan covering this week has been published. */
  | { kind: 'plan_update' }
  /** The dietitian answered something the client asked for. */
  | { kind: 'clinic_message'; outcome: 'approved' | 'declined' | 'answered' };

/** The tag of every message above — the key both maps below are keyed by. */
export type PushMessageKind = PushMessage['kind'];

type Copy = { title: string; body: string };

const AR = {
  appointmentReminder: (date: string, time: string): Copy => ({
    title: 'تذكير بموعدك',
    body: `موعدك في العيادة ${date} الساعة ${time}.`,
  }),
  appointmentCancelled: (date: string, time: string): Copy => ({
    title: 'أُلغي موعدك',
    body: `أُلغي موعدك ${date} الساعة ${time}. تواصل مع العيادة لتحديد موعد جديد.`,
  }),
  appointmentMoved: (date: string, time: string): Copy => ({
    title: 'تغيّر موعد زيارتك',
    body: `موعدك الآن ${date} الساعة ${time}.`,
  }),
  appointmentBooked: (date: string, time: string): Copy => ({
    title: 'تم حجز موعدك',
    body: `موعدك ${date} الساعة ${time}.`,
  }),
  checkInReminder: (): Copy => ({
    title: 'كيف كان يومك؟',
    body: 'لم تسجّل وجبات اليوم بعد — دقيقة واحدة تكفي.',
  }),
  planUpdate: (): Copy => ({
    title: 'خطتك جاهزة',
    body: 'نُشرت خطة هذا الأسبوع. افتح التطبيق لتراها.',
  }),
  clinicMessage: (outcome: 'approved' | 'declined' | 'answered'): Copy => ({
    title: 'ردّ من العيادة',
    body:
      outcome === 'approved'
        ? 'تمت الموافقة على طلبك.'
        : outcome === 'declined'
          ? 'تم الردّ على طلبك — افتح التطبيق للتفاصيل.'
          : 'ردّت العيادة على طلبك.',
  }),
} as const;

const EN = {
  appointmentReminder: (date: string, time: string): Copy => ({
    title: 'Appointment reminder',
    body: `You are due at the clinic on ${date} at ${time}.`,
  }),
  appointmentCancelled: (date: string, time: string): Copy => ({
    title: 'Appointment cancelled',
    body: `Your appointment on ${date} at ${time} has been cancelled. Contact the clinic to rebook.`,
  }),
  appointmentMoved: (date: string, time: string): Copy => ({
    title: 'Appointment moved',
    body: `Your appointment is now on ${date} at ${time}.`,
  }),
  appointmentBooked: (date: string, time: string): Copy => ({
    title: 'Appointment booked',
    body: `Your appointment is on ${date} at ${time}.`,
  }),
  checkInReminder: (): Copy => ({
    title: 'How did today go?',
    body: "You haven't logged today's meals yet — it takes a minute.",
  }),
  planUpdate: (): Copy => ({
    title: 'Your plan is ready',
    body: 'This week’s plan has been published. Open the app to see it.',
  }),
  clinicMessage: (outcome: 'approved' | 'declined' | 'answered'): Copy => ({
    title: 'A reply from the clinic',
    body:
      outcome === 'approved'
        ? 'Your request was approved.'
        : outcome === 'declined'
          ? 'Your request was answered — open the app for the details.'
          : 'The clinic has replied to your request.',
  }),
} as const;

function copyFor(message: PushMessage, locale: Locale): Copy {
  const set = locale === 'en' ? EN : AR;

  switch (message.kind) {
    case 'appointment_reminder':
      return set.appointmentReminder(
        formatLongDate(locale, message.date),
        formatMinute(locale, message.date, message.startMinute),
      );
    case 'appointment_changed': {
      const date = formatLongDate(locale, message.date);
      const time = formatMinute(locale, message.date, message.startMinute);

      return message.change === 'cancelled'
        ? set.appointmentCancelled(date, time)
        : set.appointmentMoved(date, time);
    }
    case 'appointment_booked':
      return set.appointmentBooked(
        formatLongDate(locale, message.date),
        formatMinute(locale, message.date, message.startMinute),
      );
    case 'check_in_reminder':
      return set.checkInReminder();
    case 'plan_update':
      return set.planUpdate();
    case 'clinic_message':
      return set.clinicMessage(message.outcome);
  }
}

/**
 * Renders one message into the payload a device receives.
 *
 * `tag` is the collapse key, and it is the *dedupe key* rather than the kind.
 * Two reminders about two different appointments must both be readable; two
 * copies of the reminder about one appointment must not stack. Keying on the
 * event is what draws that line — see `push_deliveries` for where those keys
 * are minted, and note that the tag is doing on the device what the unique
 * index does in the database, for the case where the same event legitimately
 * pushes twice (a client re-subscribing, a second device arriving late).
 */
export function renderPushPayload(
  message: PushMessage,
  locale: Locale,
  options: { dedupeKey: string; tail?: string },
): PushPayload {
  const { title, body } = copyFor(message, locale);

  return {
    title,
    body,
    url: pushDestination(locale, message.kind, options.tail),
    tag: options.dedupeKey,
    // The consent kind, not the message kind: the worker groups and logs by
    // the four the client recognises. See `MESSAGE_CONSENT`.
    kind: pushConsentKind(message),
  };
}
