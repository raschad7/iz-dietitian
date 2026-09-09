import { describe, expect, test } from 'bun:test';

import {
  activityFactor,
  bmi,
  bmiCategory,
  goalKcal,
  MIN_SUGGESTED_KCAL,
  mifflinStJeorBmr,
  proteinPerKgFor,
  slotBudgets,
  suggestProteinGrams,
  suggestTargets,
  tdee,
} from './targets';
import { DEFAULT_NUTRITION_RULES, type NutritionRules } from './nutrition-rules';

describe('bmi', () => {
  test('computes weight over height in metres squared', () => {
    // 70 / 1.75² = 22.857…
    expect(bmi(70, 175)).toBeCloseTo(22.8571, 4);
  });

  test('is null rather than NaN when a measurement is missing', () => {
    expect(bmi(null, 175)).toBeNull();
    expect(bmi(70, null)).toBeNull();
  });

  test('rejects non-positive measurements instead of dividing by zero', () => {
    expect(bmi(70, 0)).toBeNull();
    expect(bmi(0, 175)).toBeNull();
    expect(bmi(-70, 175)).toBeNull();
  });
});

describe('bmiCategory', () => {
  test('uses the WHO adult boundaries', () => {
    expect(bmiCategory(17)).toBe('underweight');
    expect(bmiCategory(22)).toBe('normal');
    expect(bmiCategory(27.4)).toBe('overweight');
    expect(bmiCategory(32)).toBe('obese');
    expect(bmiCategory(40)).toBe('severely_obese');
  });

  test('boundaries belong to the higher category', () => {
    expect(bmiCategory(18.5)).toBe('normal');
    expect(bmiCategory(25)).toBe('overweight');
    expect(bmiCategory(30)).toBe('obese');
    expect(bmiCategory(35)).toBe('severely_obese');
  });
});

describe('mifflinStJeorBmr', () => {
  // 10·70 + 6.25·175 − 5·30 + 5 = 700 + 1093.75 − 150 + 5
  test('male worked example', () => {
    expect(mifflinStJeorBmr({ weightKg: 70, heightCm: 175, age: 30, sex: 'male' })).toBeCloseTo(
      1648.75,
      2,
    );
  });

  // 10·60 + 6.25·165 − 5·35 − 161 = 600 + 1031.25 − 175 − 161
  test('female worked example', () => {
    expect(mifflinStJeorBmr({ weightKg: 60, heightCm: 165, age: 35, sex: 'female' })).toBeCloseTo(
      1295.25,
      2,
    );
  });

  test('the two sexes differ by exactly 166 kcal', () => {
    const shared = { weightKg: 70, heightCm: 175, age: 30 };
    const male = mifflinStJeorBmr({ ...shared, sex: 'male' })!;
    const female = mifflinStJeorBmr({ ...shared, sex: 'female' })!;
    expect(male - female).toBeCloseTo(166, 6);
  });

  test('is unanswerable without sex, rather than approximated', () => {
    expect(mifflinStJeorBmr({ weightKg: 70, heightCm: 175, age: 30, sex: null })).toBeNull();
    expect(mifflinStJeorBmr({ weightKg: 70, heightCm: 175, age: 30, sex: 'other' })).toBeNull();
  });

  test('is null when any measurement is missing', () => {
    expect(mifflinStJeorBmr({ weightKg: null, heightCm: 175, age: 30, sex: 'male' })).toBeNull();
    expect(mifflinStJeorBmr({ weightKg: 70, heightCm: null, age: 30, sex: 'male' })).toBeNull();
    expect(mifflinStJeorBmr({ weightKg: 70, heightCm: 175, age: null, sex: 'male' })).toBeNull();
  });
});

describe('activityFactor', () => {
  test('maps the stored activity levels', () => {
    expect(activityFactor('sedentary')).toBe(1.2);
    expect(activityFactor('moderate')).toBe(1.55);
    expect(activityFactor('very_active')).toBe(1.9);
  });

  test('an unrecorded level is treated as sedentary, never as active', () => {
    expect(activityFactor(null)).toBe(1.2);
    expect(activityFactor('nonsense')).toBe(1.2);
  });
});

