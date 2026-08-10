import { type Locale } from '@/i18n/routing';

/**
 * The text of every automated WhatsApp message.
 *
 * Not in the next-intl catalogue, for the same reason mail is not
 * (`src/lib/mail/templates.ts`): the catalogue resolves inside a request scope,
 * and these are sent from a cron job that has none. Keeping them here also keeps
 * WhatsApp's plain-text conventions — line breaks, no markup — out of a
 * catalogue full of UI strings.
 *
 * **Every patient-facing message goes out in Arabic** — see
 * {@link PATIENT_MESSAGE_LOCALE}. The English copy is kept and kept complete
 * because that decision is one constant, not a rewrite.
 *
 * Values are interpolated as plain text with no escaping, and deliberately so:
 * WhatsApp renders none, so there is no injection to escape. A name containing
 * `<b>` arrives looking exactly as it was typed.
 */

export type WhatsappTemplateKind =
  | 'appointmentReminder'
  | 'appointmentConfirmation'
  | 'appointmentSeries'
  | 'appointmentRescheduled'
  | 'appointmentCancelled'
  | 'portalCredentials';

/**
 * The language every WhatsApp message to a patient is written in.
 *
 * Fixed to Arabic rather than following `clients.preferred_locale`. That column
 * exists for the *portal*, where the client picked it and is looking at a screen;
 * it is also `ar` by default, so a record created in a hurry carries no real
 * signal about what the person reads. The clinic speaks Arabic to its patients,
 * and one language for every outgoing message means staff can read back exactly
 * what a patient was told without first checking which locale their record
 * happened to hold.
 *
 * The dates and times inside the message are formatted with this locale too, so
 * the whole message is consistent — and Western digits either way, per the
 * project's `nu-latn` rule in `src/lib/format.ts`.
 *
 * Changing this to `'en'` switches every template; the English copy is complete
 * and tested. Per-client language would mean passing a locale through
 * `reminders.ts` and `notify.ts` again, which is where it used to be.
 */
export const PATIENT_MESSAGE_LOCALE: Locale = 'ar';

/**
 * Every variable any template may use. One flat type rather than one per kind:
 * the set is small, the call sites are few, and a missing key is caught by
 * {@link renderWhatsappMessage} throwing rather than by shipping "{time}" to a
 * patient.
 */
export type WhatsappTemplateVariables = {
  clientName: string;
  clinicName: string;
  /** Already formatted in the client's locale — see `formatLongDate`. */
  date: string;
  /** Already formatted — `formatMinute`. */
  time: string;
  /** Where a rescheduled appointment used to be. Only the reschedule uses these. */
  previousDate?: string;
  previousTime?: string;
  /**
   * A course of appointments, already formatted as one block of lines — see
   * `formatAppointmentList`. Only `appointmentSeries` uses this and `count`.
   *
   * Pre-rendered rather than passed as an array, because a template is a string
   * with holes in it: giving the renderer a second shape to understand would be
   * a loop in a file whose whole job is copy.
   */
  appointments?: string;
  /** How many that block lists, so the opening line can say so. */
  count?: string;
  username?: string;
  password?: string;
};

/**
 * One line per appointment, numbered, for {@link WhatsappTemplateVariables.appointments}.
 *
 * Numbered rather than bulleted: a patient reading "your four appointments" then
 * counting bullets to check all four arrived is doing the app's job for it. Each
 * line carries the date, the time and how long the visit runs, which is every
 * detail the calendar itself shows about a booking.
 */
export function formatAppointmentList(
  appointments: readonly { date: string; time: string; duration: string }[],
): string {
  return appointments
    .map((appointment, index) => `${index + 1}. 📅 ${appointment.date} — 🕐 ${appointment.time} (${appointment.duration})`)
    .join('\n');
}

