import { describe, expect, test } from 'bun:test';

import { profileInputKey } from './nutrition-profile-form';

describe('profileInputKey', () => {
  test('changes when a server-provided default changes', () => {
    expect(profileInputKey(null)).not.toBe(profileInputKey(84));
    expect(profileInputKey(84)).not.toBe(profileInputKey(82));
  });

  test('stays stable while the server-provided default is unchanged', () => {
    expect(profileInputKey(84)).toBe(profileInputKey(84));
  });
});
