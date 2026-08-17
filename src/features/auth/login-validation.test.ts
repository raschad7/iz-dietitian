import { describe, expect, test } from 'bun:test';

import { loginFieldErrors, portalFieldErrors } from './login-validation';

describe('loginFieldErrors', () => {
  test('names each empty field rather than failing the form as a whole', () => {
    expect(loginFieldErrors({ email: '', password: '' })).toEqual({
      email: 'emailRequired',
      password: 'passwordRequired',
    });
  });

  test('treats whitespace as empty', () => {
    expect(loginFieldErrors({ email: '   ', password: 'x' }).email).toBe('emailRequired');
  });

  test('asks for a valid address only once one has been attempted', () => {
    expect(loginFieldErrors({ email: 'nope', password: 'x' }).email).toBe('invalidEmail');
  });

  test('passes a filled form', () => {
    expect(loginFieldErrors({ email: ' A@B.co ', password: 'x' })).toEqual({});
  });
});

describe('portalFieldErrors', () => {
  test('names each empty field', () => {
    expect(portalFieldErrors({ username: '', password: '' })).toEqual({
      username: 'usernameRequired',
      password: 'passwordRequired',
    });
  });

  /* A client never picks their own username, so length is not their mistake. */
  test('does not complain about a short username', () => {
    expect(portalFieldErrors({ username: 'ab', password: 'x' })).toEqual({});
  });
});
