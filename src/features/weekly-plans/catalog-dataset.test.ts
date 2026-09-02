import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { catalogChecksum, readUsdaReference, withExtras } from '../../../scripts/build-catalog-dataset';
import { readCatalogDataset, validateCuratedFoods } from '../../../scripts/seed-catalog-foods';

import { normalizeArabic } from './arabic-normalize';
import { derivePortions, GRAMS_ONLY_CATEGORIES } from './portion-derivation';
import { NUTRIENT_KEYS } from './nutrition';

/**
 * The committed catalog, asserted as data.
 *
 * No database here on purpose: `data/catalog-foods.json` is the source of truth for
 * every shared food the product has, and the things most worth guaranteeing about
 * it — that مفتول is not a name for couscous, that raw and cooked are separate
 * entries, that no nutrient was quietly omitted — are properties of the file, not
 * of any particular database that happened to load it.
 */

const foods = readCatalogDataset();
/** The derived half of the catalog — everything the offline dump can speak for. */
const usdaFoods = foods.filter((food) => food.sourceType === 'usda_sr_legacy');
const dishes = (
  JSON.parse(readFileSync('data/dishes.json', 'utf8')) as {
    dishes: { slug: string; ingredients: { fdcId: number }[] }[];
  }
).dishes;

const bySlug = new Map(foods.map((food) => [food.slug, food]));

describe('the committed catalog', () => {
  test('is checksum-verified and structurally valid', () => {
    // `readCatalogDataset` throws on a mismatch; this states the guarantee rather
    // than relying on the import above not having blown up.
    const file = JSON.parse(readFileSync('data/catalog-foods.json', 'utf8')) as {
      checksum: string;
      foods: unknown[];
    };

    expect(file.checksum).toBe(catalogChecksum(file.foods));
    expect(validateCuratedFoods(foods)).toEqual([]);
  });

  test('states every nutrient explicitly, using null for unmeasured and never 0', () => {
    for (const food of foods) {
      for (const key of NUTRIENT_KEYS) {
        expect(food.nutrition).toHaveProperty(key);
        const value = food.nutrition[key];
        expect(value === null || typeof value === 'number').toBe(true);
      }
      // The four that must always be measured — a null macro would silently become
      // a zero in every plan the food appears in.
      for (const key of ['kcal', 'protein', 'fat', 'carbs'] as const) {
        expect(typeof food.nutrition[key]).toBe('number');
      }
    }
  });

  test('carries a real source reference for every food', () => {
    for (const food of foods) {
      expect(food.sourceRef).toMatch(/^\d+$/);
      expect(food.note.length).toBeGreaterThan(0);

      if (food.sourceType === 'usda_sr_legacy') continue;

      // A food USDA has no row for has to say in words where its numbers came
      // from, and sit in the reserved id range so it can never be mistaken for
      // an FDC id. Labaneh and freekeh are not in SR Legacy and never will be —
      // it is a final 2018 release.
      expect(food.sourceNote?.length ?? 0).toBeGreaterThan(0);
      expect(Number(food.sourceRef)).toBeGreaterThanOrEqual(900000);
    }
  });
});

/**
 * Maftoul and couscous are not the same food. The catalog holds no maftoul
 * nutrition, so a search for مفتول returning couscous would be answering with
 * another food's numbers — silently, and plausibly enough that nobody would check.
 * Returning nothing is the honest answer until a real source is added.
 */
describe('مفتول', () => {
  test('is not an alias, a name, or a slug anywhere in the catalog', () => {
    const maftoul = normalizeArabic('مفتول');

    for (const food of foods) {
      expect(normalizeArabic(food.nameAr)).not.toContain(maftoul);
      for (const alias of [...food.aliasesAr, ...food.aliasesEn]) {
        expect(normalizeArabic(alias)).not.toContain(maftoul);
      }
    }
  });

  test('specifically, couscous does not answer to it', () => {
    for (const slug of ['couscous-dry', 'couscous-cooked']) {
      const aliases = bySlug.get(slug)!.aliasesAr.map(normalizeArabic);
      expect(aliases).not.toContain(normalizeArabic('مفتول'));
      // مغربية is the same error under a regional name — moghrabieh is maftoul,
      // not fine-grain couscous — so it is gone for the same reason.
      expect(aliases).not.toContain(normalizeArabic('مغربية'));
    }
  });
});

