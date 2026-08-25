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
    /*
      The PDF bill is drawn by @react-pdf/renderer, which is not a browser: it
      has no stylesheet, no custom properties and no Tailwind, and resolves a
      colour to ink at render time. A semantic token cannot reach it, so the
      page's four greys are literals — the one place in the app where that is
      the only option rather than a shortcut.
    */
    files: ['src/features/billing/pdf/**'],
    rules: {
      'qiwam/no-raw-hex': 'off',
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
