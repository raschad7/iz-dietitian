import { describe, expect, test } from 'bun:test';

import { createStubTranslator } from './food-translate';

describe('stub translator', () => {
  test('echoes the input as keywords, so downstream search is exercised without a network', async () => {
    const translator = createStubTranslator();
    expect(await translator.toKeywords('دجاج مشوي')).toBe('دجاج مشوي');
  });
});
