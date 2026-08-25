import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

import logicalProperties from './eslint-rules/logical-properties.mjs';
import noRawHex from './eslint-rules/no-raw-hex.mjs';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    /**
     * `.claude/**` is vendored tooling — agent skills and their helper scripts,
     * committed so the workflow travels with the repo but not written against
     * this project's rules. Linting it reports on code we do not maintain.
     */
    ignores: ['.next/**', 'node_modules/**', 'drizzle/**', '.claude/**', 'next-env.d.ts'],
  },

  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    files: ['**/*.{ts,tsx,js,jsx,mjs}'],
    plugins: {
      rtl: logicalProperties,
    },
    rules: {
      /**
       * RTL-first: physical left/right utilities are an error everywhere.
       * See eslint-rules/logical-properties.mjs for the rationale.
       */
      'rtl/no-physical-properties': 'error',

      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  {
    // Hex literals belong only in globals.css; a hex in a component is a token
    // that skipped the design system. See docs/design-system.md.
    files: ['**/*.{tsx,jsx}'],
    plugins: {
      enzyme: noRawHex,
    },
    rules: {
      'enzyme/no-raw-hex': 'error',
    },
  },

  {
    // The rule definitions themselves contain the banned strings by necessity.
    files: ['eslint-rules/**'],
    rules: {
      'rtl/no-physical-properties': 'off',
      'enzyme/no-raw-hex': 'off',
    },
  },
];

export default config;
