import { describe, expect, test } from 'bun:test';

import { isGroupChatId, normalizePhone, phoneFromChatId, phoneMatchKey, toChatIdFromPhone } from './phone';

/**
 * These are the numbers a real roster holds. `clients.phone` is free text, so
 * every one of these shapes is something staff will actually have typed — and each
 * has to reach the same person on WhatsApp.
 */

const CC = '970';

describe('normalizePhone', () => {
  test('replaces a national trunk zero with the country code', () => {
    expect(normalizePhone('0599123456', CC)).toBe('970599123456');
  });

  test('keeps a number that already carries a + prefix', () => {
    expect(normalizePhone('+972599123456', CC)).toBe('972599123456');
  });

  test('strips a 00 international prefix', () => {
    expect(normalizePhone('00972599123456', CC)).toBe('972599123456');
  });

  test('ignores spaces, dashes and parentheses', () => {
    expect(normalizePhone(' (059) 912-3456 ', CC)).toBe('970599123456');
    expect(normalizePhone('+970 59 912 3456', CC)).toBe('970599123456');
  });

  test('prepends the country code to a bare subscriber number', () => {
    expect(normalizePhone('599123456', CC)).toBe('970599123456');
  });

  test('leaves a number that already starts with the country code alone', () => {
    expect(normalizePhone('970599123456', CC)).toBe('970599123456');
  });

  test('does not double a country code that arrived with a plus', () => {
    expect(normalizePhone('+970599123456', CC)).toBe('970599123456');
  });

  test('collapses several leading zeros from a national prefix', () => {
    expect(normalizePhone('00599123456', CC)).toBe('599123456');
  });

  test('rejects anything too short to be a phone number', () => {
    expect(normalizePhone('123', CC)).toBeNull();
    expect(normalizePhone('0599', CC)).toBeNull();
  });

  test('rejects a value past E.164 length', () => {
    expect(normalizePhone('+1234567890123456', CC)).toBeNull();
  });

  test('rejects text, empty strings and nothing at all', () => {
    expect(normalizePhone('no phone', CC)).toBeNull();
    expect(normalizePhone('   ', CC)).toBeNull();
    expect(normalizePhone(null, CC)).toBeNull();
    expect(normalizePhone(undefined, CC)).toBeNull();
  });
});

describe('toChatIdFromPhone', () => {
  test('produces the gateway chat id alongside the normalised number', () => {
    expect(toChatIdFromPhone('0599123456', CC)).toEqual({
      phone: '970599123456',
      chatId: '970599123456@c.us',
    });
  });

  test('returns null rather than a chat id built from nonsense', () => {
    expect(toChatIdFromPhone('n/a', CC)).toBeNull();
  });
});

describe('phoneFromChatId', () => {
  test('reads the number out of an individual chat id', () => {
    expect(phoneFromChatId('970599123456@c.us')).toBe('970599123456');
  });

  test('tolerates a device suffix', () => {
    expect(phoneFromChatId('970599123456:12@c.us')).toBe('970599123456');
  });

  test('refuses a group', () => {
    expect(phoneFromChatId('123456789-987654321@g.us')).toBeNull();
  });

  test('refuses a privacy id, whose digits are not a phone number', () => {
    // Attributing one of these to a client by its digits would file a stranger's
    // message in a patient's record.
    expect(phoneFromChatId('182736451928374@lid')).toBeNull();
  });

  test('refuses a broadcast and anything non-numeric', () => {
    expect(phoneFromChatId('status@broadcast')).toBeNull();
    expect(phoneFromChatId('abcdefghij@c.us')).toBeNull();
    expect(phoneFromChatId(null)).toBeNull();
  });
});

describe('isGroupChatId', () => {
  test('recognises a group', () => {
    expect(isGroupChatId('123-456@g.us')).toBe(true);
    expect(isGroupChatId('970599123456@c.us')).toBe(false);
  });
});

describe('phoneMatchKey', () => {
  test('matches the same person written locally and internationally', () => {
    expect(phoneMatchKey('0599123456')).toBe(phoneMatchKey('+970599123456'));
    expect(phoneMatchKey('059 912 3456')).toBe(phoneMatchKey('970599123456'));
  });

  test('distinguishes two different subscribers', () => {
    expect(phoneMatchKey('0599123456')).not.toBe(phoneMatchKey('0599123457'));
  });

  test('returns null for a value that cannot be a number', () => {
    expect(phoneMatchKey('12')).toBeNull();
    expect(phoneMatchKey(null)).toBeNull();
  });
});
