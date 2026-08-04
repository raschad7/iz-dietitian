import { describe, expect, test } from 'bun:test';

import {
  accountDeletionRequestSchema,
  contactMethodSchema,
  dataUpdateRequestSchema,
  notificationSettingSchema,
  themePreferenceSchema,
} from './schema';

/**
 * The account screens' server-action boundary.
 *
 * Every one of these parses a `FormData` value, so the inputs under test are
 * strings — including the booleans, which arrive as the `on`/`off` a submit
 * button sends. Anything a hand-written POST could put in these fields is what
 * these tests are about.
 */

describe('notificationSettingSchema', () => {
  test('reads the on/off a switch submits as a boolean', () => {
    expect(notificationSettingSchema.parse({ kind: 'planUpdate', enabled: 'on' })).toEqual({
      kind: 'planUpdate',
      enabled: true,
    });

    expect(notificationSettingSchema.parse({ kind: 'planUpdate', enabled: 'off' })).toEqual({
      kind: 'planUpdate',
      enabled: false,
    });
  });

  test('refuses a notification kind that has no column behind it', () => {
    expect(notificationSettingSchema.safeParse({ kind: 'everything', enabled: 'on' }).success).toBe(
      false,
    );
  });

  test('refuses a value that is neither on nor off, rather than treating it as false', () => {
    expect(
      notificationSettingSchema.safeParse({ kind: 'planUpdate', enabled: 'true' }).success,
    ).toBe(false);
  });
});

describe('themePreferenceSchema and contactMethodSchema', () => {
  test('accept only the values the database check constraint allows', () => {
    expect(themePreferenceSchema.parse({ theme: 'dark' })).toEqual({ theme: 'dark' });
    expect(themePreferenceSchema.safeParse({ theme: 'sepia' }).success).toBe(false);

    expect(contactMethodSchema.parse({ preferredContact: 'phone' })).toEqual({
      preferredContact: 'phone',
    });
    expect(contactMethodSchema.safeParse({ preferredContact: 'sms' }).success).toBe(false);
  });
});

describe('dataUpdateRequestSchema', () => {
  test('trims the message', () => {
    expect(dataUpdateRequestSchema.parse({ topic: 'health', message: '  my height  ' })).toEqual({
      topic: 'health',
      message: 'my height',
    });
  });

  test('refuses a request that does not say what is wrong', () => {
    // The database restates this as a check constraint; an inbox item with no
    // message is one nobody can act on.
    expect(dataUpdateRequestSchema.safeParse({ topic: 'health', message: '' }).success).toBe(false);
    expect(dataUpdateRequestSchema.safeParse({ topic: 'health', message: '   ' }).success).toBe(
      false,
    );
  });

  test('refuses a topic the clinic inbox cannot route', () => {
    expect(dataUpdateRequestSchema.safeParse({ topic: 'billing', message: 'x' }).success).toBe(
      false,
    );
  });
});

describe('accountDeletionRequestSchema', () => {
  test('needs the confirmation the second step carries', () => {
    expect(accountDeletionRequestSchema.safeParse({ message: 'moving away' }).success).toBe(false);

    expect(
      accountDeletionRequestSchema.safeParse({ message: 'moving away', confirm: 'yes' }).success,
    ).toBe(false);

    expect(
      accountDeletionRequestSchema.parse({ message: 'moving away', confirm: 'confirmed' }),
    ).toEqual({ message: 'moving away', confirm: 'confirmed' });
  });

  test('accepts an empty reason — leaving needs no explanation', () => {
    expect(accountDeletionRequestSchema.parse({ message: '', confirm: 'confirmed' })).toEqual({
      message: undefined,
      confirm: 'confirmed',
    });
  });
});
