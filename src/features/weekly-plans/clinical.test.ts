import { describe, expect, test } from 'bun:test';

import { CLINICAL_CONDITIONS, DIET_PATTERNS } from '@/features/clients/nutrition';

import {
  clinicalRules,
  CONDITION_RULES,
  lifeStageKcal,
  narrowToPattern,
  PATTERN_RULES,
  plannerCaveats,
} from './clinical';

/**
 * The clinical rules, tested as what they are: a closed vocabulary with a
 * decision attached to every value.
 *
 * No model and no database. The interesting properties are that every condition
 * has a rule, that the energy arithmetic does the conservative thing when a
 * record contradicts itself, and that narrowing the catalogue never leaves a
 * meal type with nothing in it.
 */

describe('every value has a rule', () => {
  /*
    `satisfies` already makes this a compile error, and the test is here because
    a compile error is invisible to anyone reading the suite for what the
    feature promises: tick a condition, and something acts on it.
  */
  test('each condition tells the model something', () => {
    for (const condition of CLINICAL_CONDITIONS) {
      expect(CONDITION_RULES[condition].length).toBeGreaterThan(20);
    }
  });

  test('each pattern tells the model something', () => {
    for (const pattern of DIET_PATTERNS) {
      expect(PATTERN_RULES[pattern].length).toBeGreaterThan(20);
    }
  });
});

describe('lifeStageKcal', () => {
  test('a first trimester adds nothing — the requirement has not risen yet', () => {
    expect(lifeStageKcal(['pregnancy_first_trimester'])).toEqual({
      kcal: 0,
      from: null,
    });
  });

  test('a second trimester adds the DRI increment and says which one', () => {
    expect(lifeStageKcal(['pregnancy_second_trimester'])).toEqual({
      kcal: 340,
      from: 'pregnancy_second_trimester',
    });
  });

  test('an ordinary client adds nothing', () => {
    expect(lifeStageKcal(['diabetes_type_2', 'hypertension']).kcal).toBe(0);
  });

  /*
    A record carrying both is a record mid-correction, not a woman who needs 850
    extra kilocalories. Taking the largest turns a data-entry slip into a target
    that is merely generous rather than one nobody would notice was wrong.
  */
  test('two life stages at once take the larger, never the sum', () => {
    expect(lifeStageKcal(['pregnancy_third_trimester', 'breastfeeding'])).toEqual({
      kcal: 450,
      from: 'pregnancy_third_trimester',
    });
  });
});

describe('clinicalRules', () => {
  test('the pattern governs and the conditions follow', () => {
    const rules = clinicalRules(['kidney_disease'], 'renal');

    expect(rules.pattern).toBe(PATTERN_RULES.renal);
    expect(rules.conditions).toEqual([CONDITION_RULES.kidney_disease]);
  });

  /*
    A row hand-edited into holding a word this app does not know would otherwise
    put an unconstrained string into a list the model reads as instructions.
  */
  test('a tag the app has no rule for is dropped, not passed through', () => {
    expect(clinicalRules(['سكري', 'gout'], 'atkins')).toEqual({
      pattern: null,
      conditions: [CONDITION_RULES.gout],
    });
  });
});

describe('plannerCaveats', () => {
  /*
    The clinic asked how a ketogenic week would work for a client with epilepsy.
    The honest answer is that a therapeutic ratio is not something a catalogue of
    Palestinian home cooking can reach, and saying so is the feature.
  */
  test('a ketogenic week says it is not a therapeutic one', () => {
    expect(plannerCaveats(['epilepsy'], 'keto')).toContain('ketoNotTherapeutic');
  });

  test('a renal client is told the restriction rests on words, not figures', () => {
    expect(plannerCaveats(['kidney_disease'], null)).toContain('renalNutrientsUnknown');
  });

  test('an ordinary client is told nothing', () => {
    expect(plannerCaveats(['hypertension'], 'low_sodium')).toEqual([]);
  });

  test('two life stages at once are flagged as a record to look at', () => {
    expect(plannerCaveats(['breastfeeding', 'pregnancy_second_trimester'], null)).toContain(
      'conflictingLifeStage',
    );
  });
});

describe('narrowToPattern', () => {
  /** `baseCarbs` defaults low, so a test that says nothing about it is not filtered on it. */
  const dish = (nutritionCategory: string, ...mealTypes: string[]) => ({
    nutritionCategory,
    mealTypes,
    baseCarbs: 5,
  });

  const carby = (grams: number, ...mealTypes: string[]) => ({
    nutritionCategory: 'high_fat',
    mealTypes,
    baseCarbs: grams,
  });

  const CATALOG = [
    dish('high_carb', 'breakfast'),
    dish('high_carb', 'breakfast'),
    dish('high_protein', 'lunch'),
    dish('high_fat', 'lunch'),
    dish('balanced', 'lunch'),
    dish('high_carb', 'lunch'),
    dish('balanced', 'lunch', 'dinner'),
  ];

  test('no pattern narrows nothing', () => {
    expect(narrowToPattern(CATALOG, null)).toHaveLength(CATALOG.length);
  });

  test('a pattern with no macro rule narrows nothing — the prompt does that work', () => {
    expect(narrowToPattern(CATALOG, 'low_sodium')).toHaveLength(CATALOG.length);
  });

  test('keto drops the high-carbohydrate dishes from a meal type that can spare them', () => {
    const kept = narrowToPattern(CATALOG, 'keto');
    const lunches = kept.filter((entry) => entry.mealTypes.includes('lunch'));

    expect(lunches.every((entry) => entry.nutritionCategory !== 'high_carb')).toBe(true);
  });

  test('a meal type the filter would empty stays empty instead of restoring violations', () => {
    const kept = narrowToPattern(CATALOG, 'keto');

    expect(kept.filter((entry) => entry.mealTypes.includes('breakfast'))).toHaveLength(0);
  });

  /*
    A fattoush is bread salad under a lot of olive oil, so fat wins its energy
    share and the label says `high_fat` — and forty grams of carbohydrate walked
    into a ketogenic week behind that label. So did a manaqish, and so did ice
    cream. The gram count is the question keto is actually asking.
  */
  test('keto drops a high-fat dish that is nonetheless full of carbohydrate', () => {
    const catalog = [
      carby(40, 'lunch', 'dinner'),
      carby(6, 'lunch', 'dinner'),
      carby(4, 'lunch', 'dinner'),
      carby(3, 'lunch', 'dinner'),
    ];

    const kept = narrowToPattern(catalog, 'keto');

    expect(kept).toHaveLength(3);
    expect(kept.every((entry) => entry.baseCarbs <= 10)).toBe(true);
  });

  test('low carbohydrate keeps more than keto does', () => {
    // Wide enough that MIN_DISHES_PER_MEAL_TYPE never fires and the two
    // thresholds are what the counts are actually measuring.
    const catalog = [
      carby(40, 'lunch', 'dinner'),
      carby(30, 'lunch', 'dinner'),
      carby(20, 'lunch', 'dinner'),
      carby(8, 'lunch', 'dinner'),
      carby(6, 'lunch', 'dinner'),
      carby(4, 'lunch', 'dinner'),
      carby(3, 'lunch', 'dinner'),
    ];

    expect(narrowToPattern(catalog, 'keto')).toHaveLength(4);
    expect(narrowToPattern(catalog, 'low_carb')).toHaveLength(5);
  });
});
