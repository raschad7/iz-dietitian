import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

import logicalProperties from './eslint-rules/logical-properties.mjs';

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
    // The rule definition itself contains the banned strings by necessity.
    files: ['eslint-rules/**'],
    rules: {
      'rtl/no-physical-properties': 'off',
    },
  },
];

export default config;
