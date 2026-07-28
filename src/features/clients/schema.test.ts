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
      heightCm: '',
      goal: '',
      dateOfBirth: '',
    });
    expect(result.success).toBe(true);
    expect(result.data?.phone).toBeUndefined();
    expect(result.data?.email).toBeUndefined();
    expect(result.data?.heightCm).toBeUndefined();
    expect(result.data?.goal).toBeUndefined();
  });

  test('coerces a numeric string height', () => {
    const result = clientFormSchema.safeParse({ ...minimal, heightCm: '172' });
    expect(result.data?.heightCm).toBe(172);
  });

  test('rejects an implausible height', () => {
    expect(clientFormSchema.safeParse({ ...minimal, heightCm: '500' }).success).toBe(false);
  });

  test('lowercases and trims email', () => {
    const result = clientFormSchema.safeParse({ ...minimal, email: '  Sara@Clinic.PS ' });
    expect(result.data?.email).toBe('sara@clinic.ps');
  });

  test('rejects a malformed email', () => {
    expect(clientFormSchema.safeParse({ ...minimal, email: 'not-an-email' }).success).toBe(false);
  });

  test('rejects an unknown enum value', () => {
    expect(clientFormSchema.safeParse({ ...minimal, goal: 'become_taller' }).success).toBe(false);
  });

  test('rejects a malformed date of birth', () => {
    expect(clientFormSchema.safeParse({ ...minimal, dateOfBirth: '15/06/1990' }).success).toBe(false);
  });

  test('defaults preferredLocale to Arabic', () => {
    expect(clientFormSchema.safeParse(minimal).data?.preferredLocale).toBe('ar');
  });

  test('reports the offending field so the form can highlight it', () => {
    const result = clientFormSchema.safeParse({ fullName: '', heightCm: '999' });
    expect(result.success).toBe(false);
    const fieldErrors = result.error ? Object.keys(z.flattenError(result.error).fieldErrors) : [];
    expect(fieldErrors).toContain('fullName');
    expect(fieldErrors).toContain('heightCm');
  });
});

describe('listClientsSchema', () => {
  test('defaults to active clients on page one', () => {
    const result = listClientsSchema.parse({});
    expect(result.status).toBe('active');
    expect(result.page).toBe(1);
    expect(result.q).toBeUndefined();
  });

  test('falls back to defaults instead of throwing on junk input', () => {
    const result = listClientsSchema.parse({ status: 'nonsense', page: 'abc' });
    expect(result.status).toBe('active');
    expect(result.page).toBe(1);
  });

  test('accepts the all filter and a page number', () => {
    const result = listClientsSchema.parse({ status: 'all', page: '3', q: '  أحمد ' });
    expect(result.status).toBe('all');
    expect(result.page).toBe(3);
    expect(result.q).toBe('أحمد');
  });
});
