import { describe, expect, test } from 'bun:test';

import { isCurrentDialogEvent } from './dialog-event';

describe('isCurrentDialogEvent', () => {
  test('ignores a close event emitted by a nested dialog', () => {
    const parentDialog = {};
    const nestedDialog = {};

    expect(
      isCurrentDialogEvent({ target: nestedDialog, currentTarget: parentDialog }),
    ).toBe(false);
  });

  test('handles the dialog own close event', () => {
    const dialog = {};

    expect(isCurrentDialogEvent({ target: dialog, currentTarget: dialog })).toBe(true);
  });
});
