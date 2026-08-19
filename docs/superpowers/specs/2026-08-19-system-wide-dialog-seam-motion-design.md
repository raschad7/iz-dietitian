# System-wide Dialog Seam Motion Design

**Date:** 2026-08-19  
**Status:** Approved for implementation  
**Scope:** Standard modal dialogs built with `Dialog` or `ConfirmDialog`

## Context

The Add Client dialog currently trials the **G. Seam** motion from the dialog-motion development harness. Its surface opens outward from a horizontal line and closes back into that line. The experiment has the intended visual character, but the behavior is local to one dialog.

The application has two shared native-dialog implementations:

- `src/components/ui/dialog.tsx` for ordinary forms and workflows.
- `src/components/ui/confirm-dialog.tsx` for short confirmations.

Some callers leave their dialog component mounted and change an `open` prop. Those callers can play both entrance and exit motion today. Other callers conditionally render the entire dialog subtree. Removing the subtree immediately skips the native dialog's closing state, so CSS alone cannot provide a system-wide exit animation.

The Add Client trial also exposed an important top-layer constraint. Calendars, selects, comboboxes, and popovers opened inside a native modal are portaled into the dialog element. A broad child animation selector captured the calendar positioner and caused the popup to flash and dismiss. System-wide motion must never target arbitrary dialog children.

## Goals

- Make G. Seam the default entrance and exit for every standard dialog.
- Preserve full exit motion even when a dialog was previously conditionally mounted.
- Keep motion behavior centralized instead of duplicating timers in feature code.
- Animate only stable semantic dialog regions, never dynamically portaled controls.
- Preserve native `<dialog>` focus trapping, Escape handling, backdrop behavior, and popup container behavior.
- Honor `prefers-reduced-motion` without leaving delayed unmounts behind.
- Keep Arabic RTL, English LTR, phone sheets, and centered desktop cards on one motion implementation.

## Non-goals

- Changing the animation of navigation drawers, planner context sheets, menus, popovers, comboboxes, selects, calendars, or date choosers.
- Redesigning dialog layout, copy, validation, or feature behavior.
- Replacing the native `<dialog>` primitive.
- Making the development motion harness part of production UI.

## Chosen Architecture

### 1. Shared Seam CSS

The existing Add Client-specific Seam rules become the standard rules for `.q-dialog`, excluding the two dialog-shaped surfaces that own separate motion:

- `.planner-context-sheet`
- `.app-navigation-drawer`

Standard dialogs use:

- Surface entrance: 300ms with `var(--ease-sweep)`.
- Backdrop entrance: 260ms with `var(--ease-sweep)`.
- Surface exit: 130ms with `ease-in`.
- Backdrop exit: 130ms with `ease-in`.

The Seam animation is placement-neutral. The previous sheet/card keyframe switch and the centered-dialog override are removed for standard dialogs. Phone sheets and centered cards both reveal from their own horizontal midpoint without implying travel from a screen edge.

The existing Seam keyframes should be renamed from Add Client-specific names to shared dialog names. The temporary `.client-form-dialog-seam` class and its CSS are removed after migration.

### 2. Semantic Motion Slots

`DialogHeader`, `DialogBody`, and `DialogFooter` receive stable `data-slot` attributes:

- `data-slot="dialog-header"`
- `data-slot="dialog-body"`
- `data-slot="dialog-footer"`

The entrance stagger targets only those slots. It does not use `> *`, element selectors such as `form`, or descendant-wide selectors. Portaled popup positioners therefore remain completely outside the content animation, even though the native dialog is their portal container.

The intended stagger is:

- Header: 90ms delay.
- Body: 140ms delay.
- Footer: 190ms delay.

Each region uses the existing 260ms child settle animation. Child animations are disabled during dialog exit so the surface closes as one coherent seam.

Feature-specific content that does not use the semantic regions still receives the surface and backdrop animation. It is not automatically targeted for a content stagger.

`ConfirmDialog` will mark equivalent stable content groups with the same semantic slots, rather than relying on arbitrary child order.

### 3. Shared Presence Lifecycle

A reusable UI-level presence helper owns delayed unmount behavior for dialogs. Given the desired `open` state, it returns whether the subtree must remain rendered:

