import { beforeEach, describe, expect, test } from 'bun:test';

import { archiveClient, createClient } from '@/features/clients/mutations';

import { createTestClinic, resetDatabase } from '../../../tests/helpers';
import { listPaletteClients, searchClientsForPalette } from './queries';

let clinicId: string;

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
});

describe('searchClientsForPalette', () => {
  test('finds a client written with hamza when searching without it', async () => {
    await createClient(clinicId, { fullName: 'أحمد خليل', preferredLocale: 'ar' });

    const rows = await searchClientsForPalette(clinicId, 'احمد');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fullName).toBe('أحمد خليل');
  });

  test('finds a client written without hamza when searching with it', async () => {
    await createClient(clinicId, { fullName: 'احمد خليل', preferredLocale: 'ar' });
    expect(await searchClientsForPalette(clinicId, 'أحمد')).toHaveLength(1);
  });

  /* A blank field is the recents band's territory, not an alphabetical slice of
     the roster. See the note on the query. */
  test('returns nothing for a blank query', async () => {
    await createClient(clinicId, { fullName: 'سارة القحطاني', preferredLocale: 'ar' });

    expect(await searchClientsForPalette(clinicId, '')).toEqual([]);
    expect(await searchClientsForPalette(clinicId, '   ')).toEqual([]);
  });

  test('never reaches past the caller’s own clinic', async () => {
    const other = await createTestClinic();
    await createClient(other, { fullName: 'أحمد خليل', preferredLocale: 'ar' });

    expect(await searchClientsForPalette(clinicId, 'احمد')).toEqual([]);
  });

  /* Archiving is how a dietitian takes someone out of their working set; a
     quick-jump list that hands them straight back undoes it. */
  test('leaves archived clients out', async () => {
    const { id } = await createClient(clinicId, { fullName: 'أحمد خليل', preferredLocale: 'ar' });
    await archiveClient(clinicId, id);

    expect(await searchClientsForPalette(clinicId, 'احمد')).toEqual([]);
  });

  test('honours the row limit', async () => {
    for (let n = 0; n < 5; n += 1) {
      await createClient(clinicId, { fullName: `أحمد ${n}`, preferredLocale: 'ar' });
    }

    expect(await searchClientsForPalette(clinicId, 'احمد', 3)).toHaveLength(3);
  });
});

describe('listPaletteClients', () => {
  /* The picker's opening list answers the opposite question to the search
     above: "who can I choose", not "who did you ask for". */
  test('returns the roster for a blank picker, alphabetically', async () => {
    await createClient(clinicId, { fullName: 'خالد', preferredLocale: 'ar' });
    await createClient(clinicId, { fullName: 'أحمد', preferredLocale: 'ar' });
    await createClient(clinicId, { fullName: 'سارة', preferredLocale: 'ar' });

    const rows = await listPaletteClients(clinicId);
    expect(rows.map((row) => row.fullName)).toEqual(['أحمد', 'خالد', 'سارة']);
  });

  test('never reaches past the caller’s own clinic', async () => {
    const other = await createTestClinic();
    await createClient(other, { fullName: 'أحمد', preferredLocale: 'ar' });

    expect(await listPaletteClients(clinicId)).toEqual([]);
  });

  test('leaves archived clients out', async () => {
    const { id } = await createClient(clinicId, { fullName: 'أحمد', preferredLocale: 'ar' });
    await archiveClient(clinicId, id);

    expect(await listPaletteClients(clinicId)).toEqual([]);
  });

  test('honours the row limit', async () => {
    for (let n = 0; n < 5; n += 1) {
      await createClient(clinicId, { fullName: `مشترك ${n}`, preferredLocale: 'ar' });
    }

    expect(await listPaletteClients(clinicId, 3)).toHaveLength(3);
  });
});
