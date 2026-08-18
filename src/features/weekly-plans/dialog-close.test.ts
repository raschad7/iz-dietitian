import { describe, expect, test } from 'bun:test';

import { decideDialogClose } from './dialog-close';

describe('decideDialogClose', () => {
  test('a dirty form confirms before closing', () => {
    expect(decideDialogClose({ open: true, dirty: true, confirming: false })).toBe('confirm');
  });

  test('a clean form closes immediately', () => {
    expect(decideDialogClose({ open: true, dirty: false, confirming: false })).toBe('close');
  });

  test('a second signal while the confirm is up is ignored (no stacked confirm)', () => {
    expect(decideDialogClose({ open: true, dirty: true, confirming: true })).toBe('ignore');
  });

  test('the native close echo after open=false is ignored', () => {
    expect(decideDialogClose({ open: false, dirty: true, confirming: false })).toBe('ignore');
  });

  /**
   * The regression the spec asks for: across a whole close attempt — the user's
   * gesture, any repeat signals while the confirm is up, the discard, and the
   * native `close` echo that follows open=false — the confirm is raised exactly
   * once.
   */
  test('confirm is raised exactly once per close attempt', () => {
    let confirming = false;
    let open = true;
    let confirmCount = 0;

    // A helper mirroring the component: run the decision and apply its effect.
    function closeRequest() {
      const decision = decideDialogClose({ open, dirty: true, confirming });
      if (decision === 'confirm') {
        confirmCount += 1;
        confirming = true;
      } else if (decision === 'close') {
        open = false;
      }
    }

    // 1) User presses Escape / clicks X.
    closeRequest();
    // 2) A stray second signal (e.g. backdrop + button) arrives while confirming.
    closeRequest();
    // 3) User confirms discard: the component clears confirming and closes.
    confirming = false;
    open = false;
    // 4) The native <dialog> close event echoes back through the same handler.
    closeRequest();

    expect(confirmCount).toBe(1);
  });

  test('a successful save (open→false) never raises the confirm', () => {
    // The dialog is dirty when the save succeeds and sets open=false; the native
    // close echo must not pop a discard prompt.
    expect(decideDialogClose({ open: false, dirty: true, confirming: false })).toBe('ignore');
  });
});
