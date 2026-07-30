import { describe, expect, test } from 'bun:test';

import {
  activityFactor,
  bmi,
  bmiCategory,
  goalKcal,
  MIN_SUGGESTED_KCAL,
  mifflinStJeorBmr,
  slotBudgets,
  suggestProteinGrams,
  suggestTargets,
  tdee,
} from './targets';

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
});

describe('suggestProteinGrams', () => {
  test('is 1.6 g per kilogram, rounded', () => {
    expect(suggestProteinGrams(70)).toBe(112);
    expect(suggestProteinGrams(84)).toBe(134);
  });

  test('is null without a weight', () => {
    expect(suggestProteinGrams(null)).toBeNull();
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
