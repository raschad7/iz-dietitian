import { describe, expect, it } from 'bun:test';

import {
  bmiDisagreement,
  changeFor,
  compareMeasurements,
  daysBetween,
  judgeChange,
  clockDrift,
  measurementHeightCm,
  measurementValue,
  metricIntent,
  progressNarrative,
  summariseProgress,
  trendSeries,
  type ComparableMeasurement,
  type MeasurementSubject,
} from './compare';

/** A measurement with every figure absent, to be spread over. */
function measurement(overrides: Partial<ComparableMeasurement> = {}): ComparableMeasurement {
  return {
    id: 'm1',
    measuredOn: '2026-03-12',
    measuredAtMinute: 6 * 60 + 34,
    weightKg: 78.6,
    heightCm: null,
    bodyFatPercent: null,
    fatMassKg: null,
    fatFreeMassKg: null,
    muscleMassKg: null,
    visceralFatRating: null,
    waistCm: null,
    hipCm: null,
    basalMetabolicRateKcal: null,
    ...overrides,
  };
}

const losing: MeasurementSubject = { goal: 'weight_loss', heightCm: 178 };

describe('metricIntent', () => {
  it('flips weight with the goal', () => {
    expect(metricIntent('weightKg', 'weight_loss')).toBe('lower');
    expect(metricIntent('weightKg', 'weight_gain')).toBe('higher');
  });

  it('refuses to grade weight for maintenance, because staying put is the aim', () => {
    expect(metricIntent('weightKg', 'maintenance')).toBe('none');
    expect(metricIntent('bmi', 'maintenance')).toBe('none');
  });

  it('grades nothing at all for a medical goal', () => {
    // "Medical" means the dietitian decides. A medical client losing weight may
    // be losing it for the reason they are a client, and this app must never
    // call that an improvement.
    expect(metricIntent('weightKg', 'medical')).toBe('none');
    expect(metricIntent('fatMassKg', 'medical')).toBe('none');
    expect(metricIntent('muscleMassKg', 'medical')).toBe('none');
    expect(metricIntent('visceralFatRating', 'medical')).toBe('none');
  });

  it('judges a sports client on composition but not on scale weight', () => {
    // A sports client may be deliberately cutting or bulking; the goal alone
    // does not say which.
    expect(metricIntent('weightKg', 'sports')).toBe('none');
    expect(metricIntent('fatMassKg', 'sports')).toBe('lower');
    expect(metricIntent('muscleMassKg', 'sports')).toBe('higher');
  });

  it('never wants muscle to fall, for any goal it grades', () => {
    for (const goal of ['weight_loss', 'weight_gain', 'maintenance', 'sports']) {
      expect(metricIntent('muscleMassKg', goal)).toBe('higher');
      expect(metricIntent('fatFreeMassKg', goal)).toBe('higher');
    }
  });

  it('does not read fat as bad news for a client who means to gain', () => {
    expect(metricIntent('fatMassKg', 'weight_gain')).toBe('none');
    expect(metricIntent('bodyFatPercent', 'weight_gain')).toBe('none');
  });

  it('treats an unset goal as ungradable rather than assuming weight loss', () => {
    expect(metricIntent('weightKg', null)).toBe('none');
    expect(metricIntent('fatMassKg', null)).toBe('none');
  });
});

