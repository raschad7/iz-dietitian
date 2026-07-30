import { type Locale } from '@/i18n/routing';

/**
 * The text of every automated WhatsApp message, in Arabic and English.
 *
 * Not in the next-intl catalogue, for the same reason mail is not
 * (`src/lib/mail/templates.ts`): the catalogue resolves inside a request scope,
 * and these are sent from a cron job that has none. Keeping them here also keeps
 * WhatsApp's plain-text conventions — line breaks, no markup — out of a
 * catalogue full of UI strings.
 *
 * **Each client's own locale decides the language**, not the dietitian's:
 * `clients.preferred_locale` is what the portal already uses, and a patient who
 * reads Arabic should not get an English reminder because staff switched the UI.
 *
 * Values are interpolated as plain text with no escaping, and deliberately so:
 * WhatsApp renders none, so there is no injection to escape. A name containing
 * `<b>` arrives looking exactly as it was typed.
 */

export type WhatsappTemplateKind = 'appointmentReminder' | 'appointmentConfirmation' | 'portalCredentials';

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
  username?: string;
  password?: string;
  portalUrl?: string;
};

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
  portalCredentials: {
    ar: [
      'مرحباً {clientName} 👋',
      '',
      'تم إنشاء حسابك في بوابة {clinicName}:',
      '🔗 {portalUrl}',
      '👤 اسم المستخدم: {username}',
      '🔑 كلمة المرور المؤقتة: {password}',
      '',
      'سيُطلب منك تغيير كلمة المرور عند أول دخول. لا تشارك هذه الرسالة مع أحد.',
    ],
    en: [
      'Hello {clientName} 👋',
      '',
      'Your {clinicName} portal account is ready:',
      '🔗 {portalUrl}',
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
