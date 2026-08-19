# System-wide Dialog Seam Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make G. Seam the default entrance and full exit animation for every standard dialog without animating portaled calendars, selects, or popovers.

**Architecture:** Centralize motion durations, presence retention, and semantic motion slots in the shared dialog UI layer. Replace feature-specific Add Client behavior and migrate conditionally mounted dialog owners so they pass `open={false}` through the shared primitive before unmounting.

**Tech Stack:** React 19, TypeScript, native HTML `<dialog>`, Tailwind CSS v4/global CSS, Bun test.

**Spec:** `docs/superpowers/specs/2026-08-19-system-wide-dialog-seam-motion-design.md`

## Global Constraints

- Standard surface entrance is 300ms; backdrop entrance is 260ms; surface and backdrop exit are 130ms.
- Native dialog close waits 140ms and conditional subtree removal waits 150ms.
- `.planner-context-sheet` and `.app-navigation-drawer` retain their current motion.
- Only `dialog-header`, `dialog-body`, and `dialog-footer` semantic slots receive child motion.
- Never animate arbitrary direct or descendant children of `.q-dialog`.
- Reduced motion removes animation and presence delay.
- Preserve nested-dialog filtering, popup portal containers, dismissal guards, focus restoration, RTL/LTR behavior, and feature logic.
- Do not run the full repository checks or browser preview under the current user instruction; run only the focused Bun tests listed below.
- Do not create a commit unless the user explicitly asks for one.

---

### Task 1: Shared Dialog Motion Timing and Presence

**Files:**
- Create: `src/components/ui/dialog-motion.ts`
- Create: `src/components/ui/dialog-motion.test.ts`

**Interfaces:**
- Produces: `DIALOG_EXIT_DURATION_MS = 130`, `DIALOG_NATIVE_CLOSE_DELAY_MS = 140`, `DIALOG_PRESENCE_DELAY_MS = 150`.
- Produces: `dialogPresenceDelayMs(reduceMotion: boolean): number`.
- Produces: `useDialogPresence(open: boolean): boolean`.
- Produces: `useDialogPresenceValue<T>(value: T | null | undefined): T | null`.

- [ ] **Step 1: Write the failing timing tests**

```ts
import { describe, expect, test } from 'bun:test';
import {
  DIALOG_EXIT_DURATION_MS,
  DIALOG_NATIVE_CLOSE_DELAY_MS,
  DIALOG_PRESENCE_DELAY_MS,
  dialogPresenceDelayMs,
} from './dialog-motion';

describe('dialog motion lifecycle', () => {
  test('keeps the subtree mounted after the native dialog closes', () => {
    expect(DIALOG_EXIT_DURATION_MS).toBe(130);
    expect(DIALOG_NATIVE_CLOSE_DELAY_MS).toBeGreaterThan(DIALOG_EXIT_DURATION_MS);
    expect(DIALOG_PRESENCE_DELAY_MS).toBeGreaterThan(DIALOG_NATIVE_CLOSE_DELAY_MS);
  });

  test('removes the presence delay for reduced motion', () => {
    expect(dialogPresenceDelayMs(false)).toBe(150);
    expect(dialogPresenceDelayMs(true)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `bun test src/components/ui/dialog-motion.test.ts`  
Expected: FAIL because `dialog-motion.ts` does not exist.

- [ ] **Step 3: Implement shared timings and hooks**

```ts
'use client';

import * as React from 'react';

export const DIALOG_EXIT_DURATION_MS = 130;
export const DIALOG_NATIVE_CLOSE_DELAY_MS = 140;
export const DIALOG_PRESENCE_DELAY_MS = 150;

export function dialogPresenceDelayMs(reduceMotion: boolean): number {
  return reduceMotion ? 0 : DIALOG_PRESENCE_DELAY_MS;
}

