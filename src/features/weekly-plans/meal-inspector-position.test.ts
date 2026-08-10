import { describe, expect, test } from 'bun:test';

import { preferredInspectorSide } from './meal-inspector-position';

const rect = (top: number, right: number, bottom: number, left: number) => ({
  top,
  right,
  bottom,
  left,
});

describe('preferred meal inspector side', () => {
  test('opens a right-edge card toward the left', () => {
    expect(preferredInspectorSide(rect(100, 1180, 220, 1040), 1200, 800)).toBe('left');
  });

  test('opens a bottom card upward when horizontal room is tight', () => {
    expect(preferredInspectorSide(rect(620, 720, 760, 480), 1200, 800)).toBe('top');
  });

  test('uses above or below on mobile', () => {
    expect(preferredInspectorSide(rect(620, 370, 740, 20), 390, 780)).toBe('top');
  });
});