describe('judgeChange', () => {
  it('grades against the intent, not the sign', () => {
    expect(judgeChange('weightKg', -2.6, 'lower')).toBe('improved');
    expect(judgeChange('weightKg', -2.6, 'higher')).toBe('declined');
    expect(judgeChange('muscleMassKg', 0.7, 'higher')).toBe('improved');
    expect(judgeChange('muscleMassKg', -0.7, 'higher')).toBe('declined');
  });

  it('stays unjudged when the goal gives no direction, however far it moved', () => {
    expect(judgeChange('weightKg', -9, 'none')).toBe('unjudged');
  });

  it('calls a missing figure unjudged, never unchanged', () => {
    // Null is "that visit did not record this", which is a different fact from
    // "it did not move".
    expect(judgeChange('fatMassKg', null, 'lower')).toBe('unjudged');
  });

  it('treats movement under the metric epsilon as noise', () => {
    // An analyser repeats to about ±0.1 kg. A green arrow on 0.02 kg is a green
    // arrow on nothing.
    expect(judgeChange('weightKg', 0.02, 'lower')).toBe('unchanged');
    expect(judgeChange('weightKg', -0.02, 'lower')).toBe('unchanged');
    expect(judgeChange('weightKg', 0.2, 'lower')).toBe('declined');
  });
});

describe('measurementValue and height', () => {
  it("derives BMI from the client's recorded height", () => {
    const value = measurementValue(measurement({ weightKg: 78.6 }), 'bmi', losing);
    expect(value).toBeCloseTo(78.6 / 1.78 ** 2, 4);
  });

  it("falls back to the machine's height when the record has none", () => {
    const value = measurementValue(measurement({ weightKg: 78.6, heightCm: 178 }), 'bmi', {
      goal: 'weight_loss',
      heightCm: null,
    });
    expect(value).toBeCloseTo(78.6 / 1.78 ** 2, 4);
  });

  it('has no BMI when neither height exists', () => {
    expect(measurementValue(measurement(), 'bmi', { goal: 'weight_loss', heightCm: null })).toBeNull();
  });

  /*
    The case that put two BMIs on one record: the record says 156, the operator
    typed 157 into the machine. Both tabs have to answer with the record's
    height or a dietitian cannot tell which number is the app's.
  */
  it('prefers the record over the height typed into the machine', () => {
    const scanned = measurement({ heightCm: 157 });
    expect(measurementHeightCm(scanned, { goal: null, heightCm: 156 })).toBe(156);
  });
});

describe('bmiDisagreement', () => {
  it('reports a gap wide enough to mean the two heights differ', () => {
    // 25.4 from a 176 cm record against the 24.9 an analyser printed from 178.
    expect(bmiDisagreement(25.4, 24.9)).toBeCloseTo(0.5, 5);
  });

  it('stays quiet on a rounding-sized difference', () => {
    expect(bmiDisagreement(24.82, 24.9)).toBeNull();
  });

  it('says nothing when the machine printed no BMI', () => {
    expect(bmiDisagreement(24.8, null)).toBeNull();
  });
});

describe('compareMeasurements', () => {
  const before = measurement({
    id: 'jan',
    measuredOn: '2026-01-29', measuredAtMinute: 420,
    weightKg: 81.2,
    bodyFatPercent: 17.9,
    fatMassKg: 14.5,
    muscleMassKg: 63.0,
  });
  const after = measurement({
    id: 'mar',
    weightKg: 78.6,
    bodyFatPercent: 14.8,
    fatMassKg: 11.6,
    muscleMassKg: 63.7,
  });

  it('reads fat down and muscle up as two improvements for a weight-loss client', () => {
    const changes = compareMeasurements(before, after, losing);

    expect(changeFor(changes, 'weightKg')).toMatchObject({ delta: expect.closeTo(-2.6, 5), verdict: 'improved' });
    expect(changeFor(changes, 'fatMassKg')).toMatchObject({ verdict: 'improved' });
    expect(changeFor(changes, 'muscleMassKg')).toMatchObject({ verdict: 'improved' });
  });

  it('leaves a delta null when only one of the two visits recorded the figure', () => {
    const handWeighed = measurement({ id: 'hand', weightKg: 80.0 });
    const changes = compareMeasurements(handWeighed, after, losing);

    const fat = changeFor(changes, 'fatMassKg');
    expect(fat?.from).toBeNull();
    expect(fat?.delta).toBeNull();
    expect(fat?.verdict).toBe('unjudged');
  });

  it('calls the same fall a decline for a client who means to gain', () => {
    const changes = compareMeasurements(before, after, { goal: 'weight_gain', heightCm: 178 });
    expect(changeFor(changes, 'weightKg')?.verdict).toBe('declined');
    // ...while the muscle gain is still good news for them.
    expect(changeFor(changes, 'muscleMassKg')?.verdict).toBe('improved');
  });
});

