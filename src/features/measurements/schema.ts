import { z } from 'zod';

import { HEIGHT_CM_RANGE, WEIGHT_KG_RANGE } from '@/features/clients/form-rules';
import { isIsoDate } from '@/lib/iso-date';

/**
 * What the measurement form accepts.
 *
 * Every optional figure is `null` when absent, never `0`. That is the schema
 * half of the rule `client_measurements` states in SQL: a null means the machine
 * did not report the figure, and coercing a blank box to zero would record a
 * client with no body fat. `z.coerce.number` reads `''` as `0`, which is exactly
 * how that would happen — so every optional number is mapped to `undefined`
 * first and only then coerced.
 */

/**
 * A blank optional field is "not answered", not a value.
 *
 * The same helper `clients/schema.ts` defines, restated rather than imported
 * because that module keeps it private. `null` is what `FormData.get` returns
 * for a field that submitted nothing at all.
 */
function blankToUndefined(value: unknown): unknown {
  if (value === null) return undefined;
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

/**
 * An optional measured figure, in the range a real human body falls in.
 *
 * The bounds are deliberately generous — they are not clinical judgements, they
 * are typo catchers. 500 kg of fat mass is not an unusual client, it is a
 * decimal point in the wrong place, and refusing it at the form is better than
 * storing it and drawing a chart nobody can read.
 */
function optionalFigure(min: number, max: number, message: string) {
  return z.preprocess(
    blankToUndefined,
    z.coerce.number().min(min, message).max(max, message).optional(),
  );
}

function optionalWholeFigure(min: number, max: number, message: string) {
  return z.preprocess(
    blankToUndefined,
    z.coerce.number().int(message).min(min, message).max(max, message).optional(),
  );
}

/** `YYYY-MM-DD`, and a date that actually exists. */
export const measuredOnSchema = z
  .string()
  .trim()
  .refine(isIsoDate, 'measuredOnInvalid');

/**
 * Minutes from clinic-local midnight, 0–1439.
 *
 * ⚠ **This used to parse `HH:MM` from a time input, and the form no longer has
 * one.** The dialog stopped asking for a time — the day is the fact, the minute
 * is the machine's footnote — and started posting the minute itself in a hidden
 * field: the one on the row being edited, or the clock printed on the report,
 * or zero. A `"0"` does not match `HH:MM`, so every save was refused with
 * `timeInvalid` against a field that has no box on the screen, and the dialog
 * sat there doing nothing. See `MeasurementForm`'s `FormMessage`, which now
 * refuses to stay quiet about a refusal it cannot show.
 *
 * Optional, as before: an absent time becomes minute 0, matching the column's
 * default.
 */
export const measuredAtMinuteSchema = z.preprocess(
  blankToUndefined,
  z.coerce
    .number({ error: 'timeInvalid' })
    .int('timeInvalid')
    .min(0, 'timeInvalid')
    .max(1439, 'timeInvalid')
    .optional(),
);

export const measurementIdSchema = z.uuid();

/**
 * The ceiling on an uploaded report.
 *
 * A Tanita result sheet is around 270 KB. 8 MB is far above anything a body
 * composition analyser emits and still small enough that a row carrying one is
 * unremarkable — the point of a limit here is to refuse the wrong *kind* of
 * file (someone's scanned folder, a video) with a sentence, rather than to
 * shave kilobytes. `serverActions.bodySizeLimit` in `next.config.ts` sits above
 * it so the rejection is this app's and not the framework's.
 */
export const MEASUREMENT_FILE_MAX_BYTES = 8 * 1024 * 1024;

/** Only PDF. Every analyser exports one, and it is the only thing the reader parses. */
export const MEASUREMENT_FILE_TYPES = ['application/pdf'] as const;

/**
 * What the confirm screen carries back about the report it was filled from.
 *
 * All optional: the same form records a hand-typed weigh-in, where none of it
 * exists. `source` is not among them — it is decided by the action from whether
 * a file actually arrived, so a posted field cannot claim a measurement came off
 * a machine that never saw the client.
 */
export const reportOriginSchema = z.object({
  deviceLabel: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
  deviceSubjectId: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
  parserVersion: z.preprocess(blankToUndefined, z.string().trim().max(60).optional()),
  /**
   * Everything the template read that has no column, as the JSON the confirm
   * screen was given. Parsed rather than trusted: it is round-tripped through a
   * hidden field, so it has to come back as an object and not as a string
   * claiming to be one.
   */
  rawValues: z.preprocess(
    (value) => {
      if (typeof value !== 'string' || value.trim() === '') return undefined;
      try {
        const parsed: unknown = JSON.parse(value);
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
          ? parsed
          : undefined;
      } catch {
        return undefined;
      }
    },
    z.record(z.string(), z.unknown()).optional(),
  ),
});

/**
 * One measurement, as the form submits it.
 *
 * `weightKg` is the only required figure, matching the column. It is what makes
 * a row worth having: a measurement with no weight records that somebody stood
 * on a machine and nothing else.
 */
export const measurementSchema = z.object({
  clientId: z.uuid(),
  measuredOn: measuredOnSchema,
  measuredAtMinute: measuredAtMinuteSchema,

  weightKg: z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: 'weightRequired' })
      .min(WEIGHT_KG_RANGE.min, 'weightOutOfRange')
      .max(WEIGHT_KG_RANGE.max, 'weightOutOfRange'),
  ),

  /**
   * Optional here and required on the intake form, which is not a contradiction:
   * the intake is establishing who this client is, and a weigh-in is recording
   * what a machine said. A measurement with no height still has a BMI, computed
   * from `clients.height_cm` — see `measurementHeightCm`.
   */
  heightCm: optionalFigure(HEIGHT_CM_RANGE.min, HEIGHT_CM_RANGE.max, 'heightOutOfRange'),

  // 2–70% spans everything from a competitive athlete to severe obesity. The
  // column allows 0–100; this is the narrower band a real reading falls in.
  bodyFatPercent: optionalFigure(2, 70, 'percentOutOfRange'),
  fatMassKg: optionalFigure(0, WEIGHT_KG_RANGE.max, 'massOutOfRange'),
  fatFreeMassKg: optionalFigure(0, WEIGHT_KG_RANGE.max, 'massOutOfRange'),
  muscleMassKg: optionalFigure(0, WEIGHT_KG_RANGE.max, 'massOutOfRange'),
  boneMassKg: optionalFigure(0, 20, 'massOutOfRange'),

  totalBodyWaterKg: optionalFigure(0, WEIGHT_KG_RANGE.max, 'massOutOfRange'),
  totalBodyWaterPercent: optionalFigure(10, 90, 'percentOutOfRange'),

  // Tanita's scale runs to 59 and reports half steps; other machines report an
  // area. The ceiling is loose because the quantity is not standardised.
  visceralFatRating: optionalFigure(0, 100, 'ratingOutOfRange'),

  basalMetabolicRateKcal: optionalWholeFigure(400, 6000, 'bmrOutOfRange'),
  metabolicAge: optionalWholeFigure(5, 120, 'metabolicAgeOutOfRange'),

  waistCm: optionalFigure(30, 250, 'girthOutOfRange'),
  hipCm: optionalFigure(30, 250, 'girthOutOfRange'),

  note: z.preprocess(blankToUndefined, z.string().trim().max(500).optional()),
});

