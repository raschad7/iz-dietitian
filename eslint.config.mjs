import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

import logicalProperties from './eslint-rules/logical-properties.mjs';
import noRawHex from './eslint-rules/no-raw-hex.mjs';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'drizzle/**', 'next-env.d.ts'],
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
    // §STEP 4 of the Qiwam rollout: hex literals belong only in globals.css.
    files: ['**/*.{tsx,jsx}'],
    plugins: {
      qiwam: noRawHex,
    },
    rules: {
      'qiwam/no-raw-hex': 'error',
    },
  },

  {
    // The rule definitions themselves contain the banned strings by necessity.
    files: ['eslint-rules/**'],
    rules: {
      'rtl/no-physical-properties': 'off',
      'qiwam/no-raw-hex': 'off',
    },
  },
];

export default config;