const COPY = {
  appointmentReminder: {
    ar: [
      'مرحباً {clientName} 👋',
      '',
      'نذكّرك بموعدك في {clinicName}:',
      '📅 {date}',
      '🕐 {time}',
      '',
      'إذا احتجت تغيير الموعد، ردّ على هذه الرسالة.',
    ],
    en: [
      'Hello {clientName} 👋',
      '',
      'A reminder of your appointment at {clinicName}:',
      '📅 {date}',
      '🕐 {time}',
      '',
      'If you need to change it, just reply to this message.',
    ],
  },
  appointmentConfirmation: {
    ar: [
      'مرحباً {clientName} 👋',
      '',
      'تم تثبيت موعدك في {clinicName}:',
      '📅 {date}',
      '🕐 {time}',
      '',
      'نراك قريباً. لأي تعديل، ردّ على هذه الرسالة.',
    ],
    en: [
      'Hello {clientName} 👋',
      '',
      'Your appointment at {clinicName} is confirmed:',
      '📅 {date}',
      '🕐 {time}',
      '',
      'See you then. To change it, reply to this message.',
    ],
  },
  /**
   * A course of appointments booked in one go — the repeat offer the doctor
   * accepted after making the first booking.
   *
   * **One message, not one per appointment.** Four separate "your appointment is
   * confirmed" texts arriving within a second of each other read as a fault in
   * the system, bury each other in the thread, and leave the patient to assemble
   * the schedule themselves. The list is the message.
   *
   * `{count}` is stated in the opening line as well as implied by the list, so
   * the patient can check nothing went missing without counting.
   */
  appointmentSeries: {
    ar: [
      'مرحباً {clientName} 👋',
      '',
      'تم تثبيت {count} مواعيد لك في {clinicName}:',
      '',
      '{appointments}',
      '',
      'نراك قريباً. لأي تعديل على أي من هذه المواعيد، ردّ على هذه الرسالة.',
    ],
    en: [
      'Hello {clientName} 👋',
      '',
      'Your {count} appointments at {clinicName} are confirmed:',
      '',
      '{appointments}',
      '',
      'See you then. To change any of them, reply to this message.',
    ],
  },
  /**
   * A moved appointment. Both slots are named: "your appointment changed" with
   * only the new time makes a patient go hunting for the old message to work out
   * what actually moved, and one of the two is the one already in their diary.
   */
  appointmentRescheduled: {
    ar: [
      'مرحباً {clientName} 👋',
      '',
      'تم تغيير موعدك في {clinicName}.',
      '',
      'الموعد السابق:',
      '📅 {previousDate}',
      '🕐 {previousTime}',
      '',
      'الموعد الجديد:',
      '📅 {date}',
      '🕐 {time}',
      '',
      'نراك حينها. لأي تعديل، ردّ على هذه الرسالة.',
    ],
    en: [
      'Hello {clientName} 👋',
      '',
      'Your appointment at {clinicName} has been changed.',
      '',
      'Previously:',
      '📅 {previousDate}',
      '🕐 {previousTime}',
      '',
      'Now:',
      '📅 {date}',
      '🕐 {time}',
      '',
      'See you then. To change it, reply to this message.',
    ],
  },
  appointmentCancelled: {
    ar: [
      'مرحباً {clientName} 👋',
      '',
      'تم إلغاء موعدك في {clinicName}:',
      '📅 {date}',
      '🕐 {time}',
      '',
      'لحجز موعد جديد، ردّ على هذه الرسالة.',
    ],
    en: [
      'Hello {clientName} 👋',
      '',
      'Your appointment at {clinicName} has been cancelled:',
      '📅 {date}',
      '🕐 {time}',
      '',
      'To book a new one, reply to this message.',
    ],
  },
  /**
   * Credentials only — no sign-in link.
   *
   * The link was here and was removed at the clinic's instruction. Worth knowing
   * if you are tempted to add it back: a message carrying a username, a password
   * *and* the door they open is a complete set of keys in one forwardable chat
   * bubble, so leaving the address out is not merely a shorter message.
   */
  portalCredentials: {
    ar: [
      'مرحباً {clientName} 👋',
      '',
      'تم إنشاء حسابك في بوابة {clinicName}:',
      '👤 اسم المستخدم: {username}',
      '🔑 كلمة المرور المؤقتة: {password}',
      '',
      'سيُطلب منك تغيير كلمة المرور عند أول دخول. لا تشارك هذه الرسالة مع أحد.',
    ],
    en: [
      'Hello {clientName} 👋',
      '',
      'Your {clinicName} portal account is ready:',
      '👤 Username: {username}',
      '🔑 Temporary password: {password}',
      '',
      'You will be asked to change the password on first sign-in. Do not share this message.',
    ],
  },
} as const satisfies Record<WhatsappTemplateKind, Record<Locale, readonly string[]>>;

/**
 * WhatsApp's own ceiling for a text message body. Templates are far shorter than
 * this; the check guards against a pathological interpolated value (a 5000-character
 * "name") producing a send the gateway rejects with a validation error.
 */
const MAX_BODY_LENGTH = 4096;

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Fills a template. Throws on a placeholder with no value, rather than sending a
 * patient a message containing the literal `{time}`.
 */
export function renderWhatsappMessage(
  kind: WhatsappTemplateKind,
  locale: Locale,
  variables: WhatsappTemplateVariables,
): string {
  const body = COPY[kind][locale]
    .join('\n')
    .replace(PLACEHOLDER, (_match, name: string) => {
      const value = variables[name as keyof WhatsappTemplateVariables];

      if (value === undefined || value === '') {
        throw new Error(`WhatsApp template "${kind}" needs a value for {${name}}.`);
      }

      return value;
    });

  return body.length > MAX_BODY_LENGTH ? `${body.slice(0, MAX_BODY_LENGTH - 1)}…` : body;
}

/** Trims a hand-typed message to what the gateway will accept. */
export function clampMessageBody(body: string): string {
  const trimmed = body.trim();

  return trimmed.length > MAX_BODY_LENGTH ? `${trimmed.slice(0, MAX_BODY_LENGTH - 1)}…` : trimmed;
}

export { MAX_BODY_LENGTH };
