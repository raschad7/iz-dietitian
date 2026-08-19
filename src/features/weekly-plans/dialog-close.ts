/**
 * The single decision behind closing a guarded dialog.
 *
 * The shared `Dialog` funnels *every* close signal through one `onClose`
 * callback: the X button, the Cancel button, a backdrop click, Escape — and the
 * native `<dialog>`'s own `close` event, which also fires when the dialog is
 * closed programmatically. That last one is the trap: after the user discards a
 * dirty form (open → false), the programmatic close re-invokes `onClose`, and a
 * naive guard sees the form still dirty and pops the "discard changes?" confirm a
 * second time. The same spurious confirm appears after a successful save.
 *
 * Centralising the decision here — and testing it — is what makes the confirm
 * appear exactly once per close attempt:
 *
 *   - `ignore` once the dialog is already closing/closed (the native echo), or
 *     while the confirm is already showing (so a repeat signal cannot stack it),
 *   - `confirm` when there are unsaved edits,
 *   - `close` otherwise.
 */
export function decideDialogClose(input: {
  /** The dialog's current open prop. False means a close is already under way. */
  open: boolean;
  /** Whether the form holds unsaved edits. */
  dirty: boolean;
  /** Whether the confirm step is already on screen. */
  confirming: boolean;
}): 'confirm' | 'close' | 'ignore' {
  // The native `close` event echoes after we set open=false — never re-guard it.
  if (!input.open) return 'ignore';
  // A confirm is already up; a second close signal must not open another.
  if (input.confirming) return 'ignore';
  if (input.dirty) return 'confirm';
  return 'close';
}
