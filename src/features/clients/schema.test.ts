import { describe, expect, test } from 'bun:test';
import { z } from 'zod';

import { clientFormSchema, listClientsSchema } from './schema';

const minimal = { fullName: 'أحمد خليل' };

describe('clientFormSchema', () => {
  test('accepts a client with only a name', () => {
    const result = clientFormSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    expect(result.data?.fullName).toBe('أحمد خليل');
  });

  test('rejects a name shorter than two characters', () => {
    expect(clientFormSchema.safeParse({ fullName: 'ا' }).success).toBe(false);
  });

  test('treats blank optional fields as absent', () => {
    const result = clientFormSchema.safeParse({
      ...minimal,
      phone: '',
      email: '',
      dateOfBirth: '',
      sex: '',
    });
    expect(result.success).toBe(true);
    expect(result.data?.phone).toBeUndefined();
    expect(result.data?.email).toBeUndefined();
    expect(result.data?.dateOfBirth).toBeUndefined();
    expect(result.data?.sex).toBeUndefined();
  });

  test('lowercases and trims email', () => {
    const result = clientFormSchema.safeParse({ ...minimal, email: '  Sara@Clinic.PS ' });
    expect(result.data?.email).toBe('sara@clinic.ps');
  });

  test('rejects a malformed email', () => {
    expect(clientFormSchema.safeParse({ ...minimal, email: 'not-an-email' }).success).toBe(false);
  });

  test('rejects an unknown enum value', () => {
    expect(clientFormSchema.safeParse({ ...minimal, sex: 'unknown' }).success).toBe(false);
  });

  // The clinical fields moved to `intakeSchema`; the card must not silently
  // accept and then drop one, which is how a height typed into the wrong form
  // would vanish without an error.
  test('ignores clinical fields — they belong to the intake', () => {
    const result = clientFormSchema.safeParse({ ...minimal, heightCm: '172', goal: 'weight_loss' });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('heightCm');
    expect(result.data).not.toHaveProperty('goal');
  });

  test('rejects a malformed date of birth', () => {
    expect(clientFormSchema.safeParse({ ...minimal, dateOfBirth: '15/06/1990' }).success).toBe(false);
  });

  test('defaults preferredLocale to Arabic', () => {
    expect(clientFormSchema.safeParse(minimal).data?.preferredLocale).toBe('ar');
  });

  test('reports the offending field so the form can highlight it', () => {
    const result = clientFormSchema.safeParse({ fullName: '', email: 'not-an-email' });
    expect(result.success).toBe(false);
    const fieldErrors = result.error ? Object.keys(z.flattenError(result.error).fieldErrors) : [];
    expect(fieldErrors).toContain('fullName');
    expect(fieldErrors).toContain('email');
  });
});

describe('listClientsSchema', () => {
  test('defaults to an unfiltered page one', () => {
    const result = listClientsSchema.parse({});
    expect(result.filterBy).toBeUndefined();
    expect(result.filterValue).toBeUndefined();
    expect(result.page).toBe(1);
    expect(result.q).toBeUndefined();
  });

  test('falls back to defaults instead of throwing on junk input', () => {
    const result = listClientsSchema.parse({ filterBy: 'nonsense', page: 'abc' });
    expect(result.filterBy).toBeUndefined();
    expect(result.page).toBe(1);
  });

  test('accepts a filter column, its value and a page number', () => {
    const result = listClientsSchema.parse({
      filterBy: 'portalAccess',
      filterValue: ' yes ',
      page: '3',
      q: '  أحمد ',
    });
    expect(result.filterBy).toBe('portalAccess');
    expect(result.filterValue).toBe('yes');
    expect(result.page).toBe(3);
    expect(result.q).toBe('أحمد');
  });

  test('status is the route\'s to set, and defaults to the active register', () => {
    // It is no longer a `filterBy` value: archived clients have their own page,
    // and a hand-edited query string must not swap one list for the other.
    expect(listClientsSchema.parse({}).status).toBe('active');
    expect(listClientsSchema.parse({ status: 'archived' }).status).toBe('archived');
    expect(listClientsSchema.parse({ status: 'nonsense' }).status).toBe('active');
    expect(listClientsSchema.parse({ filterBy: 'status' }).filterBy).toBeUndefined();
  });

  test('defaults to newest first', () => {
    const result = listClientsSchema.parse({});
    expect(result.sort).toBe('createdAt');
    expect(result.dir).toBe('desc');
  });

  test('accepts a sortable column and a direction', () => {
    const result = listClientsSchema.parse({ sort: 'fullName', dir: 'asc' });
    expect(result.sort).toBe('fullName');
    expect(result.dir).toBe('asc');
  });

  /* The sort key picks an ORDER BY, so a column name off the allowlist must
     never reach the query builder. */
  test('rejects a sort column that is not on the allowlist', () => {
    const result = listClientsSchema.parse({ sort: 'passwordHash', dir: 'sideways' });
    expect(result.sort).toBe('createdAt');
    expect(result.dir).toBe('desc');
  });
});