describe('preparation states', () => {
  /**
   * Raw, dry and cooked carry different nutrition per 100 g. Keeping them as
   * separate entries is only half the job: their *names* have to say which is
   * which, or a dietitian reading a result list cannot tell them apart.
   */
  test('raw/dry and cooked counterparts are separate entries with distinct names', () => {
    const pairs = [
      ['rice-white-dry', 'rice-white-cooked'],
      ['lentils-dry', 'lentils-cooked'],
      ['bulgur-dry', 'bulgur-cooked'],
      ['couscous-dry', 'couscous-cooked'],
      ['pasta-dry', 'pasta-cooked'],
      ['potato-raw', 'potato-boiled'],
      ['chicken-breast-raw', 'chicken-breast-roasted'],
      ['egg-raw', 'egg-boiled'],
    ] as const;

    for (const [rawSlug, cookedSlug] of pairs) {
      const raw = bySlug.get(rawSlug)!;
      const cooked = bySlug.get(cookedSlug)!;

      expect(raw.state).not.toBe(cooked.state);
      expect(raw.nameAr).not.toBe(cooked.nameAr);
      expect(raw.nameEn).not.toBe(cooked.nameEn);
      // And they really are different foods, not the same numbers twice.
      expect(raw.nutrition.kcal).not.toBe(cooked.nutrition.kcal);
    }
  });

  test('no entry is ambiguously named — every food declares a state', () => {
    for (const food of foods) {
      expect(food.state.length).toBeGreaterThan(0);
    }

    // The ambiguous names the brief called out by name: a bare "Rice" or "Lentils"
    // with no preparation is a portion error waiting to happen.
    for (const bare of ['Rice', 'Lentils', 'Chickpeas', 'Pasta']) {
      expect(foods.some((food) => food.nameEn === bare)).toBe(false);
    }
  });
});

describe('generic aliases', () => {
  /**
   * A generic alias may legitimately match several entries — رز is simply the word
   * for rice — and when it does, the catalog must offer them all under their own
   * names rather than pick one. This is the data half of that guarantee; the
   * ranking half is in `ingredient-refine.test.ts`.
   */
  test('رز reaches both the dry and the cooked rice, each under its own name', () => {
    const matches = foods.filter((food) =>
      [food.nameAr, ...food.aliasesAr].some((name) => normalizeArabic(name).includes(normalizeArabic('رز'))),
    );

    const slugs = matches.map((food) => food.slug);
    expect(slugs).toContain('rice-white-dry');
    expect(slugs).toContain('rice-white-cooked');
    expect(new Set(matches.map((food) => food.nameAr)).size).toBe(matches.length);
  });

  test('the regional synonyms the brief named all resolve', () => {
    const find = (term: string) =>
      foods.filter((food) =>
        [food.nameAr, ...food.aliasesAr].some((name) =>
          normalizeArabic(name).includes(normalizeArabic(term)),
        ),
      );

    for (const [term, expectedSlug] of [
      ['رز', 'rice-white-dry'],
      ['دجاج', 'chicken-breast-raw'],
      ['طماطم', 'tomato-raw'],
      ['بندورة', 'tomato-raw'],
      ['لبن', 'yogurt-whole'],
      ['زبادي', 'yogurt-whole'],
      ['بطاطا', 'potato-raw'],
      ['بطاطس', 'potato-raw'],
    ] as const) {
      expect(find(term).map((food) => food.slug)).toContain(expectedSlug);
    }
  });
});

