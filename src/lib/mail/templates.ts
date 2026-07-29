import { getLocaleDirection, type Locale } from '@/i18n/routing';

/**
 * Mail bodies are built here rather than in a message catalogue.
 *
 * next-intl's catalogue is for UI strings resolved inside a request scope; mail
 * is sent from Better Auth callbacks that have no such scope. Keeping the two
 * separate also means an email template can carry markup without teaching the
 * catalogue about HTML.
 */

export type MailKind = 'verifyEmail' | 'resetPassword';

export type MailVariables = { url: string; name: string };

export type RenderedMail = { subject: string; html: string; text: string };

const COPY = {
  verifyEmail: {
    ar: {
      subject: 'تأكيد بريدك الإلكتروني',
      heading: 'أهلاً {name}',
      body: 'اضغط الزر أدناه لتأكيد بريدك الإلكتروني وتفعيل حسابك.',
      cta: 'تأكيد البريد الإلكتروني',
      footer: 'إذا لم تنشئ هذا الحساب، تجاهل هذه الرسالة.',
    },
    en: {
      subject: 'Confirm your email address',
      heading: 'Hello {name}',
      body: 'Click the button below to confirm your email address and activate your account.',
      cta: 'Confirm email address',
      footer: 'If you did not create this account, you can ignore this message.',
    },
  },
  resetPassword: {
    ar: {
      subject: 'إعادة تعيين كلمة المرور',
      heading: 'أهلاً {name}',
      body: 'وصلنا طلب لإعادة تعيين كلمة المرور. اضغط الزر أدناه لاختيار كلمة مرور جديدة.',
      cta: 'إعادة تعيين كلمة المرور',
      footer: 'إذا لم تطلب ذلك، تجاهل هذه الرسالة ولن يتغير شيء.',
    },
    en: {
      subject: 'Reset your password',
      heading: 'Hello {name}',
      body: 'We received a request to reset your password. Click the button below to choose a new one.',
      cta: 'Reset password',
      footer: 'If you did not request this, ignore this message and nothing will change.',
    },
  },
} as const satisfies Record<MailKind, Record<Locale, Record<string, string>>>;

/**
 * Mail bodies interpolate a user-supplied name, and mail clients render HTML.
 * Escaping is therefore not optional.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMail(kind: MailKind, locale: Locale, variables: MailVariables): RenderedMail {
  const copy = COPY[kind][locale];
  const direction = getLocaleDirection(locale);

  const heading = copy.heading.replace('{name}', escapeHtml(variables.name));

  /**
   * The URL is escaped for the HTML body but NOT for the plain-text one.
   *
   * Inside an `href` attribute this is simply correct HTML — a query string's
   * `&` must be written `&amp;`, and every client decodes it back. It is also
   * defence in depth: the URL is built by Better Auth from our own base URL and
   * a generated token today, but an unescaped value in an attribute is one
   * refactor away from being an injection point.
   *
   * The text/plain alternative is not markup, so escaping there would corrupt
   * the link rather than protect it.
   */
  const safeUrl = escapeHtml(variables.url);

  // Inline styles only: every meaningful mail client strips <style> blocks.
  const html = `<!doctype html>
<html lang="${locale}" dir="${direction}">
  <body style="margin:0;padding:24px;background:#f6f6f6;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">${heading}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">${copy.body}</p>
      <p style="margin:0 0 24px;">
        <a href="${safeUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;">${copy.cta}</a>
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">${copy.footer}</p>
    </div>
  </body>
</html>`;

  const text = `${heading}\n\n${copy.body}\n\n${variables.url}\n\n${copy.footer}\n`;

  return { subject: copy.subject, html, text };
}
