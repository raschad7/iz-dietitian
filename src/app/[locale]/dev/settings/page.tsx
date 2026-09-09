import { notFound } from 'next/navigation';

import { resolveLocale } from '@/i18n/params';
import { isMember } from '@/lib/enum';
import { NutritionRulesSettings } from '@/features/weekly-plans/components/nutrition-rules-settings';
import {
  BMR_SOURCES,
  DEFAULT_NUTRITION_RULES,
  PROTEIN_BASES,
} from '@/features/weekly-plans/nutrition-rules';

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
    </main>
  );
}
