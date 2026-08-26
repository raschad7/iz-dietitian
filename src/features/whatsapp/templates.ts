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
  | 'portalCredentials'
  | 'billStatement'
  | 'billDocument'
  | 'paymentReminder';

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
  /**
   * Already formatted in the client's locale — see `formatLongDate`.
   *
   * Optional because not every message is about a moment: the bill statement
   * is about an account, and a template that needs no date should not have to
   * invent one to satisfy this type. `renderWhatsappMessage` throws on a
   * placeholder with no value, so a template that *does* use it is still
   * caught here rather than at a patient's phone.
   */
  date?: string;
  /** Already formatted — `formatMinute`. */
  time?: string;
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
  /**
   * What is still outstanding, already formatted as money in the patient's own
   * locale — see `formatAmount`. Only the reminder uses it.
   *
   * Pre-formatted for the same reason the dates are: a template is a string
   * with holes in it, and teaching the renderer about currency would put
   * `Intl` in a file whose whole job is copy.
   */
  amount?: string;
};

/**
 * Unicode's own directional marks, which is all the control a plain-text message
 * has over how it is laid out.
 *
 * WhatsApp renders no markup, but the OS text engine underneath it runs the
 * bidirectional algorithm, and these steer it. They are invisible, so they are
 * named here rather than pasted into the copy where nobody could see them.
 */
/** U+200F. Makes a line's base direction RTL even when it opens with a digit. */
const RTL_MARK = '‏';
/** U+2068 / U+2069. Seals a run so its direction cannot leak into the line. */
const ISOLATE_START = '⁨';
const ISOLATE_END = '⁩';

/**
 * One line per appointment, numbered, for {@link WhatsappTemplateVariables.appointments}.
 *
 * Numbered rather than bulleted: a patient reading "your four appointments" then
 * counting bullets to check all four arrived is doing the app's job for it. Each
 * line carries the date, the time and how long the visit runs, which is every
 * detail the calendar itself shows about a booking.
 *
 * **The Arabic list needs its directional marks stated, not assumed.** A line
 * reading `1. 5 August 2026 — 9:15 AM (30 دقيقة)` is a run of Latin digits and
 * Latin month names with one Arabic word at the end, dropped into a right-to-left
 * message. Left alone, the bidi algorithm takes the line's direction from its
 * first strong character — the `A` of August — lays the whole line out
 * left-to-right against a right-aligned message, and throws the duration to the
 * far end where it reads as belonging to the next appointment. The leading `1.`
 * lands wherever the surrounding text pushes it, so the numbers stop forming a
 * column at all.
 *
 * `RTL_MARK` fixes the line to the paragraph's direction, so every number starts
 * at the right edge and the list reads as a list. The isolates then keep the date
 * and the time as intact left-to-right runs *inside* it, which is what stops
 * `2026` and `9:15` swapping ends.
 */
export function formatAppointmentList(
  appointments: readonly { date: string; time: string; duration: string }[],
  locale: Locale,
): string {
  const rtl = locale === 'ar';

  return appointments
    .map((appointment, index) => {
      const date = rtl ? `${ISOLATE_START}${appointment.date}${ISOLATE_END}` : appointment.date;
      const time = rtl ? `${ISOLATE_START}${appointment.time}${ISOLATE_END}` : appointment.time;
      const line = `${index + 1}. ${date} — ${time} (${appointment.duration})`;

      return rtl ? `${RTL_MARK}${line}` : line;
    })
    .join('\n');
}

/**
 * Labels, not pictograms.
 *
 * Every line that carries a value used to open with an emoji — 📅 for the date,
 * 🕐 for the time — and both jobs it was doing are done better by the word. A
 * clinic confirming a medical appointment is not writing a text to a friend, and
 * a calendar glyph is decoration standing where the label belongs: 📅 does not
 * say whether the date is the old one or the new one, which is exactly the
 * question a rescheduled patient has.
 *
 * The alignment follows from the same change. An emoji is directionally neutral,
 * so an Arabic line opening with one takes its direction from whatever comes
 * next — usually the Latin digits of the date — and lays itself out
 * left-to-right inside a right-to-left message. `التاريخ:` is a strong
 * right-to-left word, so the line is anchored by its first character and the
 * values line up under each other down the right edge.
 *
 * The greeting keeps its comma and loses its 👋 for the same reason.
 */