export function useDialogPresence(open: boolean): boolean {
  const [retained, setRetained] = React.useState(open);

  React.useEffect(() => {
    if (open) {
      setRetained(true);
      return;
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeout = window.setTimeout(
      () => setRetained(false),
      dialogPresenceDelayMs(reduceMotion),
    );
    return () => window.clearTimeout(timeout);
  }, [open]);

  return open || retained;
}

export function useDialogPresenceValue<T>(value: T | null | undefined): T | null {
  const present = useDialogPresence(value != null);
  const retained = React.useRef<T | null>(value ?? null);
  if (value != null) retained.current = value;
  if (!present) retained.current = null;
  return present ? retained.current : null;
}
```

- [ ] **Step 4: Run the focused timing test**

Run: `bun test src/components/ui/dialog-motion.test.ts`  
Expected: 2 PASS.

---

### Task 2: Shared Dialog Primitive and Seam CSS

**Files:**
- Modify: `src/components/ui/dialog.tsx`
- Modify: `src/components/ui/confirm-dialog.tsx`
- Modify: `src/app/globals.css`
- Extend test: `src/components/ui/dialog-motion.test.ts`

**Interfaces:**
- Consumes: `DIALOG_NATIVE_CLOSE_DELAY_MS` from Task 1.
- Produces: stable `data-slot` attributes on shared dialog regions.
- Produces: shared `.q-dialog` Seam selectors and `q-dialog-seam-*` keyframes.

- [ ] **Step 1: Add a failing source-contract test for semantic slots**

Read `dialog.tsx`, `confirm-dialog.tsx`, and `globals.css` with `Bun.file()`. Assert that the components contain `data-slot="dialog-header"`, `data-slot="dialog-body"`, and `data-slot="dialog-footer"`; CSS contains each matching slot selector; and CSS contains no `.client-form-dialog-seam`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `bun test src/components/ui/dialog-motion.test.ts`  
Expected: FAIL because shared slots and selectors do not exist yet.

- [ ] **Step 3: Add semantic slots and centralize close timing**

Import `DIALOG_NATIVE_CLOSE_DELAY_MS` into both primitives, replace literal `140`, and add fixed slots without allowing spread props to overwrite them:

```tsx
<header {...props} data-slot="dialog-header" />
<div {...props} data-slot="dialog-body" />
<div {...props} data-slot="dialog-footer" />
```

Mark stable title/content/action groups inside `ConfirmDialog` with equivalent slots.

- [ ] **Step 4: Promote Seam CSS to the standard dialog rules**

Use `q-dialog-seam-in` for the 300ms surface entrance, the existing backdrop keyframe for the 260ms backdrop entrance, and `q-dialog-seam-out` for the 130ms exit. Add 260ms slot animation with delays 90ms/140ms/190ms. Remove the centered sheet/card override and all Add Client-specific selectors. Rename the three Add Client keyframes to shared `q-dialog-seam-*` names.

- [ ] **Step 5: Preserve reduced motion and exclusions**

Keep planner/navigation exclusions on every shared selector. Disable semantic-slot animation in the reduced-motion block and reduce surface/backdrop durations effectively to zero.

- [ ] **Step 6: Run focused primitive tests**

Run: `bun test src/components/ui/dialog-motion.test.ts src/components/ui/dialog-close.test.ts`  
Expected: all tests PASS.

---

### Task 3: Replace Add Client-specific Motion

**Files:**
- Modify: `src/features/clients/components/client-form-trigger.tsx`
- Delete: `src/features/clients/client-form-motion.ts`
- Delete: `src/features/clients/client-form-motion.test.ts`
- Extend test: `src/components/ui/dialog-motion.test.ts`

**Interfaces:**
- Consumes: `useDialogPresence(open)`.
- Removes: `clientFormDialogMotionClass()` and `clientFormDialogUnmountDelayMs()`.

- [ ] **Step 1: Add a failing migration assertion**

Assert that `client-form-trigger.tsx` imports and calls `useDialogPresence`, does not reference `client-form-dialog-seam`, and does not import `client-form-motion`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `bun test src/components/ui/dialog-motion.test.ts`  
Expected: FAIL while Add Client uses its local helper.

- [ ] **Step 3: Replace local lifecycle with shared presence**

Use `const dialogPresent = useDialogPresence(open)`; render the portal while `dialogPresent`; pass the real `open` state into `Dialog`; remove the special class and timer. Preserve existing trigger focus restoration.

- [ ] **Step 4: Delete obsolete files and rerun**

Run: `bun test src/components/ui/dialog-motion.test.ts`  
Expected: all tests PASS and no source imports the deleted module.

---

### Task 4: Migrate Boolean Conditional Dialog Owners

**Files:**
- Modify: `src/features/clients/components/intake-form-trigger.tsx`
- Modify: `src/features/requests/components/requests-dialog-trigger.tsx`
- Modify: `src/features/notifications/components/notifications-bell.tsx`
- Modify: `src/features/requests/components/appointment-request-actions.tsx`
- Modify: `src/features/requests/components/approve-dialog.tsx`
- Extend test: `src/components/ui/dialog-motion.test.ts`

**Interfaces:**
- Consumes: `useDialogPresence(open): boolean`.
- Changes: `ApproveDialogProps` gains `open: boolean`; `ApproveDialog` passes it to shared `Dialog`.

- [ ] **Step 1: Add failing source-contract assertions**

For each owner, assert that it calls `useDialogPresence` and gates rendering with returned presence while passing the desired-open boolean to `Dialog`. Assert that `ApproveDialog` declares `open: boolean` and renders `<Dialog open={open}`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `bun test src/components/ui/dialog-motion.test.ts`  
Expected: FAIL for each unmigrated owner.

- [ ] **Step 3: Migrate the portal triggers**

For intake, requests, and notifications, retain the appropriate state (`open` or `allOpen`) with `useDialogPresence`, render `createPortal(...)` while present, and pass the original state to `<Dialog open={...}>`.

- [ ] **Step 4: Migrate request approval**

Add `open` to `ApproveDialogProps`. In `AppointmentRequestActions`, retain the subtree with `useDialogPresence(open)`, render while present, and pass `open={open}`. Preserve existing error handling.

- [ ] **Step 5: Run the focused migration test**

Run: `bun test src/components/ui/dialog-motion.test.ts`  
Expected: all tests PASS.

---

### Task 5: Migrate Payload Conditional Booking Dialogs

**Files:**
- Modify: `src/features/booking/components/calendar.tsx`
- Modify: `src/features/booking/components/new-client-dialog.tsx`
- Modify: `src/features/booking/components/appointment-dialog.tsx`
- Extend test: `src/components/ui/dialog-motion.test.ts`

**Interfaces:**
- Consumes: `useDialogPresenceValue<T>(value): T | null`.
- Changes: `NewClientDialogProps` and `AppointmentDialogProps` gain `open: boolean`.

- [ ] **Step 1: Add failing booking assertions**

Assert Calendar retains `newClientFor` and `editing` with `useDialogPresenceValue`, while each child accepts `open` and passes it to shared `Dialog` rather than hardcoding `open`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `bun test src/components/ui/dialog-motion.test.ts`  
Expected: FAIL because both booking dialogs unmount immediately.

- [ ] **Step 3: Retain booking payloads through exit**

```ts
const presentedNewClientFor = useDialogPresenceValue(newClientFor);
const presentedEditing = useDialogPresenceValue(editing);
```

Render from retained payloads, but pass `open={newClientFor != null}` and `open={editing != null}`. Keep save, delete, navigation, and close callbacks unchanged.

- [ ] **Step 4: Update both child interfaces**

Add `open: boolean` to each prop type and replace `<Dialog open ...>` with `<Dialog open={open} ...>`.

- [ ] **Step 5: Run the focused migration test**

Run: `bun test src/components/ui/dialog-motion.test.ts`  
Expected: all tests PASS.

---

### Task 6: Inventory Audit and Documentation

**Files:**
- Modify: `docs/design-system.md`
- Extend test: `src/components/ui/dialog-motion.test.ts`

**Interfaces:**
- Consumes: all shared motion and presence interfaces.
- Produces: documented future-dialog rule and final conditional-mount audit.

- [ ] **Step 1: Audit all standard callsites**

Run `rg -n "<Dialog|<ConfirmDialog" src --glob "*.tsx"`. Classify every callsite as always mounted, protected by shared presence, or self-retained by `ConfirmDialog`. Migrate any missed conditional owner using Task 4 or Task 5's exact pattern.

- [ ] **Step 2: Add final regression assertions**

Assert production feature sources contain no `client-form-dialog-seam`, no import of `client-form-motion`, and no known hardcoded conditional pattern among audited owners.

- [ ] **Step 3: Update the design system**

Document that G. Seam is the standard dialog transition; conditional owners require shared presence; content motion uses only semantic regions; arbitrary child animation selectors are prohibited because portaled controls live inside native dialogs; planner sheets and navigation drawers retain separate motion.

- [ ] **Step 4: Run only focused tests**

Run: `bun test src/components/ui/dialog-motion.test.ts src/components/ui/dialog-close.test.ts`  
Expected: all focused tests PASS.

- [ ] **Step 5: Review the final diff**

Run `git diff --check` and inspect the scoped diff. Do not run lint, typecheck, the full test suite, or browser preview. Report exactly what was and was not run.

