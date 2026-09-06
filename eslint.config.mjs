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
      'enzyme/no-raw-hex': 'off',
    },
  },

  {
    /*
      The tenant boundary, enforced rather than only documented.

      `src/features/admin/queries.ts` is the one module in the application whose
      reads deliberately omit a `clinic_id` filter. That is correct behind
      `requireAdminSession()`, which grants a session with no clinic of its own,
      and it is a leak between tenants absolutely anywhere else — so the import
      is banned everywhere and re-allowed for the admin area alone, below.

      A ban rather than a convention because the failure is silent: an unscoped
      query imported into a staff screen returns *more* rows, not an error, and
      a reviewer has to already know this file is special to catch it.

      The whole folder is listed, not just `queries.ts`. `ai-usage.ts` and
      `pricing.ts` are pure and would be harmless to import, but "which files in
      here are safe" is exactly the judgement this rule exists to remove.
    */
    files: ['src/**/*.{ts,tsx}'],
    // A single-star path segment, NOT the literal `[locale]` directory name.
    //
    // These patterns are globs, and square brackets in a glob are a character
    // class: `[locale]` matches one character out of l, o, c, a, e — never the
    // directory actually called that. Written the obvious way the exemption
    // silently covered nothing, and the admin screens were reported against
    // their own rule. A star matches the one segment whatever it is named.
    //
    // `dev/admin` is the third entry and the only one that is not the platform
    // area itself. It is the harness that renders those screens' components over
    // a fixture, and it exists because everything under /admin sits behind
    // `requireAdminSession` — so without it the metric row, the ranked charts
    // and the activity feed are the one part of the product nobody can look at
    // while changing it. Three shipped visual bugs were found the first time it
    // was pointed at them.
    //
    // ⚠ The exemption is safe **because every route under `src/app/*/dev/`
    // calls `notFound()` when `NODE_ENV === 'production'`**, so nothing there
    // can serve a row to anyone on a deployment, scoped or not. That guard is
    // the condition of this line: a dev route that loses it takes this
    // exemption with it.
    ignores: ['src/features/admin/**', 'src/app/*/admin/**', 'src/app/*/dev/admin/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/admin/*', '**/features/admin/*'],
              message:
                'src/features/admin/ holds the platform area’s cross-clinic reads. Importing it outside /admin escapes the tenant boundary — every other screen must read through a clinic-scoped query. See "The platform area" in docs/architecture.md.',
            },
          ],
        },
      ],
    },
  },
];

export default config;