describe('tdee', () => {
  test('scales bmr by the activity factor', () => {
    expect(tdee(1600, 'moderate')).toBeCloseTo(2480, 6);
  });
});

describe('goalKcal', () => {
  test('subtracts 500 for weight loss', () => {
    expect(goalKcal(2400, 'weight_loss')).toBe(1900);
  });

  test('adds 400 for weight gain', () => {
    expect(goalKcal(2400, 'weight_gain')).toBe(2800);
  });

  test('leaves maintenance, medical and sports at expenditure', () => {
    expect(goalKcal(2400, 'maintenance')).toBe(2400);
    expect(goalKcal(2400, 'medical')).toBe(2400);
    expect(goalKcal(2400, 'sports')).toBe(2400);
    expect(goalKcal(2400, null)).toBe(2400);
  });

  test('never suggests below the micronutrient floor', () => {
    // A small, sedentary client losing weight: 1500 − 500 = 1000, which is unsafe.
    expect(goalKcal(1500, 'weight_loss')).toBe(MIN_SUGGESTED_KCAL);
  });
});

describe('suggestTargets', () => {
  const complete = {
    weightKg: 84,
    heightCm: 175,
    age: 40,
    sex: 'female',
    activityLevel: 'light',
    goal: 'weight_loss',
  };

  test('reports every derived figure for a complete profile', () => {
    const result = suggestTargets(complete);

    expect(result.missing).toEqual([]);
    expect(result.bmi).toBeCloseTo(27.4286, 4);
    expect(result.bmiCategory).toBe('overweight');
    // 10·84 + 6.25·175 − 5·40 − 161 = 1572.75
    expect(result.bmr).toBeCloseTo(1572.75, 2);
    expect(result.tdee).toBeCloseTo(1572.75 * 1.375, 2);
    expect(result.suggestedKcal).toBe(Math.round(1572.75 * 1.375 - 500));
  });

  test('names each missing input instead of only failing', () => {
    const result = suggestTargets({ ...complete, weightKg: null, sex: null });

    expect(result.missing).toEqual(['weightKg', 'sex']);
    expect(result.bmi).toBeNull();
    expect(result.suggestedKcal).toBeNull();
  });

  test('still reports bmi when only sex is missing', () => {
    const result = suggestTargets({ ...complete, sex: null });

    expect(result.bmi).toBeCloseTo(27.4286, 4);
    expect(result.suggestedKcal).toBeNull();
    expect(result.missing).toEqual(['sex']);
  });

  /*
    Which BMR the day is built on. Both figures are estimates and they disagree
    by enough to change what a person eats, so the clinic picks — and every
    screen has to be able to say which one it got.
  */
  describe('the BMR source', () => {
    // Mifflin's answer for `complete` is 1572.75; the analyser printed less.
    const device = 1400;

    test('builds the day on the analyser when the clinic asked for it', () => {
      const result = suggestTargets({ ...complete, measuredBmrKcal: device, bmrSource: 'device' });

      expect(result.bmr).toBe(device);
      expect(result.bmrSource).toBe('measured');
      expect(result.suggestedKcal).toBe(Math.round(device * 1.375 - 500));
      // Both are still reported, so a screen can show the one it did not use.
      expect(result.estimatedBmr).toBeCloseTo(1572.75, 2);
      expect(result.deviceBmr).toBe(device);
    });

    test('falls back to the formula for a client the analyser has never seen', () => {
      /*
        ⚠ The case a screen must not assume away. A clinic set to `device`
        still has unscanned clients, and a tab that labelled their target from
        the *setting* rather than from `bmrSource` would name the wrong source.
      */
      const result = suggestTargets({ ...complete, measuredBmrKcal: null, bmrSource: 'device' });

      expect(result.bmrSource).toBe('estimated');
      expect(result.bmr).toBeCloseTo(1572.75, 2);
      expect(result.deviceBmr).toBeNull();
    });

    test('reports the analyser without using it when the clinic chose the formula', () => {
      const result = suggestTargets({ ...complete, measuredBmrKcal: device, bmrSource: 'formula' });

      expect(result.bmrSource).toBe('estimated');
      expect(result.bmr).toBeCloseTo(1572.75, 2);
      expect(result.deviceBmr).toBe(device);
      expect(result.bmrGap).toBeCloseTo((device - 1572.75) / 1572.75, 6);
    });

    test('defaults to the formula, so a caller that was never threaded the rules is conservative', () => {
      expect(suggestTargets({ ...complete, measuredBmrKcal: device }).bmrSource).toBe('estimated');
    });
  });
});

