# Agent-Friendly Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make onboarding clear for people and coding agents by giving each documentation file one focused purpose and documenting every local environment file.

**Architecture:** Keep the README as a short navigation and quick-start page. Move detailed development and architecture guidance into focused files, keep a concise agent-readable design summary beside the full visual HTML reference, and give Claude Code and Codex thin repository entry points that link to shared sources of truth.

**Tech Stack:** Markdown, Git, Bun project configuration, dotenv templates

## Global Constraints

- Do not change runtime behavior, dependencies, database schemas, or UI code.
- Keep real secrets out of committed files.
- Keep `.env.local`, `.env.test.local`, and `infra/openwa/.env` ignored.
- Use links rather than copying detailed rules between documents.
- Preserve useful technical guidance from the existing README.

---

### Task 1: Environment templates and development guide

**Files:**
- Create: `.env.test.example`
- Modify: `.env.example`
- Create: `docs/development.md`

**Interfaces:**
- Consumes: existing package scripts, `.env.example`, test database safety checks, and `infra/openwa/README.md`
- Produces: one documented setup path for app, tests, and OpenWA

- [ ] **Step 1: Add the committed test template**

Create `.env.test.example` with safe placeholder/default values for `TEST_DATABASE_URL`, `BETTER_AUTH_SECRET`, and `MAIL_TRANSPORT`. The database name must end in `_test`.

- [ ] **Step 2: Complete the main template**

Add the supported optional `WHATSAPP_TIMEOUT_MS` setting to `.env.example` beside the other WhatsApp settings.

- [ ] **Step 3: Write the development guide**

Document prerequisites, the three template-copy commands, database creation and migration, important Bun commands, test-database safety, seeding, and links to the OpenWA guide.

- [ ] **Step 4: Verify environment safety**

Run names-only comparisons between templates and local files. Run `git check-ignore` for all three real environment files and confirm no secret file is tracked.

### Task 2: Architecture and product scope

**Files:**
- Create: `docs/architecture.md`
- Create: `docs/product-scope.md`

**Interfaces:**
- Consumes: current `src/app`, `src/features`, `src/db/schema`, README architecture/auth/integration sections
- Produces: stable technical boundaries and an accurate MVP feature list

- [ ] **Step 1: Write the architecture guide**

Document route/feature boundaries, shared UI location, database conventions, server actions and HTTP exceptions, localization, authentication areas, and external integrations.

- [ ] **Step 2: Write the product scope**

List the eight current feature areas and clarify that “MVP” describes the first releasable product, not a one-feature prototype. Name only clear non-goals already implied by the repository.

- [ ] **Step 3: Compare documents to the repository**

Use `rg --files` to confirm every named feature, route area, schema area, command, and integration exists.

### Task 3: Agent and design guidance

**Files:**
- Create: `AGENTS.md`
- Modify: `CLAUDE.md`
- Move: `design-system.md` to `docs/design-system.md`

**Interfaces:**
- Consumes: existing design rules, shared UI components, full Qiwam HTML reference
- Produces: short automatic instruction files and one agent-readable UI source of truth

- [ ] **Step 1: Move the design summary**

Move the existing summary to `docs/design-system.md`, update its link to the Qiwam HTML file, remove tool-specific wording, and keep the actionable token, RTL, typography, shape, and known-gap guidance.

- [ ] **Step 2: Rewrite Claude instructions**

Keep `CLAUDE.md` short. Point to development, architecture, product scope, and design documents; state required verification and UI review steps.

- [ ] **Step 3: Add Codex/agent instructions**

Create `AGENTS.md` with the same repository-wide boundaries and links without duplicating detailed documentation.

- [ ] **Step 4: Check instruction consistency**

Search for old root-level `design-system.md` links and contradictory feature lists, then correct them.

### Task 4: Replace the oversized README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: all focused documents created in Tasks 1-3
- Produces: the repository entry point

- [ ] **Step 1: Write the short README**

Include product description, current capabilities, stack summary, prerequisites, quick start, essential commands, repository map, documentation links, and default local URL.

- [ ] **Step 2: Confirm detailed guidance remains reachable**

Map the former README topics—setup, architecture, auth, WhatsApp, database, food data, AI generation, and tests—to links in the new README or focused documents.

- [ ] **Step 3: Check readability**

Measure README length and confirm it is no more than 180 lines with no stale “first feature” or incomplete feature-list wording.

### Task 5: Repository-wide verification

**Files:**
- Modify if needed: documentation files from Tasks 1-4

**Interfaces:**
- Consumes: completed documentation structure
- Produces: a reviewable, internally consistent branch

- [ ] **Step 1: Validate links and paths**

Run a local Markdown link/path checker script in memory against all changed Markdown files; confirm every relative repository path exists and every heading anchor resolves.

- [ ] **Step 2: Validate the project**

Run `bun run lint` and `bun run typecheck` to ensure moves and documentation references did not disturb the project.

- [ ] **Step 3: Review the diff**

Run `git diff --check`, inspect `git diff --stat` and the full documentation diff, and confirm no real environment file or unrelated file is included.

- [ ] **Step 4: Commit the implementation**

Stage only the planned files and commit with `docs: simplify onboarding for developers and agents`.
