import { describe, expect, test } from 'bun:test';

import { renderMail } from './templates';

describe('renderMail', () => {
  test('renders Arabic with an RTL document direction', () => {
    const mail = renderMail('verifyEmail', 'ar', { url: 'https://example.test/v?token=abc', name: 'سارة' });

    expect(mail.html).toContain('dir="rtl"');
    expect(mail.html).toContain('lang="ar"');
    expect(mail.html).toContain('https://example.test/v?token=abc');
  });

  test('renders English with an LTR document direction', () => {
    const mail = renderMail('verifyEmail', 'en', { url: 'https://example.test/v?token=abc', name: 'Sara' });

    expect(mail.html).toContain('dir="ltr"');
    expect(mail.subject).not.toBe('');
  });

  test('always includes a plain-text alternative containing the url', () => {
    const mail = renderMail('resetPassword', 'en', { url: 'https://example.test/r?token=xyz', name: 'Sara' });

    expect(mail.text).toContain('https://example.test/r?token=xyz');
  });

  test('escapes a name containing HTML so it cannot inject markup', () => {
    const mail = renderMail('verifyEmail', 'en', { url: 'https://example.test/v', name: '<script>alert(1)</script>' });

    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});