describe('suggestProteinGrams', () => {
  /*
    The defaults are the dietitian's own table, in her words: an ordinary client
    is `weight × 0.8`, an athlete 1.7, a renal client 0.6 and a dialysis client
    1.0 — all against the weight on the scale. See `DEFAULT_NUTRITION_RULES`.
  */
  test('an ordinary client is 0.8 g per kilogram of scale weight', () => {
    expect(suggestProteinGrams(70)).toBe(56);
    expect(suggestProteinGrams(80)).toBe(64);
  });

  test('an athlete is dosed as an athlete, read off how they train', () => {
    expect(suggestProteinGrams(80, { activityLevel: 'active' })).toBe(136);
    expect(suggestProteinGrams(80, { activityLevel: 'very_active' })).toBe(136);
    // The levels below it take the ordinary rate.
    expect(suggestProteinGrams(80, { activityLevel: 'moderate' })).toBe(64);
    expect(suggestProteinGrams(80, { activityLevel: 'sedentary' })).toBe(64);
  });

  /**
   * ⚠ The reason the athlete rate is not keyed on `clients.goal`.
   *
   * It was, and the goal is what a client *wants*. A woman lifting four times a
   * week who wants to lose eight kilos is `weight_loss` + `active`, and she is
   * exactly the client the higher rate exists for — the old keying dosed her at
   * 0.8 like somebody sedentary.
   */
  test('a training client is dosed as one whatever their goal', () => {
    expect(suggestProteinGrams(80, { activityLevel: 'active' })).toBe(136);
  });

  test('chronic kidney disease lowers the rate, dialysis raises it', () => {
    expect(suggestProteinGrams(80, { clinicalTags: ['kidney_disease'] })).toBe(48);
    expect(suggestProteinGrams(80, { clinicalTags: ['dialysis'] })).toBe(80);
    expect(suggestProteinGrams(80)).toBe(64);
  });

  /**
   * ⚠ The regression that made `CONDITION_RATE_KINDS` necessary.
   *
   * A dialysis rate sits *above* the ordinary one now — 1.0 against 0.8 — where
   * it used to sit below it (1.2 against 1.6). The old code applied every
   * condition with `min(clinicRate, conditionRate)`, which reads as "a condition
   * can only lower a target" and happened to be right while every published
   * figure was below the hard-coded 1.6. Under her table that `min()` would
   * return 0.8 and discard the raised requirement in silence.
   */
  test('a dialysis client is raised above the ordinary rate, not capped to it', () => {
    expect(suggestProteinGrams(80, { clinicalTags: ['dialysis'] })).toBeGreaterThan(
      suggestProteinGrams(80) ?? 0,
    );
  });

  test('a ceiling still wins over a raise, because lower is safe for a kidney', () => {
    // A record carrying both is mid-correction; erring downward is the safe
    // direction, and the ceiling is applied after everything that could raise it.
    expect(suggestProteinGrams(80, { clinicalTags: ['kidney_disease', 'dialysis'] })).toBe(48);
    // Nor can a goal raise a restricted client above their ceiling.
    expect(
      suggestProteinGrams(80, { activityLevel: 'active', clinicalTags: ['kidney_disease'] }),
    ).toBe(48);
  });

  test('is null without a weight', () => {
    expect(suggestProteinGrams(null)).toBeNull();
  });

  test('the calorie target caps a figure the day has no room for', () => {
    // 88 kg at the athlete rate is 150 g, which is 39% of a 1,522 kcal day — a
    // number no ordinary week reaches, so every day was reported short of it.
    expect(suggestProteinGrams(88, { activityLevel: 'active', dailyKcalTarget: 1522 })).toBe(127);
    // Where the day is roomy the cap does not bind.
    expect(suggestProteinGrams(88, { activityLevel: 'active', dailyKcalTarget: 2600 })).toBe(150);
  });

  /*
    The clinic's rule. Every case below is a figure a dietitian could set in
    Settings, and the point of each is that the *same* client comes out
    different — which is why the rate and the basis are stored, shown and
    edited as a pair.
  */
  describe('the clinic rule', () => {
    /* 78 kg, 160 cm, female: Devine ideal is 52.4 kg and the adjusted weight
       58.8 kg. The analyser put her fat-free mass at 54.6 kg. */
    const client = { heightCm: 160, sex: 'female', fatFreeMassKg: 54.6 };

    const at = (perKg: number, proteinBasis: NutritionRules['proteinBasis']): NutritionRules => ({
      ...DEFAULT_NUTRITION_RULES,
      proteinPerKg: perKg,
      proteinBasis,
    });

    test('one rate against three bases is three different targets', () => {
      expect(suggestProteinGrams(78, { ...client, rules: at(1, 'actual') })).toBe(78);
      expect(suggestProteinGrams(78, { ...client, rules: at(1, 'adjusted') })).toBe(59);
      expect(suggestProteinGrams(78, { ...client, rules: at(1, 'lean') })).toBe(55);
    });

    test('the rate is the one the clinic set', () => {
      expect(suggestProteinGrams(80, { rules: at(1, 'actual') })).toBe(80);
      expect(suggestProteinGrams(80, { rules: at(2.2, 'actual') })).toBe(176);
    });

    test('lean falls back to the adjusted weight for a client never scanned', () => {
      // Not null, and not the scale: a clinic dosing on measured lean mass still
      // has clients who have never stood on the analyser.
      expect(
        suggestProteinGrams(78, { ...client, fatFreeMassKg: null, rules: at(1, 'lean') }),
      ).toBe(59);
    });

    /**
     * ⚠ **Every rate multiplies the weight the basis names — including a
     * ceiling.** This used to be untrue: a condition's figure was computed
     * against the adjusted weight whatever the clinic had chosen, on the
     * grounds that renal guidance is published that way.
     *
     * It is gone because two weights on one screen is the failure this area
     * keeps having. The dietitian describes her rule as "the weight times the
     * rate"; a version that quietly used a different weight for one kind of
     * client could not be checked by the person responsible for it. A clinic
     * that doses on lean mass has decided lean mass is its denominator, and
     * that decision is visible on the same dialog as the rate.
     *
     * The protection that matters is untouched: a ceiling is applied last, so
     * nothing can raise a restricted client above it.
     */
    test('a ceiling uses the clinic basis like every other rate', () => {
      const renal = { ...client, clinicalTags: ['kidney_disease'] };

      expect(suggestProteinGrams(78, { ...renal, rules: at(2, 'actual') })).toBe(47);
      expect(suggestProteinGrams(78, { ...renal, rules: at(2, 'adjusted') })).toBe(35);
      expect(suggestProteinGrams(78, { ...renal, rules: at(2, 'lean') })).toBe(33);
    });

    test('a clinic rate below the ceiling still wins', () => {
      // 0.5 is under the 0.6 ceiling, and lower is the safe direction.
      expect(
        suggestProteinGrams(80, { rules: at(0.5, 'actual'), clinicalTags: ['kidney_disease'] }),
      ).toBe(40);
    });
  });
});

