import { Resend } from 'resend';

import type { Mail, Mailer } from './index';

type ResendPayload = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

type ResendResult = {
  data: { id: string } | null;
  error: { name: string; message: string } | null;
};

type SendWithResend = (payload: ResendPayload) => Promise<ResendResult>;

/**
 * Production transport.
 *
 * The client is created once at module scope. Both env vars are read here and
 * not at call time, so a misconfigured deployment fails while the module is
 * first evaluated rather than silently on the first password reset.
 */
export function createResendMailer(apiKey: string, from: string): Mailer {
  const resend = new Resend(apiKey);

  return createResendMailerWithSender(from, (payload) => resend.emails.send(payload));
}

export function createResendMailerWithSender(from: string, send: SendWithResend): Mailer {
  return {
    async send(mail: Mail): Promise<void> {
      const { error } = await send({
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
