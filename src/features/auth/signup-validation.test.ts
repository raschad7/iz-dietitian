import { describe, expect, test } from 'bun:test';

import {
  firstSignUpMessage,
  readSignUpForm,
  signUpFieldErrors,
} from './signup-validation';

const form = (overrides: Record<string, string> = {}) => {
  const data = new FormData();
  data.set('firstName', 'Rania');
  data.set('lastName', 'Khalil');
  data.set('email', 'rania@clinic.ps');
  // A letter and a digit, which is the whole of the strength rule now — see the
  // note on `staffPasswordSchema`. It used to be `a-long-enough-password`, which
  // passed the old staff rule on letters and symbols and holds no digit at all.
  data.set('password', 'rania-clinic-2024');
  data.set('confirmPassword', 'rania-clinic-2024');
  data.set('locale', 'ar');
  for (const [key, value] of Object.entries(overrides)) data.set(key, value);
  return readSignUpForm(data);
};

describe('signUpFieldErrors', () => {
  test('accepts a complete form', () => {
    expect(signUpFieldErrors(form())).toEqual({});
  });

  test('names the email as invalid rather than letting the browser say it', () => {
    // The exact case from the report: "ahmad" with no @. The browser used to
    // answer this in its own language, in a bubble nothing here can translate.
    expect(signUpFieldErrors(form({ email: 'ahmad' }))).toEqual({ email: 'invalidEmail' });
  });

  test('reports an empty form field by field, each one asked for by name', () => {
    expect(
      signUpFieldErrors(
        form({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '' }),
      ),
    ).toEqual({
      firstName: 'firstNameRequired',
      lastName: 'lastNameRequired',
      email: 'emailRequired',
      password: 'passwordRequired',
      // Not "they disagree" — two empty boxes agree perfectly, so the schema's
      // comparison raises nothing and only the blank check can speak.
      confirmPassword: 'confirmPasswordRequired',
    });
  });

  test('flags the confirmation when the two passwords disagree', () => {
    expect(signUpFieldErrors(form({ confirmPassword: 'something-else' }))).toEqual({
      confirmPassword: 'passwordMismatch',
    });
  });

  test('flags a short password on the password field', () => {
    expect(signUpFieldErrors(form({ password: 'short', confirmPassword: 'short' }))).toEqual({
      password: 'passwordTooShort',
    });
  });

  test('a long-enough password with no digit is still not a password', () => {
    // Staff take the client rule now — a letter AND a digit, both required.
    // This used to answer `passwordTooWeak`, the old "two of three classes"
    // sentence about symbols, which no schema raises any more.
    expect(signUpFieldErrors(form({ password: 'aaaaaaaaaa', confirmPassword: 'aaaaaaaaaa' }))).toEqual({
      password: 'clientPasswordTooWeak',
    });
  });

  test('refuses one of the handful of passwords everybody picks', () => {
    // Long enough and mixed, and still the first thing an attacker tries. It
    // gets its own sentence rather than the generic strength one.
    expect(signUpFieldErrors(form({ password: '123456789', confirmPassword: '123456789' }))).toEqual({
      password: 'passwordTooCommon',
    });
  });

  test('refuses a name half over the ten-character limit', () => {
    expect(signUpFieldErrors(form({ firstName: 'Abdelrahman' }))).toEqual({
      firstName: 'nameTooLong',
    });
  });

  test('trims before judging, so spaces are not a name or an address', () => {
    expect(signUpFieldErrors(form({ lastName: '   ' }))).toEqual({ lastName: 'lastNameRequired' });
    expect(signUpFieldErrors(form({ email: '  rania@clinic.ps  ' }))).toEqual({});
  });
});

describe('firstSignUpMessage', () => {
  test('is undefined for a valid form', () => {
    expect(firstSignUpMessage(signUpFieldErrors(form()))).toBeUndefined();
  });

  test('leads with the mismatch, the most specific thing that can be wrong', () => {
    // Both password boxes were filled and simply disagree, which is a more
    // useful sentence than restating that the form is incomplete.
    const errors = signUpFieldErrors(form({ firstName: '', confirmPassword: 'other' }));
    expect(firstSignUpMessage(errors)).toBe('passwordMismatch');
  });

  test('falls back through password, email, then the name halves', () => {
    expect(firstSignUpMessage({ password: 'passwordTooShort', email: 'invalidEmail' })).toBe('passwordTooShort');
    expect(firstSignUpMessage({ email: 'invalidEmail', firstName: 'firstNameRequired' })).toBe('invalidEmail');
    expect(firstSignUpMessage({ lastName: 'lastNameRequired', firstName: 'firstNameRequired' })).toBe(
      'lastNameRequired',
    );
  });

  test('preserves the priority the server action used before it shared this code', () => {
    // Pinned so the client and the action cannot drift apart: whatever the form
    // shows first is what the server would have said on its own.
    const errors = signUpFieldErrors(
      form({ firstName: '', email: 'nope', password: 'x', confirmPassword: 'y' }),
    );
    expect(firstSignUpMessage(errors)).toBe('passwordMismatch');
  });
});
