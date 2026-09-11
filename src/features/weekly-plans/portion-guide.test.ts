import { describe, expect, test } from 'bun:test';

import { groupPortionGuide, type PortionGuideEntry } from './portion-guide';

/**
 * The settings guide is a rendering of the catalog, so the only thing with logic
 * in it is the grouping: which measure a food lands under, and in what order a
 * dietitian reads them.
 */

function entry(overrides: Partial<PortionGuideEntry> & Pick<PortionGuideEntry, 'key'>): PortionGuideEntry {
  return {
    foodId: overrides.nameAr ?? overrides.key,
    nameAr: 'صنف',
    nameEn: 'Food',
    labelAr: 'وحدة',
    labelEn: 'Unit',
    grams: 25,
    reviewStatus: 'reviewed',
    rangeGrams: null,
    ...overrides,
  };
}

describe('grouping the guide', () => {
  test('the ambiguous units are read first', () => {
    const sections = groupPortionGuide([
      entry({ key: 'piece', nameAr: 'بيض' }),
      entry({ key: 'level-tablespoon', nameAr: 'زيت زيتون' }),
      entry({ key: 'loaf', nameAr: 'خبز' }),
      entry({ key: 'heaped-spoon', nameAr: 'أرز' }),
    ]);

    // Spoons before bread before pieces: the spoons are why the page exists, and
    // bread is the food a plan writes most.
    expect(sections.map((section) => section.group)).toEqual([
      'heaped_spoon',
      'level_spoon',
      'loaf',
      'piece',
    ]);
  });

  test('a group nobody has a food for is not an empty heading', () => {
    const sections = groupPortionGuide([entry({ key: 'cup' })]);

    expect(sections).toHaveLength(1);
    expect(sections[0]!.group).toBe('cup');
  });

  test('the fractions sit with the whole unit they are part of', () => {
    // A half cup is a cup, and a half loaf is bread. Grouping by measure rather
    // than by key is what keeps them from becoming headings of their own.
    const sections = groupPortionGuide([
      entry({ key: 'half-cup', nameAr: 'أ' }),
      entry({ key: 'cup', nameAr: 'ب' }),
      entry({ key: 'half-loaf', nameAr: 'ج' }),
      entry({ key: 'loaf', nameAr: 'د' }),
    ]);

    expect(sections.map((section) => [section.group, section.entries.length])).toEqual([
      ['loaf', 2],
      ['cup', 2],
    ]);
  });

  test('foods read in Arabic alphabetical order inside a group', () => {
    const sections = groupPortionGuide([
      entry({ key: 'heaped-spoon', nameAr: 'عدس مطبوخ' }),
      entry({ key: 'heaped-spoon', nameAr: 'أرز أبيض مطبوخ' }),
      entry({ key: 'heaped-spoon', nameAr: 'برغل مطبوخ' }),
    ]);

    expect(sections[0]!.entries.map((one) => one.nameAr)).toEqual([
      'أرز أبيض مطبوخ',
      'برغل مطبوخ',
      'عدس مطبوخ',
    ]);
  });

  test('an empty catalog is an empty guide, not a page of headings', () => {
    expect(groupPortionGuide([])).toEqual([]);
  });
});
