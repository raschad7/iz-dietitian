# Onboarding Field Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the onboarding wizard's generic validation failure with required markers, step validation, field-specific bilingual errors, and automatic recovery to the first invalid section.

**Architecture:** Add one pure validation adapter that converts the existing Zod schemas into a stable `section + fieldErrors` contract. Server actions return that contract; the shared field components render it, while the onboarding wizard validates the visible step before navigation and moves to the server-reported section on final failure.

**Tech Stack:** React 19, Next.js server actions, TypeScript, Zod 4, next-intl, Bun tests, Qiwam UI primitives.

## Global Constraints

- Work only in the isolated `on-boarding` worktree.
- Do not modify client-portal, meal-plan, dish, or food features.
- Preserve Arabic RTL and English LTR using logical properties and localized complete messages.
- Server-side schemas remain authoritative and every action remains scoped through `requireStaffClinic()`.
- Every required label shows `*`; licence number remains optional.

---

### Task 1: Structured Validation Contract

**Files:**
- Create: `src/features/clinic-profile/validation.ts`
- Create: `src/features/clinic-profile/validation.test.ts`
- Modify: `src/features/clinic-profile/form-state.ts`
- Modify: `src/features/clinic-profile/actions.ts`

**Interfaces:**
- Produces: `validateClinicProfile(raw, sections?): { success: true; data } | { success: false; section: ProfileSection; fieldErrors: Record<string, ValidationMessageKey> }`.
- Produces: error form state containing `section` and `fieldErrors`.

- [ ] **Step 1: Write failing pure tests**

Test that empty clinic contact values map to `clinic` with the exact four field keys; invalid email and phone receive format keys; closing before opening maps to the exact weekday close field; all-off maps to `schedule`; empty professional values map to `professional`; and valid input succeeds.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test src/features/clinic-profile/validation.test.ts`

Expected: FAIL because `./validation` does not exist.

- [ ] **Step 3: Implement the adapter and form-state contract**

Use the existing schemas with `safeParse`, map Zod issue paths to form control names (`clinicPhone`, `close-2`, `professionalTitle`), and use stable message keys rather than raw Zod text. Update all four actions to return structured errors.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `bun test src/features/clinic-profile/validation.test.ts src/features/clinic-profile/schema.test.ts && bun run typecheck`

Expected: PASS.

### Task 2: Accessible Required and Inline Error UI

**Files:**
- Modify: `src/features/clinic-profile/components/profile-fields.tsx`
- Modify: `src/features/clinic-profile/components/onboarding-wizard.tsx`
- Modify: `src/features/clinic-profile/components/profile-editor.tsx`
- Modify: `src/i18n/messages/ar.json`
- Modify: `src/i18n/messages/en.json`

**Interfaces:**
- Consumes: structured `section` and `fieldErrors` from Task 1.

- [ ] **Step 1: Add a failing visible-step validation test to the pure contract**

Test that validating only `clinic` ignores untouched professional fields and that validating only `schedule` reports a schedule error. Run the focused test and verify RED.

- [ ] **Step 2: Implement required labels and field error rendering**

Add visible required markers, localized optional copy, `required`, `aria-invalid`, `aria-describedby`, and inline `role="alert"` messages. Time inputs on active working days are required.

- [ ] **Step 3: Implement step validation and error recovery**

Continue validates the visible section through the same adapter contract. Final server errors set the active step to `state.section`; focus the first `[aria-invalid="true"]` field after rendering. Profile sections consume the same errors.

- [ ] **Step 4: Add bilingual message keys**

Add complete Arabic and English messages for required, email, phone, time, closing order, and at-least-one-working-day errors.

- [ ] **Step 5: Run verification**

Run: `bun test src/features/clinic-profile && bun run lint && bun run typecheck && bun run build`.

Use the live browser to submit empty Arabic and English forms, verify the first invalid section opens, required marks and inline errors are visible, and confirm mobile/desktop layouts.

- [ ] **Step 6: Run Impeccable detector and commit**

Run: `node C:\Users\ASUS\.agents\skills\impeccable\scripts\detect.mjs --json src/features/clinic-profile/components/onboarding-wizard.tsx src/features/clinic-profile/components/profile-fields.tsx src/features/clinic-profile/components/profile-editor.tsx`

Stage only the validation scope and commit with `fix: show actionable onboarding validation`.
