import { Resend } from 'resend';

import type { Mail, Mailer } from './index';

/**
 * Production transport.
 *
 * The client is created once at module scope. Both env vars are read here and
 * not at call time, so a misconfigured deployment fails while the module is
 * first evaluated rather than silently on the first password reset.
 */
export function createResendMailer(apiKey: string, from: string): Mailer {
  const resend = new Resend(apiKey);

  return {
    async send(mail: Mail): Promise<void> {
      const { error } = await resend.emails.send({
        from,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });

      // Resend reports failures in the payload rather than by throwing.
      if (error) {
        throw new Error(`Resend refused the message: ${error.name}: ${error.message}`);
      }
    },
  };
}
