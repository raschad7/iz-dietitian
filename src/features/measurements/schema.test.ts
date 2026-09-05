import { describe, expect, it } from 'bun:test';

import { DATE_TAKEN_ERROR, MEASUREMENT_MESSAGE_KEYS, saveMeasurementSchema } from './schema';

/**
 * The schema against what the dialog actually posts.
 *
 * ⚠ **These exist because the form and the schema drifted apart and nothing
 * caught it.** The dialog dropped its time input and started posting
 * `measuredAtMinute` as a plain number in a hidden field; the schema was still
 * matching `HH:MM`. Every save was refused with a field error against a field
 * that has no box on the screen, `errors.invalid` was suppressed on the
 * assumption that the fields were saying it themselves, and pressing Save did
 * nothing at all — no row, no message, no clue.
 *
 * A typecheck cannot see this: both sides are strings crossing a `FormData`.
 * A test that submits what the form submits can, so that is what these are.
 */

/** What `MeasurementForm` posts for a plain hand-typed weigh-in. */
function formPayload(overrides: Record<string, string> = {}) {
  return {
    clientId: '00000000-0000-4000-8000-000000000002',
    measuredOn: '2026-09-04',
    measuredAtMinute: '0',
    weightKg: '72.2',
    heightCm: '',
    bodyFatPercent: '',
    fatMassKg: '',
    fatFreeMassKg: '',
    muscleMassKg: '',
    boneMassKg: '',
    totalBodyWaterKg: '',
    totalBodyWaterPercent: '',
    visceralFatRating: '',
    basalMetabolicRateKcal: '',
    metabolicAge: '',
    waistCm: '',
    hipCm: '',
    note: '',
    applyToCurrentWeight: 'on',
    applyHeightToClient: null,
    deviceLabel: null,
    deviceSubjectId: null,
    parserVersion: null,
    rawValues: null,
    ...overrides,
  };
}

describe('saveMeasurementSchema against what the form posts', () => {
  it('accepts a hand-typed weigh-in with every optional box left empty', () => {
    const parsed = saveMeasurementSchema.safeParse(formPayload());

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.weightKg).toBe(72.2);
    expect(parsed.data.measuredAtMinute).toBe(0);
    expect(parsed.data.applyToCurrentWeight).toBe(true);

    // The rule the whole feature runs on: an empty box is "not measured", never
    // zero. `z.coerce.number` reads '' as 0, which is why the preprocessor is
    // `blankToUndefined` and not `blankToEmpty`.
    expect(parsed.data.bodyFatPercent).toBeUndefined();
    expect(parsed.data.heightCm).toBeUndefined();
  });

  /*
    The exact regression. A report prints its own clock and the form carries it
    back as minutes, because there is no time input to reformat it into `HH:MM`.
  */
  it("accepts the minute a report's clock parsed to", () => {
    const parsed = saveMeasurementSchema.safeParse(formPayload({ measuredAtMinute: '791' }));

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.measuredAtMinute).toBe(791);
  });

  it('accepts the last minute of the day and refuses the one after it', () => {
    expect(saveMeasurementSchema.safeParse(formPayload({ measuredAtMinute: '1439' })).success).toBe(
      true,
    );
    expect(saveMeasurementSchema.safeParse(formPayload({ measuredAtMinute: '1440' })).success).toBe(
      false,
    );
  });

  it('accepts a full report, every figure filled', () => {
    const parsed = saveMeasurementSchema.safeParse(
      formPayload({
        measuredAtMinute: '791',
        heightCm: '157',
        bodyFatPercent: '38.4',
        fatMassKg: '27.72',
        fatFreeMassKg: '44.48',
        muscleMassKg: '42.2',
        boneMassKg: '2.3',
        totalBodyWaterKg: '32.92',
        totalBodyWaterPercent: '45.6',
        visceralFatRating: '4.5',
        basalMetabolicRateKcal: '1446',
        metabolicAge: '33',
        applyHeightToClient: 'on',
        deviceLabel: 'Tanita MC-780',
      }),
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.applyHeightToClient).toBe(true);
    expect(parsed.data.heightCm).toBe(157);
  });

  /*
    Every key the schema declares has to be one the form posts, or the form is
    posting into a void. `readForm` builds its payload from `Object.keys(
    schema.shape)`, so a field added here and not added to the dialog arrives as
    `null` — fine for an optional one, and a silent refusal for anything else.
    This is the cheap half of that check: the payload above must cover the shape.
  */
  it('has no required field the form does not post', () => {
    const posted = new Set(Object.keys(formPayload()));
    const missing = Object.keys(saveMeasurementSchema.shape).filter((key) => !posted.has(key));

    expect(missing).toEqual([]);
  });
});

/*
  The same-day refusal is a *field* error the server invents — it is not
  produced by Zod, so nothing about its shape is checked by parsing. Both halves
  can therefore be wrong silently: a field name the form draws no box for
  renders nowhere (the bug above, again), and a message key the catalogue does
  not carry is dropped by `errorFor` without a word.
*/
describe('the same-day refusal', () => {
  it('names a field the form actually posts', () => {
    for (const field of Object.keys(DATE_TAKEN_ERROR)) {
      expect(Object.keys(saveMeasurementSchema.shape)).toContain(field);
    }
  });

  it('carries a message key the catalogue knows', () => {
    for (const messages of Object.values(DATE_TAKEN_ERROR)) {
      for (const key of messages) {
        expect(MEASUREMENT_MESSAGE_KEYS as readonly string[]).toContain(key);
      }
    }
  });
});
