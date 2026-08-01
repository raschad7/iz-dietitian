# Agent-Friendly Documentation Design

## Goal

Make the repository easier for people and coding agents to understand without
changing application behavior or creating a large documentation burden.

## Documentation structure

- `README.md` becomes the short entry point: product purpose, current MVP
  features, prerequisites, quick start, essential commands, repository map, and
  links to deeper documentation.
- `CLAUDE.md` remains the automatic entry point for Claude Code. It contains
  only the most important working rules and links to the shared documentation.
- `AGENTS.md` provides the same entry point for Codex and other agents that
  discover repository instructions through that filename. It points to the
  same shared sources instead of copying detailed rules.
- `docs/development.md` owns local setup, environment files, commands, testing,
  migrations, seeding, and integration setup links.
- `docs/architecture.md` owns feature boundaries, route responsibilities,
  database conventions, authentication boundaries, and external integrations.
- `docs/product-scope.md` states what the current MVP includes and names the
  major items that are intentionally outside its scope.
- `docs/design-system.md` becomes the agent-readable UI contract, moved from
  the repository root. The full `docs/Qiwam Design System.html` remains the
  detailed visual reference.

## Environment files

The application and OpenWA remain separate services with separate templates:

- `.env.example` -> `.env.local` for normal local development.
- `.env.test.example` -> `.env.test.local` for tests. The test database remains
  separate because tests can clear data.
- `infra/openwa/.env.example` -> `infra/openwa/.env` for the gateway.

Only example files are committed. Real environment files remain ignored. The
optional `WHATSAPP_TIMEOUT_MS` setting is documented in `.env.example` so the
template matches supported configuration.

## UI workflow for coding agents

Before UI work, an agent must:

1. Read `docs/design-system.md`.
2. Inspect and reuse `src/components/ui/`.
3. Inspect a similar existing screen before creating a new pattern.
4. Use the full Qiwam HTML file only when detailed visual guidance is needed.
5. Verify Arabic RTL and English LTR behavior.
6. Verify both mobile and desktop layouts.
7. Run the repository verification commands.

This keeps the large HTML document available without requiring agents to load
almost one megabyte of generated HTML for every frontend task.

## Constraints

- Do not change runtime behavior, dependencies, database schemas, or UI code.
- Do not add process documents that are unnecessary for the MVP, such as a
  changelog or a large contribution handbook.
- Keep one source of truth for each topic and use links instead of duplication.
- Preserve useful technical detail from the existing README by moving it to the
  correct focused document rather than deleting it blindly.

## Verification

- Check every internal Markdown link and referenced repository path.
- Confirm example environment files contain names only, never real secrets.
- Confirm real environment files remain ignored and untracked.
- Run formatting/lint checks that cover documentation and configuration.
- Review the final diff for duplicated or contradictory instructions.