const COPY = {
  appointmentReminder: {
    ar: [
      'مرحباً {clientName}،',
      '',
      'نذكّرك بموعدك في {clinicName}.',
      '',
      'التاريخ: {date}',
      'الوقت: {time}',
      '',
      'بانتظارك. لتغيير الموعد يرجى الرد على هذه الرسالة.',
    ],
    en: [
      'Hello {clientName},',
      '',
      'A reminder of your appointment at {clinicName}.',
      '',
      'Date: {date}',
      'Time: {time}',
      '',
      'We look forward to seeing you. To change it, reply to this message.',
    ],
  },
  appointmentConfirmation: {
    ar: [
      'مرحباً {clientName}،',
      '',
      'تم تأكيد موعدك في {clinicName}.',
      '',
      'التاريخ: {date}',
      'الوقت: {time}',
      '',
      'بانتظارك. لأي تعديل يرجى الرد على هذه الرسالة.',
    ],
    en: [
      'Hello {clientName},',
      '',
      'Your appointment at {clinicName} is confirmed.',
      '',
      'Date: {date}',
      'Time: {time}',
      '',
      'We look forward to seeing you. To change it, reply to this message.',
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
  /**
   * **The Arabic states its count after the list, not inside the sentence.**
   *
   * Arabic numbers agree with the noun they count, and in three different ways:
   * two appointments are `موعدان`, three to ten are `مواعيد`, and eleven or more
   * are `موعداً`. A single template cannot satisfy all three, and this one read
   * `{count} مواعيد` — right for a four-week repeat, wrong for the two-week and
   * three-month spans the dialog offers just as prominently, which went out as
   * `2 مواعيد` and `13 مواعيد`.
   *
   * Naming the total on its own line sidesteps the agreement entirely and holds
   * a plural noun that is always correct because it is never counted. It also
   * puts the number where it is actually used: the count exists so a patient can
   * check nothing went missing, which is something they do *after* reading the
   * list, not before.
   *
   * English has no such agreement, so it keeps the count in the opening line
   * where it reads more naturally.
   */
  appointmentSeries: {
    ar: [
      'مرحباً {clientName}،',
      '',
      'تم تأكيد المواعيد التالية لك في {clinicName}:',
      '',
      '{appointments}',
      '',
      'إجمالي المواعيد: {count}',
      '',
      'بانتظارك. لأي تعديل على أحد هذه المواعيد يرجى الرد على هذه الرسالة.',
    ],
    en: [
      'Hello {clientName},',
      '',
      'Your {count} appointments at {clinicName} are confirmed:',
      '',
      '{appointments}',
      '',
      'We look forward to seeing you. To change any of them, reply to this message.',
    ],
  },
  /**
   * A moved appointment. Both slots are named: "your appointment changed" with
   * only the new time makes a patient go hunting for the old message to work out
   * what actually moved, and one of the two is the one already in their diary.
   */
  appointmentRescheduled: {
    ar: [
      'مرحباً {clientName}،',
      '',
      'تم تغيير موعدك في {clinicName}.',
      '',
      'الموعد السابق: {previousDate} — {previousTime}',
      'الموعد الجديد: {date} — {time}',
      '',
      'بانتظارك. لأي تعديل يرجى الرد على هذه الرسالة.',
    ],
    en: [
      'Hello {clientName},',
      '',
      'Your appointment at {clinicName} has been changed.',
      '',
      'Previously: {previousDate} — {previousTime}',
      'Now: {date} — {time}',
      '',
      'We look forward to seeing you. To change it, reply to this message.',
    ],
  },
  appointmentCancelled: {
    ar: [
      'مرحباً {clientName}،',
      '',
      'تم إلغاء موعدك في {clinicName}.',
      '',
      'التاريخ: {date}',
      'الوقت: {time}',
      '',
      'لحجز موعد جديد يرجى الرد على هذه الرسالة.',
    ],
    en: [
      'Hello {clientName},',
      '',
      'Your appointment at {clinicName} has been cancelled.',
      '',
      'Date: {date}',
      'Time: {time}',
      '',
      'To book a new appointment, reply to this message.',
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
      'مرحباً {clientName}،',
      '',
      'تم إنشاء حسابك في بوابة {clinicName}.',
      '',
      'اسم المستخدم: {username}',
      'كلمة المرور المؤقتة: {password}',
      '',
      'سيُطلب منك تغيير كلمة المرور عند أول تسجيل دخول. يرجى عدم مشاركة هذه الرسالة مع أحد.',
    ],
    en: [
      'Hello {clientName},',
      '',
      'Your {clinicName} portal account is ready.',
      '',
      'Username: {username}',
      'Temporary password: {password}',
      '',
      'You will be asked to change the password when you first sign in. Please do not share this message.',
    ],
  },
  /*
    The bill, sent as a PDF the subscriber keeps — this is its caption.

    Short on purpose: the document under it is the statement, and a caption that
    listed the figures would be the same account said twice, in the place where
    it cannot be checked against anything. What the caption owes the reader is
    what the file is and who it came from.
  */
  billStatement: {
    ar: [
      'مرحباً {clientName}،',
      '',
      'مرفق كشف حسابك في {clinicName}.',
      '',
      'لأي استفسار عن الكشف، يسعدنا ردّك على هذه الرسالة.',
    ],
    en: [
      'Hello {clientName},',
      '',
      'Your {clinicName} account statement is attached.',
      '',
      'If anything on it needs explaining, reply to this message.',
    ],
  },
  /*
    One bill rather than the whole account — the same caption argument as
    `billStatement`: the document under it carries the figures, and repeating
    them here would be the bill said twice in the place it cannot be checked.
  */
  billDocument: {
    ar: [
      'مرحباً {clientName}،',
      '',
      'مرفق فاتورتك من {clinicName}.',
      '',
      'لأي استفسار عنها، يسعدنا ردّك على هذه الرسالة.',
    ],
    en: [
      'Hello {clientName},',
      '',
      'Your {clinicName} bill is attached.',
      '',
      'If anything on it needs explaining, reply to this message.',
    ],
  },
  /*
    A nudge about an unpaid balance, and the shortest message here on purpose.

    It names the figure and stops. A reminder that explains itself at length
    reads as a demand, and this goes to somebody who is mid-course with a
    dietitian they will see again — the clinic's relationship with them is worth
    more than the emphasis. No document: what is owed is one number, and a PDF
    to open before you can read it is a worse way to say it. The statement is a
    press away on the same row when they ask for detail.
  */
  paymentReminder: {
    ar: [
      'مرحباً {clientName}،',
      '',
      'تذكير ودّي بأن المتبقي على حسابك في {clinicName} هو {amount}.',
      '',
      'لأي استفسار، يسعدنا ردّك على هذه الرسالة.',
    ],
    en: [
      'Hello {clientName},',
      '',
      'A friendly reminder that {amount} is outstanding on your {clinicName} account.',
      '',
      'If you have any questions, reply to this message.',
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
 *
 * **Every value interpolated into an Arabic message is isolated.** The copy is
 * right-to-left and almost everything dropped into it is not: dates and times
 * are Latin digits by the project's `nu-latn` rule, a username is ASCII, and a
 * client may well be recorded under a Latin spelling of their name. Each is a
 * left-to-right island in a right-to-left line, and without a boundary the
 * algorithm lets one island's direction reach across the punctuation between
 * them — which is how `الوقت: 9:15 AM` becomes `AM 9:15` and how a trailing
 * colon ends up on the wrong side of the label.
 *
 * Done here rather than in the copy so the templates stay legible. Invisible
 * characters sprinkled through thirty translated strings are impossible to
 * proofread and the first person to edit one would drop them.
 *
 * A multi-line value brings its own marks — `formatAppointmentList` sets the
 * direction of each of its lines, and an isolate cannot span the paragraph
 * breaks between them anyway, so it is left alone.
 */
export function renderWhatsappMessage(
  kind: WhatsappTemplateKind,
  locale: Locale,
  variables: WhatsappTemplateVariables,
): string {
  const rtl = locale === 'ar';

  const body = COPY[kind][locale]
    .join('\n')
    .replace(PLACEHOLDER, (_match, name: string) => {
      const value = variables[name as keyof WhatsappTemplateVariables];

      if (value === undefined || value === '') {
        throw new Error(`WhatsApp template "${kind}" needs a value for {${name}}.`);
      }

      if (!rtl || value.includes('\n')) return value;

      return `${ISOLATE_START}${value}${ISOLATE_END}`;
    });

  return body.length > MAX_BODY_LENGTH ? `${body.slice(0, MAX_BODY_LENGTH - 1)}…` : body;
}

/** Trims a hand-typed message to what the gateway will accept. */
export function clampMessageBody(body: string): string {
  const trimmed = body.trim();

  return trimmed.length > MAX_BODY_LENGTH ? `${trimmed.slice(0, MAX_BODY_LENGTH - 1)}…` : trimmed;
}

export { MAX_BODY_LENGTH };