export type MeasurementInput = z.infer<typeof measurementSchema>;

/**
 * The save, plus the one decision that reaches outside this feature.
 *
 * `applyToCurrentWeight` is a checkbox, not an inference. Making the newest
 * reading the client's current weight changes the calorie target and the next
 * generated plan, so it is a thing the dietitian does on purpose and can see
 * themselves doing — the schema note on `client_nutrition_profiles.weight_kg`
 * is the reason it is not automatic.
 */
export const saveMeasurementSchema = measurementSchema
  .extend({
    applyToCurrentWeight: z.preprocess((value) => value === 'on' || value === true, z.boolean()),
    /**
     * Correct `clients.height_cm` to the height on this form.
     *
     * Offered only when the upload found the two disagreeing. The warning used
     * to state the disagreement and stop there — "the machine was told 157 cm,
     * the record says 156" — which left the reader with a fact, no control, and
     * a second screen to go and find. One of the two numbers is always wrong,
     * and the moment somebody is looking at both is the moment to settle it.
     *
     * A checkbox rather than an automatic write, for the same reason
     * `applyToCurrentWeight` is one: height feeds the BMI on two tabs and the
     * calorie target underneath them, and the operator who typed it into the
     * analyser is not always the authority on it.
     */
    applyHeightToClient: z.preprocess((value) => value === 'on' || value === true, z.boolean()),
  })
  .extend(reportOriginSchema.shape);

export type SaveMeasurementInput = z.infer<typeof saveMeasurementSchema>;

/** Editing an existing row: the same fields, plus which row. */
export const updateMeasurementSchema = saveMeasurementSchema.extend({
  measurementId: measurementIdSchema,
});

export type UpdateMeasurementInput = z.infer<typeof updateMeasurementSchema>;

export const deleteMeasurementSchema = z.object({
  measurementId: measurementIdSchema,
  clientId: z.uuid(),
});

/**
 * Every message the schema above can report, so a translator can see the whole
 * list and a missing key is caught by the type checker rather than by a reader
 * seeing a raw key on screen. Mirrors `MESSAGE_KEYS` in `clients/form-rules.ts`.
 */
export const MEASUREMENT_MESSAGE_KEYS = [
  'measuredOnInvalid',
  /**
   * There is already a reading on that day.
   *
   * Not a schema rule — nothing about the string is wrong, and only the database
   * knows. It lives in this list because it is reported the same way every other
   * complaint about the date is: as a field error under the date box, where the
   * control that fixes it is. See `MeasurementForm`, which also refuses to
   * *submit* a date it can already see is taken.
   */
  'dateTaken',
  'timeInvalid',
  'weightRequired',
  'weightOutOfRange',
  'heightOutOfRange',
  'percentOutOfRange',
  'massOutOfRange',
  'ratingOutOfRange',
  'bmrOutOfRange',
  'metabolicAgeOutOfRange',
  'girthOutOfRange',
] as const;

export type MeasurementMessageKey = (typeof MEASUREMENT_MESSAGE_KEYS)[number];

/**
 * "There is already a reading on that day", shaped like `z.flattenError`.
 *
 * Written once, here, rather than spelled out at each of the two call sites in
 * `actions.ts`. `fieldErrors` is a `Record<string, string[]>` — nothing in its
 * type says the strings have to be message keys — and the form silently drops a
 * key it does not recognise, which is the exact shape of the bug that made Save
 * do nothing once already. `satisfies` makes a typo a compile error instead.
 */
export const DATE_TAKEN_ERROR: Record<string, string[]> = {
  measuredOn: ['dateTaken' satisfies MeasurementMessageKey],
};