describe('progressNarrative', () => {
  const subject = losing;
  const base = measurement({ id: 'a', weightKg: 81.2, fatMassKg: 14.5, muscleMassKg: 63.0 });

  it('leads with fat down and muscle up when both happened', () => {
    const later = measurement({ id: 'b', weightKg: 78.6, fatMassKg: 11.6, muscleMassKg: 63.7 });
    expect(progressNarrative(compareMeasurements(base, later, subject))).toBe('fatDownMuscleUp');
  });

  it('leads with fat alone when muscle held still', () => {
    const later = measurement({ id: 'b', weightKg: 78.6, fatMassKg: 11.6, muscleMassKg: 63.0 });
    expect(progressNarrative(compareMeasurements(base, later, subject))).toBe('fatDown');
  });

  it('falls back to weight when no composition figures exist on either side', () => {
    const from = measurement({ id: 'a', weightKg: 81.2 });
    const to = measurement({ id: 'b', weightKg: 78.6 });
    expect(progressNarrative(compareMeasurements(from, to, subject))).toBe('weightDown');
  });

  it('tells a gaining client the gain was muscle', () => {
    // The weight verdict is `unjudged` for this goal, but the composition story
    // is still the one worth telling.
    const from = measurement({ id: 'a', weightKg: 60, muscleMassKg: 44 });
    const to = measurement({ id: 'b', weightKg: 62.5, muscleMassKg: 45.8 });
    const changes = compareMeasurements(from, to, { goal: 'weight_gain', heightCm: 170 });
    expect(progressNarrative(changes)).toBe('weightUpMuscleUp');
  });

  it('says the client is holding when nothing moved', () => {
    const from = measurement({ id: 'a', weightKg: 78.6 });
    const to = measurement({ id: 'b', weightKg: 78.62 });
    expect(progressNarrative(compareMeasurements(from, to, subject))).toBe('holding');
  });
});

describe('summariseProgress', () => {
  // Newest first, the order the query returns.
  const history: ComparableMeasurement[] = [
    measurement({ id: 'mar', measuredOn: '2026-03-12', measuredAtMinute: 394, weightKg: 78.6, fatMassKg: 11.6, muscleMassKg: 63.7 }),
    measurement({ id: 'jan', measuredOn: '2026-01-29', measuredAtMinute: 420, weightKg: 81.2, fatMassKg: 14.5, muscleMassKg: 63.0 }),
    measurement({ id: 'dec', measuredOn: '2025-12-11', measuredAtMinute: 420, weightKg: 84.1, fatMassKg: 18.2, muscleMassKg: 62.4 }),
    measurement({ id: 'oct', measuredOn: '2025-10-05', measuredAtMinute: 420, weightKg: 86.4, fatMassKg: 20.9, muscleMassKg: 61.8 }),
  ];

  it('measures since-last against the previous visit and since-start against the oldest', () => {
    const progress = summariseProgress(history, losing);

    expect(progress.latest?.id).toBe('mar');
    expect(progress.previous?.id).toBe('jan');
    expect(progress.baseline?.id).toBe('oct');
    expect(changeFor(progress.sinceLast, 'weightKg')?.delta).toBeCloseTo(-2.6, 5);
    expect(changeFor(progress.sinceStart, 'weightKg')?.delta).toBeCloseTo(-7.8, 5);
  });

  it('handles a first measurement without comparing it to itself', () => {
    const progress = summariseProgress([history[0]!], losing);

    expect(progress.latest?.id).toBe('mar');
    expect(progress.previous).toBeNull();
    expect(progress.baseline).toBeNull();
    expect(progress.sinceLast).toEqual([]);
    expect(progress.narrativeSinceLast).toBe('notEnoughData');
    expect(progress.count).toBe(1);
  });

  it('is empty and calm for a client with no measurements at all', () => {
    const progress = summariseProgress([], losing);
    expect(progress.latest).toBeNull();
    expect(progress.count).toBe(0);
    expect(progress.narrativeSinceStart).toBe('notEnoughData');
  });

  it('compares the only two visits there are', () => {
    const progress = summariseProgress(history.slice(0, 2), losing);
    expect(progress.previous?.id).toBe('jan');
    expect(progress.baseline?.id).toBe('jan');
    expect(changeFor(progress.sinceLast, 'weightKg')?.delta).toBeCloseTo(-2.6, 5);
  });
});

