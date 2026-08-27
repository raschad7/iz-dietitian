import { describe, expect, test } from 'bun:test';

import { pickPortalUsername, portalUsernameBase } from './portal-username';

/** The country a bare local number is read as, matching `phone.test.ts`. */
const CC = '970';

describe('portalUsernameBase', () => {
  test('uses the phone number, written the way its owner writes it', () => {
    expect(portalUsernameBase({ fullName: 'أحمد خليل', phone: '0599123456' }, CC)).toEqual({
      value: '0599123456',
      fromPhone: true,
    });
  });

  test('drops the country code and keeps the trunk zero', () => {
    const base = portalUsernameBase({ fullName: 'Layla', phone: '+970599123456' }, CC).value;

    expect(base).toBe('0599123456');
    expect(base.startsWith(CC)).toBe(false);
  });

  test('reads every written shape of one number to the same base', () => {
    const bases = ['0599123456', '+970599123456', '00970599123456', ' (059) 912-3456 '].map(
      (phone) => portalUsernameBase({ fullName: 'Layla Haddad', phone }, CC).value,
    );

    expect(new Set(bases).size).toBe(1);
  });

  /*
    The trunk zero is a national prefix, so stripping a foreign country code
    would hand a different subscriber the same username as a local one.
  */
  test('keeps a foreign country code rather than making it look local', () => {
    expect(portalUsernameBase({ fullName: 'Layla', phone: '+972599123456' }, CC).value).toBe(
      '972599123456',
    );
  });

  test('does not collide a foreign number with the local number it resembles', () => {
    const foreign = portalUsernameBase({ fullName: 'Layla', phone: '+972599123456' }, CC).value;
    const local = portalUsernameBase({ fullName: 'Sara', phone: '0599123456' }, CC).value;

    expect(foreign).not.toBe(local);
  });

  test('contains only digits, so nothing has to be transliterated', () => {
    expect(portalUsernameBase({ fullName: 'علي حسن سلوكة', phone: '0599123456' }, CC).value).toMatch(
      /^[0-9]+$/,
    );
  });

  test('falls back to the name for a client with no phone at all', () => {
    expect(portalUsernameBase({ fullName: 'أحمد خليل', phone: null }, CC)).toEqual({
      value: 'ahmd',
      fromPhone: false,
    });
    expect(portalUsernameBase({ fullName: 'Layla Haddad' }, CC).value).toBe('layla');
  });

  test('falls back to the name rather than guessing at something that is not a number', () => {
    expect(portalUsernameBase({ fullName: 'Layla Haddad', phone: 'no phone' }, CC).fromPhone).toBe(
      false,
    );
    expect(portalUsernameBase({ fullName: 'Layla Haddad', phone: '123' }, CC).fromPhone).toBe(false);
    expect(portalUsernameBase({ fullName: 'Layla Haddad', phone: '   ' }, CC).fromPhone).toBe(false);
  });
});

describe('pickPortalUsername', () => {
  const phone = { value: '0599123456', fromPhone: true } as const;

  test('offers the number itself when nobody holds it', () => {
    expect(pickPortalUsername(phone, new Set())).toBe('0599123456');
  });

  test('numbers the second person on a shared phone', () => {
    expect(pickPortalUsername(phone, new Set(['0599123456']))).toBe('0599123456-2');
  });

  test('keeps counting for the rest of the household', () => {
    const taken = new Set(['0599123456', '0599123456-2', '0599123456-3']);
    expect(pickPortalUsername(phone, taken)).toBe('0599123456-4');
  });

  test('ignores usernames built on another number', () => {
    expect(pickPortalUsername(phone, new Set(['0599999999', '0599999999-2']))).toBe(
      '0599123456',
    );
  });

  test('reaches for a random code once the counter is exhausted', () => {
    const taken = new Set(['0599123456']);
    for (let nth = 2; nth <= 20; nth += 1) taken.add(`0599123456-${nth}`);

    const picked = pickPortalUsername(phone, taken);
    expect(taken.has(picked)).toBe(false);
    expect(picked).toMatch(/^0599123456-[a-z0-9]{4,}$/);
  });

  test('a name base keeps the random-code scheme it always had', () => {
    const picked = pickPortalUsername({ value: 'ahmd', fromPhone: false }, new Set());

    expect(picked).toMatch(/^ahmd-[a-z0-9]{4}$/);
    // Never the bare name: that is the pair the code scheme exists to avoid.
    expect(picked).not.toBe('ahmd');
  });

  /*
    The property the whole scheme exists for: feed it every username it has
    already produced and it can never produce one of them again.
  */
  test('never returns a username already in use, over many draws on one phone', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      const username = pickPortalUsername(phone, taken);
      expect(taken.has(username)).toBe(false);
      taken.add(username);
    }
    expect(taken.size).toBe(100);
  });
});
