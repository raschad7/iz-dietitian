import { describe, expect, test } from 'bun:test';

import { createMailer, resolveMailTransport } from './index';

describe('createMailer', () => {
  test('uses the console transport when no transport is configured', () => {
    expect(resolveMailTransport({})).toBe('console');
  });

  test('refuses an incomplete Resend configuration', () => {
    expect(() => createMailer({ MAIL_TRANSPORT: 'resend' })).toThrow(
      'MAIL_TRANSPORT=resend but RESEND_API_KEY is not set.',
    );
  });

  test('refuses an unknown transport instead of silently dropping mail', () => {
    expect(() => createMailer({ MAIL_TRANSPORT: 'smtp' })).toThrow(
      'Unknown MAIL_TRANSPORT "smtp". Use "console" or "resend".',
    );
  });
});
