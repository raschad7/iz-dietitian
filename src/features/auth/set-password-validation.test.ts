import { describe, expect, test } from 'bun:test';

import {
  firstSetPasswordMessage,
  readSetPasswordForm,
  setPasswordFieldErrors,
} from './set-password-validation';

/** The shape `readSetPasswordForm` produces, without going through a FormData. */
function form(password: string, confirmPassword: string) {
  return { password, confirmPassword, locale: 'ar' };
}

describe('setPasswordFieldErrors', () => {
  test('accepts a password that satisfies every rule', () => {
    expect(setPasswordFieldErrors(form('tuffah24', 'tuffah24'))).toEqual({});
  });

  test('an untouched form is answered with "required", not with advice', () => {
    expect(setPasswordFieldErrors(form('', ''))).toEqual({
      password: 'passwordRequired',
      confirmPassword: 'confirmPasswordRequired',
    });
  });

  test('an empty confirm box is its own message, not a mismatch', () => {
    expect(setPasswordFieldErrors(form('tuffah24', ''))).toEqual({
      confirmPassword: 'confirmPasswordRequired',
    });
  });

  test('reports the length rule and the mismatch separately', () => {
    expect(setPasswordFieldErrors(form('tuf4', 'tuf5'))).toEqual({
      password: 'passwordTooShort',
      confirmPassword: 'passwordMismatch',
    });
  });

  test('long enough but letters only is too weak, not too short', () => {
    expect(setPasswordFieldErrors(form('tuffahhh', 'tuffahhh'))).toEqual({
      password: 'clientPasswordTooWeak',
    });
  });

  test('a common password gets its own sentence', () => {
    expect(setPasswordFieldErrors(form('12345678', '12345678'))).toEqual({
      password: 'passwordTooCommon',
    });
  });

  /*
    A password is not trimmed before the blank test, unlike a name or an email.
    Spaces are legal in a password and are part of the value the account will be
    created with — calling this one empty would reject something the server
    would then happily accept.
  */
  test('a password of spaces is a value, not a blank', () => {
    expect(setPasswordFieldErrors(form('        ', '        ')).password).not.toBe(
      'passwordRequired',
    );
  });
});

describe('firstSetPasswordMessage', () => {
  test('leads with the mismatch when both fields failed', () => {
    const errors = setPasswordFieldErrors(form('tuf4', 'tuf5'));
    expect(firstSetPasswordMessage(errors)).toBe('passwordMismatch');
  });

  test('falls through to the password when only it failed', () => {
    const errors = setPasswordFieldErrors(form('tuffahhh', 'tuffahhh'));
    expect(firstSetPasswordMessage(errors)).toBe('clientPasswordTooWeak');
  });

  test('is undefined for a valid form, which the caller reads as "nothing to say"', () => {
    expect(firstSetPasswordMessage({})).toBeUndefined();
  });
});

describe('readSetPasswordForm', () => {
  test('reads the three fields the schema parses', () => {
    const data = new FormData();
    data.set('password', 'tuffah24');
    data.set('confirmPassword', 'tuffah24');
    data.set('locale', 'ar');

    expect(readSetPasswordForm(data)).toEqual({
      password: 'tuffah24',
      confirmPassword: 'tuffah24',
      locale: 'ar',
    });
  });

  test('a missing field reads as null, which the schema rejects rather than coerces', () => {
    expect(readSetPasswordForm(new FormData()).password).toBeNull();
  });
});
