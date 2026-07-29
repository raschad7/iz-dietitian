import type { Mail, Mailer } from './index';

/**
 * Development transport. Prints the mail to the server console instead of
 * sending it, which is exactly what `sendMagicLink` already did — so local
 * development needs no account, no API key and no domain.
 *
 * The URL is printed on its own line so it can be clicked or copied out of the
 * terminal without fighting the surrounding text.
 */
export const consoleMailer: Mailer = {
  async send(mail: Mail): Promise<void> {
    const url = mail.text.match(/https?:\/\/\S+/)?.[0];

    console.info(
      [
        '',
        '─────────── mail (console transport) ───────────',
        `to:      ${mail.to}`,
        `subject: ${mail.subject}`,
        url ? `link:    ${url}` : '',
        '────────────────────────────────────────────────',
        '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  },
};
