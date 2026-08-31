# AGENTS.md

Repository-wide instructions for coding agents working on **Enzyme / إنزيم**, a
bilingual RTL-first clinic-management application for dietitians.

The product was previously called **Qiwam / قوام**. Dated records under
`docs/superpowers/` and `.impeccable/` still use the old name and describe older
states of the system; the documents linked below are the current ones.

## Read only what the task needs

Important: Before creating any new UI component, check the existing shadcn/ui components first. Reuse and compose the existing components whenever possible (Button, Dialog, Sheet, DropdownMenu, Select, Tabs, Card, Input, etc.). Only create a custom component when there is no suitable existing shadcn component. Do not duplicate or reinvent components that already exist in the project.

- Product boundaries: [`docs/product-scope.md`](docs/product-scope.md)
- Code structure and security boundaries:
  [`docs/architecture.md`](docs/architecture.md)
- Setup, environment files, database workflow, and commands:
  [`docs/development.md`](docs/development.md)
- UI and RTL work: [`docs/design-system.md`](docs/design-system.md)

## Hard rules

- Put business logic in `src/features/<feature>/`; keep `src/app/` route files
  focused on guards, loading, and composition.
- Scope every staff read and write to the clinic from `requireStaffClinic()`.
- Reuse `src/components/ui/` and semantic design tokens.
- Use logical direction properties so the same component works in Arabic RTL
  and English LTR.
- Keep real environment files and secrets untracked.
- Do not edit unrelated user changes or generated migration snapshots.
- Take a step of `--green-*` for anything green. Raw hex and `oklch()` in
  `.tsx`/`.jsx` are a lint error; the brand mark's literals live only in
  `src/features/brand/logo.ts` and `src/features/portal/pwa/brand.ts`.

For UI work, inspect an existing screen first and verify Arabic/English plus
mobile/desktop rendering. Before handoff, run:

```bash
bun run lint
bun run typecheck
bun run test
```
