import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { foodAliases } from '@/db/schema';

import { normalizeArabic } from './arabic-normalize';
import { getFoodTranslator, type FoodTranslator } from './food-translate';
import { searchFoods, searchFoodsById, type FoodSearchResult } from './queries';

export type FoodMatchResult = {
  /** 'alias' when a remembered name resolved it; 'search' when translate+search did. */
  source: 'alias' | 'search';
  matches: FoodSearchResult[];
};

/**
 * Finds library foods for an Arabic name, cheapest path first.
 *
 * A confirmed alias resolves instantly with no AI call. Otherwise the translator
 * turns the Arabic into English keywords and the library is searched. The
 * translator is injected so tests run against the stub.
 */
export async function findFoodMatches(
  clinicId: string,
  arabicName: string,
  deps: { translator?: FoodTranslator } = {},
): Promise<FoodMatchResult> {
  const name = arabicName.trim();
  if (!name) return { source: 'search', matches: [] };

  // Matched on the normalized form, not the raw text: a dietitian who typed
  // "أَرزّ" today must still hit the alias she confirmed as "ارز" last week. The
  // clinic's alias set is small, so normalizing in app code beats a stored
  // normalized column and its migration — see `arabic-normalize.ts`.
  const normalized = normalizeArabic(name);
  const aliasRows = await db
    .select({ foodId: foodAliases.foodId, nameAr: foodAliases.nameAr })
    .from(foodAliases)
    .where(eq(foodAliases.clinicId, clinicId));
  const alias = aliasRows.find((row) => normalizeArabic(row.nameAr) === normalized);

  if (alias) {
    // Resolve the aliased food by its exact description via searchFoods is wrong
    // (name != description); read the row directly instead.
    const matches = await searchFoodsById(clinicId, alias.foodId);
    if (matches.length) return { source: 'alias', matches };
  }

  const translator = deps.translator ?? getFoodTranslator();

  // A translator outage must not crash the picker: fall back to searching the
  // raw name (which finds nothing for Arabic-only input, but returns cleanly so
  // the UI can offer "create a custom food") rather than letting the error escape.
  let keywords = name;
  try {
    keywords = await translator.toKeywords(name);
  } catch {
    keywords = name;
  }

  return { source: 'search', matches: await searchFoods(clinicId, keywords) };
}
