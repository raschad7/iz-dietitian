import type { Locale } from '@/i18n/routing';

import { consoleMailer } from './console';
import { createResendMailer } from './resend';
import { renderMail, type MailKind, type MailVariables } from './templates';

export type Mail = { to: string; subject: string; html: string; text: string };

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export type MailEnvironment = {
  MAIL_TRANSPORT?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
};

export function resolveMailTransport(env: MailEnvironment): 'console' | 'resend' {
  const transport = env.MAIL_TRANSPORT ?? 'console';

  if (transport === 'console' || transport === 'resend') return transport;

  throw new Error(`Unknown MAIL_TRANSPORT "${transport}". Use "console" or "resend".`);
}

/**
 * Chooses a transport from the environment.
 *
 * A production deployment that names `resend` without configuring it throws
 * here, at first use, rather than swallowing the mail. A mailer that silently
 * drops password resets is worse than one that refuses to run: the failure is
 * invisible until a locked-out dietitian calls to ask why no email arrived.
 */
export function createMailer(env: MailEnvironment): Mailer {
  const transport = resolveMailTransport(env);

  if (transport === 'console') return consoleMailer;

  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;

  if (!apiKey) throw new Error('MAIL_TRANSPORT=resend but RESEND_API_KEY is not set.');
  if (!from) throw new Error('MAIL_TRANSPORT=resend but EMAIL_FROM is not set.');

  return createResendMailer(apiKey, from);
}

let cached: Mailer | undefined;

export function getMailer(): Mailer {
  cached ??= createMailer({
    MAIL_TRANSPORT: process.env.MAIL_TRANSPORT,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
  });
  return cached;
}

/** The one function the rest of the app calls. */
export async function sendMail(
  kind: MailKind,
  to: string,
  locale: Locale,
  variables: MailVariables,
): Promise<void> {
  await getMailer().send({ to, ...renderMail(kind, locale, variables) });
}

export { renderMail, type MailKind, type MailVariables } from './templates';