- When `open` becomes true, presence becomes true immediately.
- When `open` becomes false, presence remains true long enough for the dialog primitive's 130ms exit and 140ms native-close timer to finish.
- The normal unmount delay is 150ms, providing a small scheduling margin.
- With reduced motion, the delay is zero.
- Reopening during the delay cancels the pending unmount.
- Unmounting the owner clears its timer.

The actual `open` value still reaches `Dialog`. Presence controls only whether the subtree exists. This distinction allows `Dialog` to set `data-closing`, play the exit, call native `close()`, and then be removed.

The helper belongs in the shared dialog UI layer because its timing is coupled to shared dialog CSS and native-close behavior. Feature components should not carry their own motion durations.

### 4. Lifecycle Migration

Dialog owners fall into two groups:

1. **Already persistent:** The component remains mounted and changes `open`. These callers keep their structure and gain shared motion automatically.
2. **Conditionally mounted:** The owner renders the dialog only while feature state is truthy. These callers adopt shared presence and pass an explicit `open` value into the dialog component.

Known conditional owners include booking appointment/new-client dialogs, request approval, the requests list dialog, client intake, notifications, and any similar callsite found during implementation. Confirmation dialogs already delay their callback until their exit completes, but their shared CSS and reduced-motion timings must remain aligned.

The Add Client trigger's local presence helper and Seam class are replaced by the shared lifecycle. Its existing focus restoration behavior remains intact.

## Interaction and Accessibility

- The native `<dialog>` remains the modal mechanism, retaining top-layer placement, focus trapping, inert background, and Escape semantics.
- Existing nested-dialog event filtering remains unchanged.
- Existing dismissal guards for pending submissions remain unchanged.
- Focus restoration occurs after the dialog is closed; feature-specific explicit restoration remains where required.
- Pointer interaction and popup portal behavior are unchanged.
- In reduced-motion mode, surface, backdrop, and content animations complete effectively immediately and presence does not impose a visible wait.

## Failure Modes and Safeguards

### Portaled calendar or select flashes and closes

Cause: a broad animation selector transforms a popup positioner inserted into the dialog.  
Safeguard: animate only explicit semantic motion slots. Never animate all direct or descendant children of `.q-dialog`.

### Exit animation is skipped

Cause: the owner removes the dialog subtree as soon as open state becomes false.  
Safeguard: use the shared presence lifecycle and keep desired-open state separate from rendered-presence state.

### Stale timer removes a reopened dialog

Cause: an outstanding delayed-unmount callback fires after reopening.  
Safeguard: cancel the timer whenever `open` becomes true and during effect cleanup.

### Motion durations drift

Cause: CSS duration, native-close timeout, and presence timeout are changed independently.  
Safeguard: name and document the shared timing constants beside the dialog primitive and reference them from the presence helper. Tests cover the ordering requirement: presence timeout must not be shorter than native close.

### Drawers or sheets inherit Seam accidentally

Cause: their native `<dialog>` elements share `.q-dialog`.  
Safeguard: retain explicit exclusions for planner context sheets and application navigation drawers in all shared Seam selectors.

## Testing Strategy

Implementation follows focused test-driven changes:

- Presence becomes immediate on open.
- Closing preserves presence for the shared delay.
- Reopening cancels delayed unmount.
- Reduced motion removes the delay.
- Shared motion timing cannot unmount before native close.
- Dialog region components expose the intended semantic slots.
- Existing nested-dialog event behavior remains covered.
- Add Client uses the shared motion path rather than a feature-specific class.
- Conditional owners pass closing state through while their subtree remains present.

Per the current user instruction, implementation will not run the full repository check suite or browser preview. Focused tests may be used while writing the behavior, and the handoff will state exactly what was and was not run.

## Documentation

The dialog motion section in `docs/design-system.md` will identify Seam as the standard dialog transition, explain the semantic-slot rule, and require shared presence for conditionally rendered dialogs.

## Acceptance Criteria

- Every standard `Dialog` and `ConfirmDialog` receives Seam entrance motion.
- Every standard dialog can complete Seam exit motion before unmount.
- Add Client no longer carries a dialog-specific Seam class or lifecycle helper.
- Opening calendars, selects, popovers, and comboboxes inside dialogs does not animate or dismiss those controls.
- Planner context sheets and navigation drawers retain their current motion.
- Reduced-motion users receive no meaningful animation or delayed disappearance.
- No dialog feature behavior, directionality, validation, or dismissal semantics regress.
