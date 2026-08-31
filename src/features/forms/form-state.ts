/**
 * The Forms editor's outcome.
 *
 * Separate from `actions.ts` because a `"use server"` module may only export
 * async functions — exporting a plain object from one does not fail the build,
 * it fails at runtime and confusingly. Same note as every other feature's.
 *
 * `unknownPlaceholder` carries the offending name, which is the whole point of
 * checking here rather than letting the send throw: "{data} is not something
 * this message can fill" is a sentence somebody can act on, where "invalid" is
 * a hunt through a message they have just written.
 *
 * Every `messageKey` is a path inside the `forms` namespace of
 * `src/i18n/messages/*.json`.
 */
export type FormsActionState =
  | { status: 'idle' }
  | {
      status: 'error';
      messageKey: 'errors.invalid' | 'errors.tooLong' | 'errors.unexpected';
    }
  | { status: 'error'; messageKey: 'errors.unknownPlaceholder'; placeholder: string }
  | { status: 'success' };

export const initialFormsState: FormsActionState = { status: 'idle' };
