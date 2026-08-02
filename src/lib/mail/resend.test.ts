import { describe, expect, test } from 'bun:test';

import type { Mail } from './index';
import { createResendMailerWithSender } from './resend';

const MAIL: Mail = {
  to: 'dietitian@example.test',
  subject: 'Verify your email',
  html: '<p>Verify</p>',
  text: 'Verify: http://localhost:3000/api/auth/verify-email?token=test',
};

describe('createResendMailerWithSender', () => {
  test('surfaces an error returned in the Resend response payload', async () => {
    const mailer = createResendMailerWithSender('Clinic <mail@example.test>', async () => ({
      data: null,
      error: { name: 'validation_error', message: 'sender is not verified' },
    }));

    await expect(mailer.send(MAIL)).rejects.toThrow(
      'Resend refused the message: validation_error: sender is not verified',
    );
  });

  test('resolves when Resend accepts the message', async () => {
    const mailer = createResendMailerWithSender('Clinic <mail@example.test>', async () => ({
      data: { id: 'email-id' },
      error: null,
    }));

    await expect(mailer.send(MAIL)).resolves.toBeUndefined();
  });
});
