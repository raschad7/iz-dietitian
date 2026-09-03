/**
 * Form state shapes and their initial values.
 *
 * These live here rather than in `actions.ts` because a `"use server"` module
 * may only export async functions — see the longer note in
 * `clients/form-state.ts` for what goes wrong when one exports a plain value.
 */

/**
 * What was typed into the measurement form, handed straight back when the save
 * is refused.
 *
 * ⚠ **React empties an uncontrolled form once its action returns**, including a
 * rejected one. This form has fourteen numeric boxes; losing all of them
 * because a body-fat percentage was out of range would be an unusable
 * refusal — and the field being corrected is the one it would be worst to lose.
 *
 * Raw strings exactly as posted, not parsed values: what was typed is what has
 * to come back, including the thing the schema rejected.
 *
 * A `Record` rather than a named field per box, unlike `ClientFormEcho`. The set
 * is the schema's own field list and every one of them is echoed the same way,
 * so naming them here would be a second copy of that list to keep in step.
 */
export type MeasurementFormEcho = Record<string, string>;

export type MeasurementFormState =
  | { status: 'idle' }
  | {
      status: 'success';
      /** Which row was written, so the panel can open it or scroll to it. */
      measurementId: string;
      /**
       * What became of the "make this the current weight" box.
       *
       * Three outcomes and not two, because `applied: false` would collapse a
       * box nobody ticked together with a box that was ticked and did nothing.
       * A client who has never had their intake saved has no nutrition profile
       * row to update — see `applyWeightToProfile` — and that case has to be
       * said out loud, or the dietitian ticks a box and goes away believing the
       * calorie target moved when it did not.
       */
      currentWeight: 'untouched' | 'applied' | 'noProfile';
      /** The weight just saved, for the confirmation that names it. */
      weightKg: number;
    }
  | {
      status: 'error';
      messageKey:
        | 'errors.invalid'
        | 'errors.duplicate'
        | 'errors.notFound'
        | 'errors.unexpected';
      /** Shaped to match `z.flattenError`, so no cast is needed at either end. */
      fieldErrors?: Record<string, string[] | undefined>;
      /** What was typed, so it survives React's reset. */
      values?: MeasurementFormEcho;
      /**
       * How many times this form has been refused, counted by the action from
       * the state it was handed. The form keys its fields on it so a second
       * identical mistake still remounts them — see the same note in
       * `clients/form-state.ts`.
       */
      attempt: number;
    };

export const initialMeasurementFormState: MeasurementFormState = { status: 'idle' };