describe('proteinPerKgFor', () => {
  test('reports a ceiling as restricted and a raise as not', () => {
    expect(proteinPerKgFor(null, ['kidney_disease'], DEFAULT_NUTRITION_RULES)).toEqual({
      perKg: 0.6,
      restricted: true,
    });
    /*
      ⚠ 1.0 is above the clinic's 0.8, and it must not read as a restriction.
      "Restricted" used to be computed by comparing the rate against the clinic
      default, which made this answer depend on a number that has nothing to do
      with the kidney.
    */
    expect(proteinPerKgFor(null, ['dialysis'], DEFAULT_NUTRITION_RULES)).toEqual({
      perKg: 1,
      restricted: false,
    });
  });

  test('a ceiling outranks a training rate, a raise does not', () => {
    // A dialysis client who trains keeps the higher of the two, because both
    // are raises; a renal client who trains is still capped.
    expect(proteinPerKgFor('active', ['dialysis'], DEFAULT_NUTRITION_RULES).perKg).toBe(1.7);
    expect(proteinPerKgFor('active', ['kidney_disease'], DEFAULT_NUTRITION_RULES).perKg).toBe(0.6);
  });

  test('a clinic that cleared its cases doses everybody at the ordinary rate', () => {
    const flat = { ...DEFAULT_NUTRITION_RULES, proteinRates: {} };

    expect(proteinPerKgFor('active', ['kidney_disease'], flat)).toEqual({
      perKg: flat.proteinPerKg,
      restricted: false,
    });
  });
});