describe('portions', () => {
  test('one food can carry several, each with both labels and a positive weight', () => {
    const rice = bySlug.get('rice-white-cooked')!;

    expect(rice.portions.length).toBeGreaterThan(1);
    expect(rice.portions.map((portion) => portion.labelEn)).toEqual([
      'Cup',
      'Half cup',
      'Quarter cup',
      // Curated, not derived: USDA publishes no spoon for cooked rice.
      'Tablespoon',
    ]);
    expect(rice.portions.map((portion) => portion.labelAr)).toEqual([
      'كوب',
      'نصف كوب',
      'ربع كوب',
      'ملعقة كبيرة',
    ]);

    for (const portion of rice.portions) {
      expect(portion.grams).toBeGreaterThan(0);
    }
  });

  /**
   * The spoon a dietitian actually writes in.
   *
   * USDA has no tablespoon for cooked rice, and where it has one for a cooked
   * grain — bulgur at 8.4 g, lentils at 12.3 g — it is a level measuring spoon.
   * The clinic's spoon is a heaped eating spoon at roughly three times that. They
   * are different objects and no arithmetic turns one into the other, so this
   * weight is curated with a `sourceRef` naming whose decision it is.
   */
  test('the clinic spoon for cooked rice is curated and says so', () => {
    const spoon = bySlug
      .get('rice-white-cooked')!
      .portions.find((portion) => portion.labelEn === 'Tablespoon')!;

    expect(spoon.grams).toBe(25);
    expect(spoon.isDefault).toBe(false);
    expect(spoon.sourceRef).toContain('clinic practice');
  });

  /** The three worked examples from the brief, each backed by real source data. */
  test('match the measured source values', () => {
    // A large egg, not a medium one: eggs are graded, and 50 g is the reference
    // unit — the same weight the boiled egg carries, so one حبة cannot mean two
    // different things depending on whether it was cooked.
    expect(bySlug.get('egg-raw')!.portions[0]).toEqual({
      labelAr: 'حبة',
      labelEn: 'Piece',
      grams: 50,
      isDefault: true,
      sortOrder: 0,
    });
    expect(bySlug.get('egg-boiled')!.portions[0]!.grams).toBe(50);

    // Oil is written in spoons and in nothing else. USDA publishes a 216 g cup;
    // it is a bottle measure, not a serving.
    expect(bySlug.get('olive-oil')!.portions).toEqual([
      { labelAr: 'ملعقة كبيرة', labelEn: 'Tablespoon', grams: 13.5, isDefault: true, sortOrder: 0 },
      { labelAr: 'ملعقة صغيرة', labelEn: 'Teaspoon', grams: 4.5, isDefault: false, sortOrder: 1 },
    ]);

    expect(bySlug.get('rice-white-cooked')!.portions[0]).toEqual({
      labelAr: 'كوب',
      labelEn: 'Cup',
      grams: 158,
      isDefault: true,
      sortOrder: 0,
    });
  });

  /**
   * The fix that this whole pass exists for.
   *
   * The extract used to keep only the first portion USDA published per food, and
   * for most produce that is a cup. So an apple was offered as "1 cup, quartered
   * or chopped" and had no way to say "1 medium" — which is the only way anybody
   * writes it. USDA had the medium apple all along.
   */
  test('fruit is counted in pieces, not in cups', () => {
    const expected: Record<string, number> = {
      'apple-raw': 182,
      'banana-raw': 118,
      'orange-raw': 131,
      'pear-raw': 178,
    };

    for (const [slug, grams] of Object.entries(expected)) {
      const first = bySlug.get(slug)!.portions[0]!;

      expect(first.labelEn).toBe('Piece');
      expect(first.labelAr).toBe('حبة');
      expect(first.isDefault).toBe(true);
      expect(first.grams).toBe(grams);
    }
  });

  test('exactly one portion per food is the default', () => {
    for (const food of foods) {
      const defaults = food.portions.filter((portion) => portion.isDefault);
      expect(defaults.length).toBe(food.portions.length === 0 ? 0 : 1);
    }
  });

  /** Meat, poultry and fish go by grams — a product choice, not a data gap. */
  test('are absent from the categories a dietitian weighs', () => {
    for (const food of foods) {
      if (GRAMS_ONLY_CATEGORIES.has(food.category)) expect(food.portions).toEqual([]);
    }
  });

  /**
   * The committed portions must be exactly what re-running the build produces from
   * the offline USDA reference — no hand-edits, no drift, and `db:build-catalog` a
   * no-op diff. This is also what proves no weight here was invented: every one is
   * reachable from `data/usda-sr-legacy.ndjson` by the rules in
   * `portion-derivation.ts`.
   */
  test('are exactly what the derivation produces from the offline source', () => {
    const usda = readUsdaReference();

    for (const food of usdaFoods) {
      const source = usda.get(Number(food.sourceRef));
      expect(source).toBeDefined();

      // `withExtras` is part of the build, so it is part of the reproduction: a
      // curated portion is data a person wrote, and the check is that the derived
      // rows beside it are still exactly what the source produces.
      const rebuilt = withExtras(
        derivePortions({ category: food.category, portions: source!.portions ?? [] }),
        food.extraPortions,
      );

      expect(food.portions).toEqual(rebuilt);
    }
  });

  test('and the nutrition is the source values, copied unchanged', () => {
    const usda = readUsdaReference();

    for (const food of usdaFoods) {
      const source = usda.get(Number(food.sourceRef))!;

      // Including the checksum on the description, which is what would catch an
      // fdcId that has moved onto a different food since the file was written.
      expect(food.note).toBe(source.description);

      for (const key of NUTRIENT_KEYS) {
        const expected = typeof source[key] === 'number' ? source[key] : null;
        expect(food.nutrition[key]).toBe(expected as number | null);
      }
    }
  });
});

describe('coverage of the shipped dish catalog', () => {
  test('every dish ingredient resolves to a curated food', () => {
    const refs = new Set(foods.map((food) => food.sourceRef));
    const missing = dishes.flatMap((dish) =>
      dish.ingredients
        .filter((ingredient) => !refs.has(String(ingredient.fdcId)))
        .map((ingredient) => `${dish.slug}: ${ingredient.fdcId}`),
    );

    expect(missing).toEqual([]);
  });

  /**
   * The shipped catalog's size, pinned. Not a vanity number: it is the figure the
   * migration report claims, and a dish or ingredient silently disappearing from
   * the dataset is exactly the kind of change nobody notices until a plan is short
   * a meal.
   */
  test('is 114 dishes and 481 ingredients', () => {
    expect(dishes).toHaveLength(114);
    expect(dishes.reduce((total, dish) => total + dish.ingredients.length, 0)).toBe(481);
  });
});