describe('trendSeries', () => {
  const history: ComparableMeasurement[] = [
    measurement({ id: 'mar', measuredOn: '2026-03-12', measuredAtMinute: 360, weightKg: 78.6, fatMassKg: 11.6 }),
    measurement({ id: 'feb', measuredOn: '2026-02-10', measuredAtMinute: 360, weightKg: 80.0 }),
    measurement({ id: 'jan', measuredOn: '2026-01-29', measuredAtMinute: 360, weightKg: 81.2, fatMassKg: 14.5 }),
  ];

  it('returns points oldest first, for plotting left to right', () => {
    const points = trendSeries(history, 'weightKg', losing);
    expect(points.map((p) => p.id)).toEqual(['jan', 'feb', 'mar']);
  });

  it('drops visits missing the metric rather than plotting them as zero', () => {
    // The February visit was a hand weigh-in with no analyser reading. Drawing
    // it as 0 kg of fat would show a collapse that never happened.
    const points = trendSeries(history, 'fatMassKg', losing);
    expect(points.map((p) => p.id)).toEqual(['jan', 'mar']);
    expect(points.every((p) => p.value > 0)).toBe(true);
  });

  it('plots derived BMI like any other metric', () => {
    const points = trendSeries(history, 'bmi', losing);
    expect(points).toHaveLength(3);
    expect(points[0]!.value).toBeCloseTo(81.2 / 1.78 ** 2, 4);
  });
});

describe('daysBetween', () => {
  it('counts whole days across a gap', () => {
    expect(daysBetween('2026-01-29', '2026-03-12')).toBe(42);
  });

  it('counts calendar days, not fractions of one', () => {
    // Both readings are stored as a wall clock, so the time of day never turns
    // a six-day gap into 6.08 days.
    expect(daysBetween('2026-03-01', '2026-03-08')).toBe(7);
  });

  it('goes negative when the arguments are the wrong way round', () => {
    expect(daysBetween('2026-03-12', '2026-01-29')).toBe(-42);
  });

  it('is unshaken by a daylight-saving change inside the gap', () => {
    // Asia/Hebron springs forward in late March. Both ends are wall-clock
    // dates, so the count is a plain calendar count either way.
    expect(daysBetween('2026-03-20', '2026-04-03')).toBe(14);
  });
});

describe('clockDrift', () => {
  const at = (minute: number) => ({ measuredAtMinute: minute });

  it('names a gap of four hours or more', () => {
    // 06:34 against 13:11 — the fasted morning reading and the after-lunch one.
    expect(clockDrift(at(394), at(791))).toBe(397);
  });

  it('says nothing about two readings taken at a similar hour', () => {
    expect(clockDrift(at(600), at(700))).toBeNull();
  });

  it('says nothing when either time is unknown', () => {
    // Minute 0 is "no clock recorded", not midnight — see the note.
    expect(clockDrift(at(0), at(791))).toBeNull();
    expect(clockDrift(at(394), at(0))).toBeNull();
  });
});
