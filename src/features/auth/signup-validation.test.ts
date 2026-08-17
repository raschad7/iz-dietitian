import { describe, expect, test } from 'bun:test';

import {
  firstSignUpMessage,
  readSignUpForm,
  signUpFieldErrors,
} from './signup-validation';

const form = (overrides: Record<string, string> = {}) => {
  const data = new FormData();
  data.set('name', 'Rania Khalil');
  data.set('email', 'rania@clinic.ps');
  data.set('password', 'a-long-enough-password');
  data.set('confirmPassword', 'a-long-enough-password');
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

  test('reports an empty form field by field', () => {
    expect(signUpFieldErrors(form({ name: '', email: '', password: '', confirmPassword: '' }))).toEqual({
      name: 'nameRequired',
      email: 'invalidEmail',
      password: 'passwordTooShort',
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

  test('a name of one character is not a name', () => {
    expect(signUpFieldErrors(form({ name: 'R' }))).toEqual({ name: 'nameRequired' });
  });

  test('trims before judging, so spaces are not a name or an address', () => {
    expect(signUpFieldErrors(form({ name: '   ' }))).toEqual({ name: 'nameRequired' });
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
    const errors = signUpFieldErrors(form({ name: '', confirmPassword: 'other' }));
    expect(firstSignUpMessage(errors)).toBe('passwordMismatch');
  });

  test('falls back through password, email, then name', () => {
    expect(firstSignUpMessage({ password: 'passwordTooShort', email: 'invalidEmail' })).toBe('passwordTooShort');
    expect(firstSignUpMessage({ email: 'invalidEmail', name: 'nameRequired' })).toBe('invalidEmail');
    expect(firstSignUpMessage({ name: 'nameRequired' })).toBe('nameRequired');
  });

  test('preserves the priority the server action used before it shared this code', () => {
    // Pinned so the client and the action cannot drift apart: whatever the form
    // shows first is what the server would have said on its own.
    const errors = signUpFieldErrors(form({ name: '', email: 'nope', password: 'x', confirmPassword: 'y' }));
    expect(firstSignUpMessage(errors)).toBe('passwordMismatch');
  });
});
