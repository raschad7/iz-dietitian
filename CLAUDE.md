# CLAUDE.md

Repository instructions for Claude Code. Keep this file short; detailed rules
live in focused documents so they are loaded only when relevant.

## Start here

- Read [`docs/product-scope.md`](docs/product-scope.md) before changing product
  scope.
- Read [`docs/architecture.md`](docs/architecture.md) before changing code
  boundaries, authentication, database access, or integrations.
- Read [`docs/development.md`](docs/development.md) for setup, environment files,
  migrations, commands, and test safety.
- Read [`docs/design-system.md`](docs/design-system.md) before any UI work.

## Repository rules

- Business logic belongs in `src/features/<feature>/`, not route files.
- Route files resolve parameters, apply session guards, load data, and compose
  feature components.
- Staff data access must stay scoped to the clinic returned by
  `requireStaffClinic()`.
- Reuse `src/components/ui/`; add shared variants instead of copying controls
  into feature folders.
- Keep Arabic RTL and English LTR working from the same components.
- Never commit secrets or edit real `.env.local`, `.env.test.local`, or
  `infra/openwa/.env` values as part of a change.
- Do not hand-edit generated Drizzle migration snapshots.

## UI workflow

Before completing UI work:

1. Inspect a similar existing screen and the relevant shared components.
2. Follow `docs/design-system.md`; use semantic tokens and logical properties.
3. Check Arabic and English behavior.
4. Check mobile and desktop layouts.
5. Visually inspect the rendered result when browser tools are available.

## Verification

Run the checks relevant to the change, then run the full set before handoff:

```bash
bun run lint
bun run typecheck
bun run test
```

Tests require the separate database configured through `.env.test.local`.
