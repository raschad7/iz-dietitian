import { notFound } from 'next/navigation';

import { resolveLocale } from '@/i18n/params';
import { isMember } from '@/lib/enum';
import { NutritionRulesSettings } from '@/features/weekly-plans/components/nutrition-rules-settings';
import { PortionGuideSettings } from '@/features/weekly-plans/components/portion-guide-settings';
import {
  BMR_SOURCES,
  DEFAULT_NUTRITION_RULES,
  PROTEIN_BASES,
} from '@/features/weekly-plans/nutrition-rules';
import type { PortionGuideEntry } from '@/features/weekly-plans/portion-guide';

type DevSettingsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ basis?: string; rate?: string; bmr?: string }>;
};

/**
 * A dev-only harness for the Settings sections that are hard to look at.
 *
 * The same reasoning `/dev/measurements` and `/dev/admin` write down: Settings
 * sits behind the staff session guard and browser automation may not enter a
 * password, so the one screen being changed was the one screen nobody could
 * see. This renders the real `NutritionRulesSettings` over rules taken from the
 * query string, so both rows, both dialogs and every basis hint can be driven
 * and screenshotted at any width in either language.
 *
 * The measurements guide is here too, over a fixture rather than the catalog:
 * it is read-only, so what there is to look at is the grouping, the Arabic
 * column order and how a three-column table behaves at 390px.
 *
 * `?basis=`, `?rate=` and `?bmr=` are the whole point. Each row states its
 * value as a sentence and each basis carries a different hint under it — six
 * combinations that a fixture would have to pick one of.
 *
 * ⚠ **Saving does not work here and is not meant to.**
 * `saveNutritionRulesAction` calls `requireStaffClinic`, so submitting either
 * dialog redirects to the sign-in page. What this harness is for is the reading
 * and the layout: the rows, the dialog fields, the live hint under the basis
 * select, and how all of it behaves in Arabic.
 *
 * Dev-only: 404 in production. It ships no data access and no session guard,
 * and must never acquire either — the same contract as every other `/dev`
 * route.
 */
export default async function DevSettingsPage({ params, searchParams }: DevSettingsPageProps) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const locale = await resolveLocale(params);
  const query = await searchParams;

  const rate = Number(query.rate);

  return (
    <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <NutritionRulesSettings
        locale={locale}
        rules={{
          proteinPerKg: Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_NUTRITION_RULES.proteinPerKg,
          proteinBasis: isMember(PROTEIN_BASES, query.basis)
            ? query.basis
            : DEFAULT_NUTRITION_RULES.proteinBasis,
          /* The clinic's per-case rates — the athlete and the two renal rows. */
          proteinRates: DEFAULT_NUTRITION_RULES.proteinRates,
          bmrSource: isMember(BMR_SOURCES, query.bmr)
            ? query.bmr
            : DEFAULT_NUTRITION_RULES.bmrSource,
        }}
      />

      <PortionGuideSettings locale={locale} entries={GUIDE_FIXTURE} />
    </main>
  );
}

/**
 * A slice of the real catalog, chosen to exercise every group the guide draws
 * and the two things that make it worth looking at: a food carrying both spoons,
 * and a weight with a recorded spread beside it.
 */
const GUIDE_FIXTURE: PortionGuideEntry[] = [
  {
    foodId: 'rice',
    nameAr: 'أرز أبيض مطبوخ',
    nameEn: 'White rice, cooked',
    key: 'heaped-spoon',
    labelAr: 'ملعقة ممتلئة',
    labelEn: 'Heaped spoon',
    grams: 25,
    reviewStatus: 'reviewed',
    rangeGrams: [21, 26],
  },
  {
    foodId: 'labaneh',
    nameAr: 'لبنة',
    nameEn: 'Labaneh',
    key: 'heaped-spoon',
    labelAr: 'ملعقة ممتلئة',
    labelEn: 'Heaped spoon',
    grams: 30,
    reviewStatus: 'reviewed',
    rangeGrams: [27, 33],
  },
  {
    foodId: 'olive-oil',
    nameAr: 'زيت زيتون',
    nameEn: 'Olive oil',
    key: 'level-tablespoon',
    labelAr: 'ملعقة كبيرة',
    labelEn: 'Tablespoon',
    grams: 13.5,
    reviewStatus: 'reviewed',
    rangeGrams: [13.5, 14.5],
  },
  {
    foodId: 'pita',
    nameAr: 'خبز عربي أبيض',
    nameEn: 'White pita bread',
    key: 'loaf',
    labelAr: 'رغيف',
    labelEn: 'Loaf',
    grams: 90,
    reviewStatus: 'reviewed',
    rangeGrams: [90, 100],
  },
  {
    foodId: 'toast',
    nameAr: 'خبز توست أسمر',
    nameEn: 'Wholewheat toast',
    key: 'slice',
    labelAr: 'شريحة',
    labelEn: 'Slice',
    grams: 28,
    reviewStatus: 'reviewed',
    rangeGrams: [26, 30],
  },
  {
    foodId: 'egg',
    nameAr: 'بيض',
    nameEn: 'Egg',
    key: 'piece',
    labelAr: 'حبة',
    labelEn: 'Piece',
    grams: 50,
    reviewStatus: 'needs_review',
    rangeGrams: null,
  },
  {
    foodId: 'cucumber',
    nameAr: 'خيار',
    nameEn: 'Cucumber',
    key: 'piece',
    labelAr: 'حبة',
    labelEn: 'Piece',
    grams: 110,
    reviewStatus: 'reviewed',
    rangeGrams: [100, 120],
  },
  {
    foodId: 'yogurt',
    nameAr: 'لبن رائب كامل الدسم',
    nameEn: 'Whole yogurt',
    key: 'cup',
    labelAr: 'كوب',
    labelEn: 'Cup',
    grams: 245,
    reviewStatus: 'reviewed',
    rangeGrams: [240, 250],
  },
  {
    foodId: 'chickpeas',
    nameAr: 'حمص معلب',
    nameEn: 'Canned chickpeas',
    key: 'container',
    labelAr: 'علبة',
    labelEn: 'Container',
    grams: 240,
    reviewStatus: 'reviewed',
    rangeGrams: [220, 250],
  },
];
