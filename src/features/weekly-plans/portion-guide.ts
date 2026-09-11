/**
 * The measurements the clinic actually writes in, as one readable table.
 *
 * ## Why this is generated rather than written
 *
 * A dietitian needs to answer one question quickly: *when I write «٦ ملاعق أرز»,
 * what is the app counting?* That answer already exists — it is
 * `catalog_food_portions` — so this page reads it rather than restating it.
 *
 * A hand-maintained table of measurements would be a second copy of facts the
 * database already holds, and it would drift from them within a month. That is
 * the same defect the portion contract was built to remove: one fact, two
 * places, no way to tell which is lying. A page that can only ever *show* what
 * the plans use cannot disagree with them.
 *
 * ## One row per food, not one per portion
 *
 * The catalog holds 387 portions; a food offers several and is *written* in one.
 * The written one is what belongs here — the default a fresh line opens in, and
 * the unit a generated plan uses. The rest are entry conveniences and would turn
 * a reference into a wall.
 *
 * @see docs/audits/2026-09-10-portion-contract.md
 */

import { measureOf, type PortionKey, type ReviewStatus } from './portion-contract';

/** One line of the guide: a food, the unit it is written in, and what that weighs. */
export type PortionGuideEntry = {
  foodId: string;
  nameAr: string;
  nameEn: string;
  /** The portion's label, already carrying ممتلئة/ممسوحة where that matters. */
  labelAr: string;
  labelEn: string;
  grams: number;
  key: PortionKey;
  reviewStatus: ReviewStatus;
  /** The spread behind the number, where one was recorded. */
  rangeGrams: readonly [number, number] | null;
};

/**
 * The order the groups are read in.
 *
 * Spoons first because they are the ambiguous ones and the reason this page
 * exists; bread second because it is the food a plan writes most. Everything
 * after is reference.
 */
export const GUIDE_GROUPS = [
  'heaped_spoon',
  'level_spoon',
  'loaf',
  'slice',
  'piece',
  'cup',
  'container',
  'serving',
  'leaf',
] as const;

export type GuideGroup = (typeof GUIDE_GROUPS)[number];

export type PortionGuideSection = {
  group: GuideGroup;
  entries: PortionGuideEntry[];
};

/**
 * Groups the entries by how the unit is measured, dropping empty groups.
 *
 * Sorted by Arabic name inside each group with `localeCompare`, so الأرز sorts
 * before البرغل the way a reader expects rather than by code point.
 */
export function groupPortionGuide(
  entries: readonly PortionGuideEntry[],
): PortionGuideSection[] {
  const byGroup = new Map<GuideGroup, PortionGuideEntry[]>();

  for (const entry of entries) {
    const group = measureOf(entry.key) as GuideGroup;
    const bucket = byGroup.get(group);
    if (bucket) bucket.push(entry);
    else byGroup.set(group, [entry]);
  }

  return GUIDE_GROUPS.flatMap((group) => {
    const found = byGroup.get(group);
    if (!found?.length) return [];

    return [
      {
        group,
        entries: [...found].sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar')),
      },
    ];
  });
}

/**
 * How many of this unit make one ordinary serving, where saying so helps.
 *
 * Not a rule the engine reads — it is a sentence under the table. Three heaped
 * spoons of rice being a starch exchange is the fact that makes the number
 * usable, and it is the kind of thing a dietitian checks a table for.
 */
export function servingHint(entry: PortionGuideEntry): string | null {
  if (measureOf(entry.key) !== 'heaped_spoon') return null;
  return `3 × ${entry.grams} g = ${entry.grams * 3} g`;
}