describe('slotBudgets', () => {
  const schedule = [
    { slotKey: 'breakfast', label: 'فطور', timeOfDay: '07:30', kcalShare: 0.25 },
    { slotKey: 'snack_1', label: 'سناك', timeOfDay: '10:30', kcalShare: 0.1 },
    { slotKey: 'lunch', label: 'غداء', timeOfDay: '14:00', kcalShare: 0.35 },
    { slotKey: 'snack_2', label: 'سناك', timeOfDay: '17:00', kcalShare: 0.1 },
    { slotKey: 'dinner', label: 'عشاء', timeOfDay: '20:00', kcalShare: 0.2 },
  ];

  test('divides the day by share', () => {
    const budgets = slotBudgets(2000, schedule);

    expect(budgets.map((slot) => slot.kcal)).toEqual([500, 200, 700, 200, 400]);
    expect(budgets.map((slot) => slot.slotKey)).toEqual([
      'breakfast',
      'snack_1',
      'lunch',
      'snack_2',
      'dinner',
    ]);
  });

  test('normalises shares that do not sum to one', () => {
    // Four slots at 0.25 each sums to 1.0 already; drop one to 0.5 total and the
    // remaining calories must still be distributed, not lost.
    const partial = [
      { slotKey: 'a', label: 'a', timeOfDay: '08:00', kcalShare: 0.25 },
      { slotKey: 'b', label: 'b', timeOfDay: '13:00', kcalShare: 0.25 },
    ];

    const budgets = slotBudgets(2000, partial);

    expect(budgets.map((slot) => slot.kcal)).toEqual([1000, 1000]);
  });

  test('splits evenly when no slot carries a share', () => {
    const zeroed = [
      { slotKey: 'a', label: 'a', timeOfDay: '08:00', kcalShare: 0 },
      { slotKey: 'b', label: 'b', timeOfDay: '13:00', kcalShare: 0 },
      { slotKey: 'c', label: 'c', timeOfDay: '19:00', kcalShare: 0 },
    ];

    const budgets = slotBudgets(1800, zeroed);

    expect(budgets.map((slot) => slot.kcal)).toEqual([600, 600, 600]);
  });

  test('carries the label and time through for the board to render', () => {
    const [breakfast] = slotBudgets(2000, schedule);

    expect(breakfast).toMatchObject({ label: 'فطور', timeOfDay: '07:30' });
  });
});
