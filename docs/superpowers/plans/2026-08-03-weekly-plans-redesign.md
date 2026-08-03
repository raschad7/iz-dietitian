# Weekly Plans Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the weekly plans board's presentation — design-system compliance, an aligned card grid with one calorie figure per card, a searchable client picker replacing the client rail, a new-week dialog, redesigned rail panels, and three responsive layouts.

**Architecture:** Presentation only. Every `.ts` file in `src/features/weekly-plans/` stays untouched; if a task requires editing one, the change has exceeded the design. Logic that would otherwise be trapped inside JSX (drift direction, band geometry, dialog mode) is extracted into small pure modules that are unit-tested, and the components consume them. Two new shared components go in `src/components/ui/`.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, Tailwind v4, `@base-ui/react` primitives, `next-intl`, `@dnd-kit/core`, `bun test`.

---

## Before you start

**Read these first:**
- [`docs/superpowers/specs/2026-08-03-weekly-plans-redesign-design.md`](../specs/2026-08-03-weekly-plans-redesign-design.md) — the design this plan implements. Section numbers below refer to it.
- [`docs/design-system.md`](../../design-system.md) — the type scale, the 40px control floor, the Arc, the RTL rules. Not optional; most of this plan is enforcing it.

**How this repo tests.** Every test is `bun:test`, colocated as `*.test.ts` beside its module, and asserts on **pure functions**. There is no jsdom, no `@testing-library/*`, no component rendering in tests — check `package.json` if you doubt it. Do not add a DOM-testing stack; it is out of scope for this plan and would be a much larger decision than it looks.

That means tasks split into two kinds:

- **Logic tasks** follow strict TDD: write the failing test, watch it fail, implement, watch it pass, commit.
- **Component tasks** have no red-green cycle available. Their verification is `bun run lint && bun run typecheck`, plus rendering the page and looking at it in both Arabic and English. Each such task says exactly what to look at. Do not skip the visual check and do not claim a component task passed because typecheck passed.

**Commit style.** Match the repo, not conventional-commits. Look at `git log` — messages are sentences describing the change and why (`Scope the seed's client purge to its own clinic`), not `feat:` prefixes.

**Running the app.** `bun run dev`, then `/ar/app/weekly-plans/<clientId>`. You need seeded data: `bun run db:seed` then `bun run db:seed:dishes`.

**Do not hand-edit** generated files: `src/lib/icons.generated.ts` (run `bun run icons:generate`) or Drizzle migration snapshots.

---

## File structure

**Created:**

| File | Responsibility |
|---|---|
| `src/features/weekly-plans/drift.ts` | Is a value over, under, or within tolerance of its target. One rule, two thresholds. |
| `src/features/weekly-plans/drift.test.ts` | Tests for the above. |
| `src/features/weekly-plans/band.ts` | Turns a day total and target into comfort-band geometry percentages. |
| `src/features/weekly-plans/band.test.ts` | Tests for the above. |
| `src/features/weekly-plans/new-week.ts` | Whether the new-week dialog creates a week or regenerates the open draft. |
| `src/features/weekly-plans/new-week.test.ts` | Tests for the above. |
| `src/components/ui/comfort-band.tsx` | The three-stop band: track, tolerance span, value marker. |
| `src/components/ui/combobox.tsx` | Searchable single-select, wrapping `@base-ui/react/combobox`. |
| `src/features/weekly-plans/components/client-picker.tsx` | The combobox bound to clients, navigating on select. |
| `src/features/weekly-plans/components/new-week-dialog.tsx` | The three doors, in a dialog. |
| `src/features/weekly-plans/components/board-sheet.tsx` | Holds the rail below `xl`. |

**Deleted:** `client-rail.tsx`, `new-week-menu.tsx`.

**Modified:** `meal-card.tsx`, `day-column.tsx`, `plan-board.tsx`, `meal-detail-panel.tsx`, `context-panel.tsx`, `dish-catalog.tsx`, `plan-history.tsx`, `generate-form.tsx`, `src/components/ui/dialog.tsx`, `scripts/generate-icons.ts`, both `weekly-plans` route files, `src/i18n/messages/{ar,en}.json`.

**Untouched, deliberately:** `actions.ts`, `editor-actions.ts`, `editor-mutations.ts`, `editor-state.ts`, `queries.ts`, `generate.ts`, `nutrition.ts`, `targets.ts`, `similar.ts`, `skeleton.ts`, `usage.ts`, `week.ts`, `prompt.ts`, `llm.ts`, `schema.ts`.

---

## Task 1: Icons for the controls that lose their typed glyphs

Spec §1. The board renders `⠿ × 🗑 − + ⟲ ← ↑ ↓` as literal characters. They become Solar Bold glyphs.

**Files:**
- Modify: `scripts/generate-icons.ts`
- Generated: `src/lib/icons.generated.ts` (do not hand-edit)

- [ ] **Step 1: Add the names**

In `scripts/generate-icons.ts`, inside the `ICONS` object, add a block after the existing `// Actions` group. Names describe the **role**, not the picture — that is the rule stated at the top of that file.

```ts
  // Weekly plan board
  /** The separate handle that starts a drag, so dragging never steals the click. */
  dragHandle: 'menu-dots-bold',
  /** Empties a slot without removing it from the day. */
  clearSlot: 'eraser-bold',
  /** A value that overshot its target. */
  driftUp: 'arrow-up-bold',
  /** A value that undershot its target. */
  driftDown: 'arrow-down-bold',
  /** A dish repeated from the plan being compared against. */
  repeat: 'restart-bold',
  minus: 'minus-circle-bold',
```

`add`, `close`, `trash` and `refresh` already exist — reuse them rather than adding near-duplicates.

- [ ] **Step 2: Generate**

Run: `bun run icons:generate`
Expected: writes `src/lib/icons.generated.ts` with no error. The new keys appear in the generated `ICON_PATHS`.

- [ ] **Step 3: Confirm the union picked them up**

Run: `bun run typecheck`
Expected: PASS. If a Solar name above does not exist, the script throws at generate time naming the missing icon — pick the nearest Solar Bold equivalent and note the substitution in the commit message.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-icons.ts src/lib/icons.generated.ts
git commit -m "Add the board's icons to the generated set

The weekly plan board draws its drag handle, steppers and drift markers
as literal characters, which renders differently per platform and matches
no other screen. These are the Solar Bold glyphs that replace them."
```

---

## Task 2: The drift rule

Spec §2, §6. Meal cards and day headers both ask "is this figure far enough from its target to say so", with different thresholds. Today that logic is inline in two components with two different hardcoded numbers.

**Files:**
- Create: `src/features/weekly-plans/drift.ts`
- Test: `src/features/weekly-plans/drift.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/weekly-plans/drift.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { DAY_TOLERANCE, MEAL_TOLERANCE, driftState } from './drift';

describe('driftState', () => {
  test('says nothing while the value is inside the tolerance', () => {
    expect(driftState(2005, 2000, DAY_TOLERANCE)).toBeNull();
    expect(driftState(1900, 2000, DAY_TOLERANCE)).toBeNull();
  });

  test('marks a value above the tolerance as over', () => {
    expect(driftState(2380, 2000, DAY_TOLERANCE)).toBe('over');
    expect(driftState(870, 700, MEAL_TOLERANCE)).toBe('over');
  });

  test('marks a value below the tolerance as under', () => {
    expect(driftState(1600, 2000, DAY_TOLERANCE)).toBe('under');
    expect(driftState(520, 700, MEAL_TOLERANCE)).toBe('under');
  });

  // The boundary is the case a hardcoded `>` or `>=` gets wrong, and the one a
  // reader will hit constantly — a 10% day is exactly 2200 on a 2000 target.
  test('treats a value exactly on the tolerance as inside it', () => {
    expect(driftState(2200, 2000, DAY_TOLERANCE)).toBeNull();
    expect(driftState(1800, 2000, DAY_TOLERANCE)).toBeNull();
  });

  // A slot with no budget and a plan with no target both reach here. Neither is
  // a drift; there is nothing to drift from.
  test('says nothing when there is no target to compare against', () => {
    expect(driftState(500, 0, MEAL_TOLERANCE)).toBeNull();
    expect(driftState(500, -1, MEAL_TOLERANCE)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/features/weekly-plans/drift.test.ts`
Expected: FAIL — `Cannot find module './drift'`.

- [ ] **Step 3: Write the implementation**

Create `src/features/weekly-plans/drift.ts`:

```ts
/**
 * How far a figure may sit from its target before the board says so.
 *
 * Two thresholds because the two readings are different questions. A meal is
 * compared against its slot's share, and 15% is the same band `similar.ts` uses
 * to decide whether a dish counts as a substitute — a meal that would not
 * qualify as a swap for its own slot is worth a second look. A day is compared
 * against the whole target, where errors have had five meals to accumulate and
 * cancel, so 10% is the tighter figure it earns.
 */
export const MEAL_TOLERANCE = 0.15;
export const DAY_TOLERANCE = 0.1;

/** Which way a figure missed, or `null` while it has not. */
export type Drift = 'over' | 'under' | null;

/**
 * The boundary is deliberately inclusive: a day exactly 10% above target is
 * inside the tolerance, not outside it. A board that flags the round number
 * everyone aims at teaches the dietitian to ignore the mark.
 */
export function driftState(value: number, target: number, tolerance: number): Drift {
  // No target is not a target of zero. A slot without a budget has nothing to
  // drift from, and dividing by it would report every value as infinitely over.
  if (target <= 0) return null;

  const ratio = (value - target) / target;

  if (ratio > tolerance) return 'over';
  if (ratio < -tolerance) return 'under';

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/features/weekly-plans/drift.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/weekly-plans/drift.ts src/features/weekly-plans/drift.test.ts
git commit -m "Extract the board's drift rule into one tested module

The meal card and the day column each computed \"is this far enough from
target to mark\" inline, against two separately hardcoded thresholds. This
is a behaviour-preserving extraction: both sites used
\`Math.abs(drift) > TOLERANCE\`, which is already inclusive at exactly the
tolerance, and driftState keeps that. What the tests add is a boundary
case nothing was pinning down before, and a direction the old boolean
threw away."
```

---

## Task 3: Comfort band geometry

Spec §6. The band's three positions are arithmetic, and arithmetic inside JSX is arithmetic nobody can test.

**Files:**
- Create: `src/features/weekly-plans/band.ts`
- Test: `src/features/weekly-plans/band.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/weekly-plans/band.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { bandGeometry } from './band';

describe('bandGeometry', () => {
  // The track runs to 125% of target, so a 2000 target spans 2500: the
  // tolerance sits at 1800-2200, which is 72%-88% of the track.
  test('places the tolerance span against the track ceiling', () => {
    const band = bandGeometry(2005, 2000);

    expect(band?.rangeStart).toBeCloseTo(72, 5);
    expect(band?.rangeWidth).toBeCloseTo(16, 5);
  });

  test('places the marker at the value position along the track', () => {
    expect(bandGeometry(2133, 2000)?.marker).toBeCloseTo(85.32, 2);
    expect(bandGeometry(1903, 2000)?.marker).toBeCloseTo(76.12, 2);
  });

  test('carries the drift state so the marker and the total agree', () => {
    expect(bandGeometry(2005, 2000)?.state).toBeNull();
    expect(bandGeometry(2380, 2000)?.state).toBe('over');
    expect(bandGeometry(1600, 2000)?.state).toBe('under');
  });

  // A day can exceed the ceiling. The marker pins to the end rather than
  // overflowing the track, and the state still reports the miss.
  test('pins a marker past the ceiling to the end of the track', () => {
    const band = bandGeometry(4000, 2000);

    expect(band?.marker).toBe(100);
    expect(band?.state).toBe('over');
  });

  test('pins a marker at or below zero to the start of the track', () => {
    expect(bandGeometry(0, 2000)?.marker).toBe(0);
  });

  // An empty plan and a client with no computable target both reach here.
  test('has no geometry without a target', () => {
    expect(bandGeometry(500, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/features/weekly-plans/band.test.ts`
Expected: FAIL — `Cannot find module './band'`.

- [ ] **Step 3: Write the implementation**

Create `src/features/weekly-plans/band.ts`:

```ts
import { DAY_TOLERANCE, driftState, type Drift } from './drift';

/**
 * Where the track ends, as a multiple of the daily target.
 *
 * A plain progress bar capped at the target renders a 2133 day and a 2000 day
 * identically — both full — which is the one comparison the dietitian is
 * scanning for. Running the track past the target gives the overshoot somewhere
 * to be drawn.
 */
const CEILING = 1.25;

export type BandGeometry = {
  /** Percent along the track where the tolerance span begins. */
  rangeStart: number;
  /** The tolerance span's width, in percent of the track. */
  rangeWidth: number;
  /** Percent along the track where the day actually landed. */
  marker: number;
  state: Drift;
};

/**
 * The band's three positions, as percentages of the track.
 *
 * Percentages rather than pixels so the band is width-agnostic, and so the
 * caller sets them as inline-start offsets — which mirror in Arabic without an
 * override, per the RTL rules.
 */
export function bandGeometry(total: number, target: number): BandGeometry | null {
  if (target <= 0) return null;

  const span = target * CEILING;
  const at = (value: number) => Math.min(100, Math.max(0, (value / span) * 100));

  const rangeStart = at(target * (1 - DAY_TOLERANCE));

  return {
    rangeStart,
    rangeWidth: at(target * (1 + DAY_TOLERANCE)) - rangeStart,
    marker: at(total),
    state: driftState(total, target, DAY_TOLERANCE),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/features/weekly-plans/band.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/weekly-plans/band.ts src/features/weekly-plans/band.test.ts
git commit -m "Add the comfort band's geometry

The day column showed a bare total against a bare target. The band draws
the tolerance and where the day landed inside it, using the viz-band-*
tokens the design system already defines for exactly this."
```

---

## Task 4: The ComfortBand component

Spec §6. Shared, because it is a general "value against a tolerance" mark and the day column is only its first caller.

**Files:**
- Create: `src/components/ui/comfort-band.tsx`

- [ ] **Step 1: Write the component**

`@base-ui/react/meter` exists but does not fit: its `Indicator` is a single fill from one edge, and this mark needs a **span** plus a separate **marker**. Composing two Meters to fake that would be worse than the twenty lines below, so this is plain markup with explicit ARIA.

Create `src/components/ui/comfort-band.tsx`:

```tsx
import { cn } from '@/lib/utils';

import type { BandGeometry } from '@/features/weekly-plans/band';

/**
 * A value against a tolerance, drawn as a track, a comfortable span, and a mark.
 *
 * The three stops the brand defines — `viz-band-range`, `viz-band-edge`,
 * `viz-band-marker`. Drawn in the visualisation tokens rather than in olive,
 * because olive marks what you can act on and this is a reading.
 *
 * Redundant on purpose: whatever this band shows is also printed as a number
 * beside it. The mark is a way to see the answer without reading, never the
 * only way to get it.
 */
export function ComfortBand({
  band,
  label,
  className,
}: {
  band: BandGeometry;
  /** Announced instead of the geometry — "2133 of 2000 calories", not "85%". */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="meter"
      aria-valuetext={label}
      aria-label={label}
      className={cn('relative h-1.5 rounded-full bg-muted', className)}
    >
      {/* Inline styles because these are computed positions, not design
          decisions — there is no utility class for "72.4%". */}
      <span
        aria-hidden
        className="absolute inset-block-0 border-x border-viz-band-edge bg-viz-band-range"
        style={{ insetInlineStart: `${band.rangeStart}%`, width: `${band.rangeWidth}%` }}
      />

      <span
        aria-hidden
        className={cn(
          '-inset-block-0.5 absolute w-[3px] rounded-full',
          band.state === null ? 'bg-viz-band-marker' : 'bg-status-attention-fg',
        )}
        style={{ insetInlineStart: `${band.marker}%` }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints**

Run: `bun run typecheck && bun run lint`
Expected: PASS. The lint run also enforces `eslint-rules/no-raw-hex.mjs` and `eslint-rules/logical-properties.mjs` — if either fires, you have used a hex or a physical property and must fix it rather than disable the rule.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/comfort-band.tsx
git commit -m "Add the ComfortBand mark

A value against a tolerance, in the viz-band-* tokens. Base UI's Meter
fills from one edge and cannot draw a span plus a separate marker."
```

---

## Task 5: The Combobox

Spec §3. `select.tsx` is a native `<select>` and cannot filter; the design system lists autocomplete as a known gap.

**Files:**
- Create: `src/components/ui/combobox.tsx`

- [ ] **Step 1: Read the primitive's API before writing**

Run: `ls node_modules/@base-ui/react/combobox/`
Expected: directories including `root`, `input`, `list`, `item`, `popup`, `positioner`, `portal`, `empty`, `trigger`.

Base UI does the filtering, the keyboard model, `aria-expanded`, `aria-activedescendant` and the focus contract. Do not reimplement any of it. Follow the wrapping pattern `src/components/ui/input.tsx` and `button.tsx` already use: import the primitive, apply this system's classes, export.

- [ ] **Step 2: Write the component**

Create `src/components/ui/combobox.tsx`:

```tsx
'use client';

import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * A searchable single-select.
 *
 * Wraps Base UI rather than hand-rolling the listbox: the keyboard model,
 * `aria-activedescendant`, the focus contract and the filtering are the part
 * that is hard to get right and easy to get subtly wrong.
 *
 * Deliberately narrow — one value, no multi-select, no async loading, no
 * free-text entry. The client picker needs exactly this, and every extra mode
 * is a state nobody has a caller for.
 */
export type ComboboxOption<T> = {
  value: T;
  /** What the input filters on and shows once chosen. */
  label: string;
  /** Optional trailing content — a status badge, a count. */
  meta?: React.ReactNode;
  /** Optional leading mark — the client's stored colour. */
  swatch?: string;
};

export function Combobox<T extends string>({
  options,
  value,
  onValueChange,
  label,
  placeholder,
  emptyMessage,
  className,
}: {
  options: readonly ComboboxOption<T>[];
  value: T | null;
  onValueChange: (value: T | null) => void;
  /** The accessible name. Required — an unlabelled combobox is unusable. */
  label: string;
  placeholder: string;
  emptyMessage: string;
  className?: string;
}) {
  return (
    <ComboboxPrimitive.Root
      items={options as ComboboxOption<T>[]}
      value={options.find((option) => option.value === value) ?? null}
      onValueChange={(next) => onValueChange((next as ComboboxOption<T> | null)?.value ?? null)}
      itemToStringLabel={(option) => (option as ComboboxOption<T>).label}
    >
      <div className={cn('relative', className)}>
        <ComboboxPrimitive.Input
          aria-label={label}
          placeholder={placeholder}
          className="q-field h-12 w-full px-5 pe-11"
        />

        <ComboboxPrimitive.Trigger
          aria-label={label}
          className="absolute inset-block-0 end-0 flex w-11 items-center justify-center text-muted-foreground"
        >
          <Icon name="chevronDown" className="size-4" />
        </ComboboxPrimitive.Trigger>
      </div>

      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner sideOffset={4} className="z-50">
          <ComboboxPrimitive.Popup className="max-h-80 w-[var(--anchor-width)] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-elevated">
            <ComboboxPrimitive.Empty className="px-3 py-2 text-body-sm text-muted-foreground">
              {emptyMessage}
            </ComboboxPrimitive.Empty>

            <ComboboxPrimitive.List>
              {(option: ComboboxOption<T>) => (
                <ComboboxPrimitive.Item
                  key={option.value}
                  value={option}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-body-sm data-[highlighted]:bg-accent data-[selected]:bg-accent"
                >
                  {option.swatch ? (
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      // Per-record colour, not a token — see "Arbitrary colour"
                      // in the design system.
                      style={{ backgroundColor: option.swatch }}
                    />
                  ) : null}

                  <span className="min-w-0 flex-1 truncate">{option.label}</span>

                  {option.meta}
                </ComboboxPrimitive.Item>
              )}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  );
}
```

- [ ] **Step 3: Reconcile against the real typings**

Run: `bun run typecheck`
Expected: PASS.

If it fails, the primitive's prop or part names differ from the above — read `node_modules/@base-ui/react/combobox/root/ComboboxRoot.d.ts` and the relevant part's `.d.ts` and correct the call. **Do not** cast to `any` or add `@ts-expect-error` to get past it; the whole reason for wrapping a primitive is that its contract is enforced.

- [ ] **Step 4: Lint**

Run: `bun run lint`
Expected: PASS. `pe-11` and `end-0` above are logical properties; if you reached for `pr-11` or `right-0`, the lint rule will catch it.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/combobox.tsx
git commit -m "Add a searchable Combobox on the Base UI primitive

Select is a native <select> and cannot filter, which the client picker
needs. Wrapping the primitive the way Button and Input already do keeps
the keyboard model and ARIA contract off our hands."
```

---

## Task 6: A wide variant for Dialog

Spec §4. `Dialog` is capped at `sm:w-[min(28rem,...)]`. Three side-by-side doors do not fit in 448px. The design system's rule is to add a variant rather than pass ad-hoc classes.

**Files:**
- Modify: `src/components/ui/dialog.tsx:43-84`

- [ ] **Step 1: Add the prop**

In `src/components/ui/dialog.tsx`, add `size` to `DialogProps`:

```tsx
  /**
   * `wide` is for a dialog whose content is a row of choices rather than a
   * form — the default 28rem forces three columns into one. It stays a full
   * bottom sheet on a phone like every other dialog.
   */
  size?: 'default' | 'wide';
```

Destructure it in the signature with a default:

```tsx
function Dialog({ open, onClose, label, dir, flat, size = 'default', className, children }: DialogProps) {
```

Then replace the width line in the `cn(...)` call:

```tsx
        'mt-auto mb-0 rounded-t-2xl',
        size === 'wide'
          ? 'sm:m-auto sm:w-[min(64rem,calc(100vw-4rem))] sm:rounded-lg sm:rounded-ee-4xl'
          : 'sm:m-auto sm:w-[min(28rem,calc(100vw-2rem))] sm:rounded-lg sm:rounded-ee-4xl',
```

- [ ] **Step 2: Verify nothing else moved**

Run: `bun run typecheck && bun run lint`
Expected: PASS. `size` is optional, so every existing `Dialog` caller is unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/dialog.tsx
git commit -m "Give Dialog a wide size

A dialog offering three side-by-side choices does not fit the 28rem a
form dialog wants. A variant rather than a className, so the two widths
stay a decision the component owns."
```

---

## Task 7: The meal card

Spec §2. One number, a drift arrow, no control row, drag handle on hover.

**Files:**
- Modify: `src/features/weekly-plans/components/meal-card.tsx` (whole file)
- Modify: `src/i18n/messages/ar.json`, `src/i18n/messages/en.json`

- [ ] **Step 1: Add the translation keys**

In both message files, inside `weeklyPlans`, add:

```json
      "budgetHint": "المفروض {value} سعرة",
      "overBudget": "أكبر من المفروض",
      "underBudget": "أقل من المفروض",
```

English (`en.json`):

```json
      "budgetHint": "Should be {value} kcal",
      "overBudget": "Over its share",
      "underBudget": "Under its share",
```

Delete the now-unused `lessPortion`, `morePortion`, `clearMeal`, `removeMeal` keys **only after Task 9** puts them on the detail panel — they move, they do not disappear.

- [ ] **Step 2: Rewrite the card**

Replace the whole of `src/features/weekly-plans/components/meal-card.tsx`:

```tsx
'use client';

import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useTranslations } from 'next-intl';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

import { MEAL_TOLERANCE, driftState } from '@/features/weekly-plans/drift';
import { roundForDisplay } from '@/features/weekly-plans/nutrition';
import type { BoardMeal } from '../queries';

import { useEditorActions } from './board-dnd';

/** What the same slot held in the plan being compared against. */
export type GhostMeal = { nameAr: string; isRepeat: boolean };

/**
 * One meal in a day column.
 *
 * Information only. Every control that used to sit here — the stepper, clear,
 * remove — is in the detail panel this card opens, at a size the button spec
 * allows; five 16px targets on each of thirty-five cards was both unhittable
 * and the loudest thing on the board.
 *
 * The card is a button, because opening the detail panel is an action and has
 * to be reachable from the keyboard. The drag handle stays separate so dragging
 * never steals that click, and appears on hover because dragging is a pointer
 * gesture and a handle nobody can use is chrome.
 */
export function MealCard({
  meal,
  selected,
  onSelect,
  ghost,
  compareDate,
  editable,
}: {
  meal: BoardMeal;
  selected: boolean;
  onSelect: () => void;
  ghost?: GhostMeal | null;
  compareDate?: string;
  editable: boolean;
}) {
  const t = useTranslations('weeklyPlans');
  const { dragging } = useEditorActions();

  const kcal = roundForDisplay('kcal', meal.totals.kcal.value);
  const drift = meal.dish === null ? null : driftState(kcal, meal.budgetKcal, MEAL_TOLERANCE);

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `slot:${meal.id}`,
    disabled: !editable,
    data: { mealId: meal.id },
  });

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `meal:${meal.id}`,
    disabled: !editable || meal.dish === null,
    data: { kind: 'meal', mealId: meal.id },
  });

  // Only light up for a drop that would actually land — a drag over its own
  // source slot changes nothing, and saying otherwise is a lie the pointer can
  // see.
  const wouldLand =
    isOver && dragging !== null && !(dragging.kind === 'meal' && dragging.mealId === meal.id);

  return (
    <div
      ref={setDropRef}
      className={cn(
        'group relative rounded-lg border transition-colors',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
        meal.dish === null && 'border-dashed bg-muted/40',
        wouldLand && 'border-primary bg-primary/10',
        isDragging && 'opacity-40',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        // The budget is not printed on the card — it is the same five figures
        // repeated down every column. It stays reachable here, in the detail
        // panel, and in the rail's schedule.
        title={meal.budgetKcal > 0 ? t('budgetHint', { value: meal.budgetKcal }) : undefined}
        className={cn(
          'flex h-full w-full flex-col p-3 text-start',
          selected ? 'bg-primary/5' : 'hover:bg-accent/50',
        )}
      >
        <span className="flex items-baseline justify-between gap-1.5 text-caption text-muted-foreground">
          <span className="min-w-0 truncate">{meal.label}</span>
          <span className="shrink-0" dir="ltr">
            {meal.timeOfDay}
          </span>
        </span>

        {/* Flexes, so the footer below pins to the card's block-end edge and
            every figure in a row shares a baseline. Clamped to two lines, or
            one long dish name sets the height of all thirty-five cards. */}
        <span className="mt-1 line-clamp-2 flex-1 text-body-sm font-medium leading-snug">
          {meal.dish ? meal.dish.nameAr : t('emptySlot')}
        </span>

        {meal.dish && !meal.dish.isActive && (
          <span className="mt-1 block text-caption text-muted-foreground">{t('retiredDish')}</span>
        )}

        <span className="mt-2 flex items-baseline justify-between gap-1.5">
          <span
            className={cn(
              'inline-flex items-baseline gap-1 text-body-sm font-semibold',
              drift !== null && 'text-status-attention-fg',
              meal.dish === null && 'font-normal text-muted-foreground',
            )}
          >
            {drift !== null && (
              <Icon
                name={drift === 'over' ? 'driftUp' : 'driftDown'}
                className="size-3.5 self-center"
                aria-label={t(drift === 'over' ? 'overBudget' : 'underBudget')}
              />
            )}
            <span dir="ltr">{meal.dish ? kcal : '—'}</span>
          </span>

          {meal.dish && meal.dish.servings !== 1 && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 text-caption font-semibold text-primary" dir="ltr">
              ×{meal.dish.servings}
            </span>
          )}
        </span>

        {ghost && (
          <span
            className={cn(
              'mt-2 flex items-center gap-1 border-t border-dotted border-border pt-1.5 text-caption',
              ghost.isRepeat ? 'text-status-attention-fg' : 'text-muted-foreground',
            )}
          >
            {ghost.isRepeat ? (
              <>
                <Icon name="repeat" className="size-3.5" />
                {t('repeatedFromLastWeek', { date: compareDate ?? '' })}
              </>
            ) : (
              ghost.nameAr
            )}
          </span>
        )}
      </button>

      {editable && meal.dish && (
        <span
          ref={setDragRef}
          {...listeners}
          {...attributes}
          aria-label={meal.dish.nameAr}
          className="absolute end-1 top-1 cursor-grab rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Icon name="dragHandle" className="size-3.5" />
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Expect the board to break**

Run: `bun run typecheck`
Expected: **FAIL** — `day-column.tsx` and `plan-board.tsx` still reference the removed `Step` helper's siblings, and `meal-card.tsx` no longer imports `setServings`, `clear`, `remove`, `SERVING_STEP` or `snapServings`. That is the point: Task 9 gives those actions their new home. Do not patch around it here.

Confirm the failure is confined to the two callers above and to the now-unused imports. If anything in `editor-mutations.ts` or `queries.ts` is implicated, stop — the change has exceeded the design.

- [ ] **Step 4: Commit the card alone**

The tree does not typecheck between here and Task 9. Commit anyway so the card is reviewable on its own, and say so:

```bash
git add src/features/weekly-plans/components/meal-card.tsx src/i18n/messages/ar.json src/i18n/messages/en.json
git commit -m "Strip the meal card to what it shows

The card carried five controls at roughly 16px each, on every one of
thirty-five slots, and printed each meal's share beside its calories.
It now shows one figure, with an arrow and the attention colour when the
meal misses that share by more than the substitution tolerance.

Does not typecheck alone: the portion, clear and remove actions land on
the detail panel in the commit after next."
```

---

## Task 8: The day column and the board grid

Spec §2 "The board grid", §6. Cards are sized by their own content, so nothing lines up across the week.

**Files:**
- Modify: `src/features/weekly-plans/components/day-column.tsx`
- Modify: `src/features/weekly-plans/components/plan-board.tsx:236-257`

- [ ] **Step 1: Make the week one grid**

In `plan-board.tsx`, replace the grid wrapper around the `board.days.map(...)`:

```tsx
        {/* One grid for the week, and each day a subgrid of it, so every card
            in a row is the same height and the rows run straight across.
            `minmax(0,1fr)` on the columns rather than `1fr`, or a long dish
            name widens its column past the others. */}
        <div
          className="grid min-w-0 flex-1 grid-cols-7 gap-x-2.5 gap-y-1.5 overflow-y-auto"
          style={{ gridTemplateRows: 'auto repeat(5, minmax(6rem, 1fr)) auto' }}
        >
```

The row template is an inline style because it depends on the plan's slot count, which is data. Derive it rather than hardcoding five:

```tsx
  // Every day carries the same slots, so one day's count sizes the whole grid.
  const slotRows = Math.max(...board.days.map((day) => day.meals.length), 1);
```

and use `` `auto repeat(${slotRows}, minmax(6rem, 1fr)) auto` ``.

- [ ] **Step 2: Make each column a subgrid**

In `day-column.tsx`, replace the outer wrapper:

```tsx
    <div className="grid min-w-0 grid-rows-subgrid gap-1.5" style={{ gridRow: '1 / -1' }}>
```

Subgrid rather than flattening the days into direct grid children, because the per-day grouping carries the drop target, the regenerate control and the reading order a screen reader needs.

- [ ] **Step 3: Rebuild the column header with the band**

Replace the header block in `day-column.tsx`:

```tsx
import { ComfortBand } from '@/components/ui/comfort-band';
import { Icon } from '@/components/ui/icon';
import { bandGeometry } from '../band';
```

```tsx
  const kcal = roundForDisplay('kcal', day.totals.kcal.value);
  const band = day.meals.length > 0 ? bandGeometry(kcal, dailyTarget) : null;

  return (
    <div className="grid min-w-0 grid-rows-subgrid gap-1.5" style={{ gridRow: '1 / -1' }}>
      <div className="rounded-lg bg-muted/60 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-1.5">
          <span className="truncate text-body-sm font-semibold">{tDays(dayKey(day.dayOfWeek))}</span>

          {editable && (
            <RegenerateDayButton planId={planId} dayOfWeek={day.dayOfWeek} locale={locale} />
          )}
        </div>

        {/* The total alone. The target is what the band is drawn against, so
            printing it seven more times says the same thing twice. */}
        <span
          className={cn(
            'mt-0.5 flex items-baseline gap-1 text-label',
            band?.state ? 'font-semibold text-status-attention-fg' : 'text-muted-foreground',
          )}
        >
          {band?.state && (
            <Icon
              name={band.state === 'over' ? 'driftUp' : 'driftDown'}
              className="size-3.5 self-center"
              aria-hidden
            />
          )}
          {t('kcalValue', { value: kcal })}
        </span>

        {band && (
          <ComfortBand
            band={band}
            label={t('dayTotalAgainstTarget', { value: kcal, target: dailyTarget })}
            className="mt-2"
          />
        )}
      </div>
```

- [ ] **Step 4: Add the band's label key**

`ar.json`: `"dayTotalAgainstTarget": "{value} من أصل {target} سعرة"`
`en.json`: `"dayTotalAgainstTarget": "{value} of {target} kcal"`

- [ ] **Step 5: Bring `AddMeal` up to the control spec**

Still in `day-column.tsx`, in the `AddMeal` component: change `className="h-7 text-[11px]"` on both `Input`s to `className="h-10"`, the save `Button` to `size="sm"` with `className="flex-1"`, and the cancel `Button` to `size="sm"`. Delete every `text-[10px]` and `text-[11px]`. The closed-state trigger becomes:

```tsx
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 rounded-lg border border-dashed border-border text-label text-muted-foreground hover:bg-accent"
      >
        + {t('addMeal')}
      </button>
```

- [ ] **Step 6: Verify**

Run: `bun run lint && bun run typecheck`
Expected: still failing on the detail panel's missing actions (Task 9). Every *other* error must be gone. Grep to confirm no arbitrary sizes remain in this file:

Run: `grep -n "text-\[" src/features/weekly-plans/components/day-column.tsx`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/features/weekly-plans/components/day-column.tsx src/features/weekly-plans/components/plan-board.tsx src/i18n/messages/ar.json src/i18n/messages/en.json
git commit -m "Lay the week on one grid and give each day a comfort band

Cards were sized by their own content, so no row lined up across the
week. The week is now one grid and each day a subgrid of it. The day
header shows its total against a band rather than against a second
number the reader has to subtract."
```

---

## Task 9: The meal detail panel takes the controls

Spec §2. This is where the card's stepper, clear and remove land, at a size the button spec allows.

**Files:**
- Modify: `src/features/weekly-plans/components/meal-detail-panel.tsx`

- [ ] **Step 1: Replace the read-only `Portion` section with a stepper**

Swap the `Portion` function for:

```tsx
function Portion({ meal, editable }: { meal: BoardMeal; editable: boolean }) {
  const t = useTranslations('weeklyPlans');
  const { setServings } = useEditorActions();
  const dish = meal.dish!;

  const kcal = roundForDisplay('kcal', meal.totals.kcal.value);
  const drift = driftState(kcal, meal.budgetKcal, MEAL_TOLERANCE);

  return (
    <section className="rounded-lg bg-muted/50 p-3">
      <h4 className="pb-2 text-label font-semibold text-muted-foreground">{t('portionLabel')}</h4>

      {editable ? (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t('lessPortion')}
            disabled={dish.servings <= 0.25}
            onClick={() => setServings(meal.id, snapServings(dish.servings - SERVING_STEP))}
          >
            <Icon name="minus" />
          </Button>

          <span className="min-w-14 text-center text-heading-sm font-semibold tabular-nums" dir="ltr">
            ×{dish.servings}
          </span>

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t('morePortion')}
            disabled={dish.servings >= 3}
            onClick={() => setServings(meal.id, snapServings(dish.servings + SERVING_STEP))}
          >
            <Icon name="add" />
          </Button>

          <span className="ms-auto text-body-sm text-muted-foreground">
            {t('portion', { servings: dish.servings, label: dish.baseServingLabel })}
          </span>
        </div>
      ) : (
        <p className="text-body-sm">
          {t('portion', { servings: dish.servings, label: dish.baseServingLabel })}
        </p>
      )}

      <p className={cn('mt-2 text-body-sm', drift ? 'text-status-attention-fg' : 'text-muted-foreground')}>
        {t('kcalValue', { value: kcal })}
        {meal.budgetKcal > 0 && <> · {t('budget', { value: meal.budgetKcal })}</>}
      </p>
    </section>
  );
}
```

Add the imports it needs at the top of the file:

```tsx
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { MEAL_TOLERANCE, driftState } from '@/features/weekly-plans/drift';
import { SERVING_STEP, snapServings } from '../similar';
import { useEditorActions } from './board-dnd';
```

Update its call site to `<Portion meal={meal} editable={editable} />`.

- [ ] **Step 2: Add the destructive pair at the block-end**

Just before the closing `</div>` of the panel, inside the `editable` branch:

```tsx
          {/* Last, and separated: these are the two actions in the panel that
              throw work away. Clearing keeps the slot and its budget; removing
              takes the slot off the day entirely. */}
          <section className="mt-auto flex gap-3 border-t border-border pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={() => clear(meal.id)}
            >
              <Icon name="clearSlot" />
              {t('clearMeal')}
            </Button>

            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="flex-1"
              onClick={() => remove(meal.id)}
            >
              <Icon name="trash" />
              {t('removeMeal')}
            </Button>
          </section>
```

Pull `clear` and `remove` from `useEditorActions()` at the top of `MealDetailPanel`.

- [ ] **Step 3: Take the model id off the header**

Spec §7 moves `board.model` here. Add a `model` prop to `MealDetailPanel` and render it under the rationale:

```tsx
      {model && (
        <p className="text-caption text-muted-foreground">{t('generatedBy')} · {model}</p>
      )}
```

Pass it from `plan-board.tsx`: `model={board.model}`.

- [ ] **Step 4: Add the one new key**

`ar.json`: `"portionLabel": "الحصة"` — `en.json`: `"portionLabel": "Portion"`. `lessPortion`, `morePortion`, `clearMeal`, `removeMeal`, `portion`, `budget` and `generatedBy` all already exist; they are being reused, not replaced.

- [ ] **Step 5: The tree typechecks again**

Run: `bun run lint && bun run typecheck`
Expected: **PASS**. This is the first green typecheck since Task 7. If anything still fails, it is a real error, not the expected interim state.

Run: `bun test`
Expected: PASS, all existing tests plus the 11 from Tasks 2 and 3.

- [ ] **Step 6: Look at it**

Start the app, open a draft plan, click a meal. Check: the stepper buttons are 40px and reachable by keyboard; `×1.25` reads left-to-right inside the Arabic panel; the destructive pair sits at the bottom; the panel scrolls without the tabs above it scrolling away.

- [ ] **Step 7: Commit**

```bash
git add src/features/weekly-plans/components/meal-detail-panel.tsx src/features/weekly-plans/components/plan-board.tsx src/i18n/messages/ar.json src/i18n/messages/en.json
git commit -m "Move the meal's controls into the detail panel

The stepper, clear and remove were 16px targets on the board. They are
now full-size controls in the panel the card already opened, which also
shows the portion, the ingredients and the alternatives they act on.
The model id moves here too — it is a fair question about a meal and
furniture on a toolbar."
```

---

## Task 10: The board header

Spec §7. One wrapping row of nine things becomes two groups either side of a single `ms-auto`.

**Files:**
- Modify: `src/features/weekly-plans/components/plan-board.tsx:138-234`

- [ ] **Step 1: Rebuild the header**

Replace the `<header>` element's contents. The picker arrives in Task 11 — leave `board.clientName` in place for now and swap it there.

```tsx
      <header className="flex items-center gap-3">
        <h2 className="truncate text-heading-sm font-semibold">{board.clientName}</h2>

        {isMember(PLAN_STATUSES, board.status) && (
          <Badge variant={board.status === 'published' ? 'default' : 'muted'}>
            {t(`status.${board.status}`)}
          </Badge>
        )}

        <span className="whitespace-nowrap text-label text-muted-foreground">
          {t('weekOf', { date: board.weekStartDate })}
        </span>

        <span className="whitespace-nowrap text-label text-muted-foreground">
          {t('dailyTargetShort', { value: dailyTarget })}
        </span>

        {/* Reserved width, so a save does not reflow the row it sits in.
            Quiet on success, explicit on failure, announced either way. */}
        <span
          role="status"
          aria-live="polite"
          className="min-w-24 shrink-0 text-label text-muted-foreground"
        >
          {error ? <span className="text-destructive">{t(error)}</span> : pending ? t('savingIndicator') : null}
        </span>

        <div className="ms-auto flex shrink-0 items-center gap-3">
          <PublishButton planId={board.id} status={board.status} unfilled={board.unfilled} locale={locale} />

          <NewWeekDialog … />

          {board.status === 'published' && (
            <Button
              type="button"
              size="sm"
              variant={allowPublished ? 'default' : 'outline'}
              aria-pressed={allowPublished}
              onClick={() => {
                if (allowPublished) {
                  onAllowPublished(false);
                  return;
                }
                if (window.confirm(t('editPublishedConfirm'))) onAllowPublished(true);
              }}
            >
              {t('editPublished')}
            </Button>
          )}

          {previous && (
            <Button
              type="button"
              size="sm"
              variant={comparing ? 'default' : 'outline'}
              aria-pressed={comparing}
              onClick={() => setComparing((value) => !value)}
            >
              {t('compareWith', { date: previous.weekStartDate })}
            </Button>
          )}
        </div>
      </header>
```

`NewWeekDialog` does not exist until Task 13 — keep the existing `<NewWeekMenu …/>` in that slot for now and swap it there.

The primary sits at the **inline-start of its group**, per the design system's button spacing rule. In RTL source order that means `PublishButton` first. Do not reorder with `flex-row-reverse`.

- [ ] **Step 2: Drop `weekKcal`**

`weekTotal` is no longer rendered — the daily target replaces it, since a week total of 14,171 is a figure nobody acts on. Delete the `weekKcal` const and the `weekTotal` message key from both files.

- [ ] **Step 3: Add the key**

`ar.json`: `"dailyTargetShort": "الهدف اليومي {value} سعرة"` — `en.json`: `"dailyTargetShort": "Daily target {value} kcal"`

- [ ] **Step 4: Verify**

Run: `bun run lint && bun run typecheck && bun test`
Expected: PASS.

Look at it at 1280px and at 1440px: the row must not wrap at either. Shrink to 1100px and confirm it still does not wrap (it will scroll — the responsive work is Task 17).

- [ ] **Step 5: Commit**

```bash
git add src/features/weekly-plans/components/plan-board.tsx src/i18n/messages/ar.json src/i18n/messages/en.json
git commit -m "Split the board header into two groups

Nine items in one wrapping row rearranged themselves at every width. The
plan's identity sits at the inline start, the actions at the inline end,
and the save status has a reserved width so a save stops reflowing the
row. The week total is dropped: 14,171 is not a number anyone acts on."
```

---

## Task 11: The client picker

Spec §3. `ClientRail` is deleted and both routes change.

**Files:**
- Create: `src/features/weekly-plans/components/client-picker.tsx`
- Delete: `src/features/weekly-plans/components/client-rail.tsx`
- Modify: both `src/app/[locale]/app/weekly-plans/**/page.tsx`, `plan-board.tsx`

- [ ] **Step 1: Write the picker**

```tsx
'use client';

import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { useRouter } from '@/i18n/navigation';

import type { PlannableClient } from '../queries';

/**
 * Choosing whose week is on screen.
 *
 * A navigation rather than local state: a dietitian works through several
 * clients in a sitting, and each one being its own URL means the back button, a
 * bookmark and a shared link all do the obvious thing — which is what the rail
 * this replaces was for.
 *
 * Each row carries the state of that client's newest plan, because "who still
 * needs a plan" is the question this page is opened to answer on a Sunday.
 */
export function ClientPicker({
  clients,
  selectedClientId,
}: {
  clients: readonly PlannableClient[];
  selectedClientId?: string;
}) {
  const t = useTranslations('weeklyPlans');
  const router = useRouter();

  const options: ComboboxOption<string>[] = clients.map((client) => ({
    value: client.id,
    label: client.fullName,
    swatch: client.color,
    meta: <ClientStatus client={client} />,
  }));

  return (
    <Combobox
      options={options}
      value={selectedClientId ?? null}
      onValueChange={(clientId) => {
        if (clientId) router.push(`/app/weekly-plans/${clientId}`);
      }}
      label={t('clients')}
      placeholder={t('searchClients')}
      emptyMessage={t('noClients')}
      className="w-64 shrink-0"
    />
  );
}

/**
 * The one-word state of this client's newest plan.
 *
 * "No profile" outranks the plan status: without a weight and a target nothing
 * can be generated, so that is the fact worth surfacing first.
 */
function ClientStatus({ client }: { client: PlannableClient }) {
  const t = useTranslations('weeklyPlans');

  if (!client.hasProfile) return <Badge variant="outline">{t('status.noProfile')}</Badge>;
  if (client.latestPlanStatus === 'published') return <Badge>{t('status.published')}</Badge>;
  if (client.latestPlanStatus === 'draft') return <Badge variant="muted">{t('status.draft')}</Badge>;

  return null;
}
```

- [ ] **Step 2: Add the search placeholder key**

`ar.json`: `"searchClients": "ابحث عن عميل"` — `en.json`: `"searchClients": "Search clients"`

- [ ] **Step 3: Put it in the header**

In `plan-board.tsx`, take a `clients` prop and replace the `<h2>{board.clientName}</h2>` with `<ClientPicker clients={clients} selectedClientId={board.clientId} />`. Pass `clients` from the route.

- [ ] **Step 4: Rewrite the index route**

`src/app/[locale]/app/weekly-plans/page.tsx` currently *is* the rail. Replace its body with the picker and a message — spec §3 declined an overview list here:

```tsx
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
        <ClientPicker clients={clients} />
        <p className="text-body-sm text-muted-foreground">{t('selectClient')}</p>
      </div>
```

- [ ] **Step 5: Remove the rail from the client route**

In `[clientId]/page.tsx`, delete the `<ClientRail …/>` from both the board branch and the no-plan branch, and delete the import. Pass `clients` to `PlanBoard`.

- [ ] **Step 6: Delete the rail**

```bash
git rm src/features/weekly-plans/components/client-rail.tsx
```

Run: `grep -rn "ClientRail\|client-rail" src/`
Expected: no output.

- [ ] **Step 7: Verify**

Run: `bun run lint && bun run typecheck && bun test`
Expected: PASS.

In the browser: type part of a client's name and confirm the list filters; press `↓` then `Enter` and confirm it navigates; press Escape and confirm the popup closes without navigating. Check the popup opens on the correct side in Arabic.

- [ ] **Step 8: Commit**

```bash
git add -A src/features/weekly-plans src/app/[locale]/app/weekly-plans src/i18n/messages
git commit -m "Replace the client rail with a searchable picker

The rail held 224px permanently to show a list that is usually short and
rarely changes, squeezing the seven day columns beside it. The same three
facts per client — colour, name, plan status — move into a combobox in
the header, and the board gets the width back."
```

---

## Task 12: The new-week mode rule

Spec §4. Which of two things the dialog's first door does, given what is on screen.

**Files:**
- Create: `src/features/weekly-plans/new-week.ts`
- Test: `src/features/weekly-plans/new-week.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';

import { newWeekMode } from './new-week';

describe('newWeekMode', () => {
  test('regenerates over a draft rather than leaving it behind', () => {
    expect(newWeekMode({ status: 'draft' })).toBe('regenerate');
  });

  test('creates a new week when the plan on screen is published', () => {
    expect(newWeekMode({ status: 'published' })).toBe('create');
  });

  test('creates a new week when there is no plan at all', () => {
    expect(newWeekMode(null)).toBe('create');
  });

  // Statuses are a text column; a value the enum does not know is not proof
  // that overwriting is safe.
  test('creates rather than overwrites on an unrecognised status', () => {
    expect(newWeekMode({ status: 'archived' })).toBe('create');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/features/weekly-plans/new-week.test.ts`
Expected: FAIL — `Cannot find module './new-week'`.

- [ ] **Step 3: Implement**

```ts
/** What the dialog's generate door does with the plan already on screen. */
export type NewWeekMode = 'regenerate' | 'create';

/**
 * A draft is work in progress and nobody has seen it, so generating again
 * replaces it. Anything else — a published plan, no plan, a status this build
 * does not recognise — gets a new week, because overwriting something a client
 * may already be following is not a default.
 */
export function newWeekMode(board: { status: string } | null): NewWeekMode {
  return board?.status === 'draft' ? 'regenerate' : 'create';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/features/weekly-plans/new-week.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/weekly-plans/new-week.ts src/features/weekly-plans/new-week.test.ts
git commit -m "Decide the new-week dialog's mode in one tested place

Generating while a draft is open should replace it rather than leave an
abandoned week in the history. Anything unrecognised creates instead of
overwriting."
```

---

## Task 13: The new-week dialog

Spec §4. Three doors in a dialog, absorbing `GenerateForm`.

**Files:**
- Create: `src/features/weekly-plans/components/new-week-dialog.tsx`
- Delete: `src/features/weekly-plans/components/new-week-menu.tsx`
- Modify: `generate-form.tsx`, `plan-board.tsx`, both message files

- [ ] **Step 1: Reshape `GenerateForm` into a door**

Keep the component and its server action wiring exactly as they are. Three changes: bring the fields to spec size (`Input` loses `className="h-8 text-xs"` entirely, the raw `<select>` becomes the shared `Select`, the `Textarea` loses `className="text-xs"`), replace `text-[11px]` on the hint with `text-caption`, and take a `mode: NewWeekMode` prop so the submit button reads `t('regenerateWeek')` when it is `'regenerate'` and `t('generate')` otherwise.

- [ ] **Step 2: Write the dialog**

The three doors are `GenerateForm`, a radio list over `plans`, and the empty-week form. The copy door lists **every** past plan except the one open — `listPlans` already returns them all, and today's menu offers only the newest.

```tsx
'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogHeader } from '@/components/ui/dialog';
import { newWeekMode } from '../new-week';
import { startEmptyWeekAction, startWeekFromPlanAction } from '../editor-actions';
import { initialNewWeekState } from '../form-state';
import type { PlanSummary } from './plan-history';

export function NewWeekDialog({
  clientId,
  weekStartDate,
  plans,
  currentPlanId,
  currentStatus,
  locale,
  blocked,
  context,
  defaultInstruction,
}: { /* … see step 3 for the full prop list … */ }) {
  const t = useTranslations('weeklyPlans');
  const [open, setOpen] = useState(false);
  const mode = newWeekMode(currentStatus ? { status: currentStatus } : null);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        {t('newWeek')}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="wide"
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
        label={t('newWeekTitle')}
      >
        <DialogHeader
          title={t('newWeekTitle')}
          description={t('newWeekSubtitle')}
          onClose={() => setOpen(false)}
          closeLabel={t('close')}
        />

        <DialogBody className="grid gap-4 md:grid-cols-3">
          {/* Featured: the brand edge, not a different fill — the design
              system's "the edge, never a lift" language. */}
          <section className="flex flex-col gap-3 rounded-lg border-2 border-primary p-4">
            <h3 className="text-label font-semibold">{t(`newWeekGenerate.${mode}`)}</h3>
            <p className="text-caption text-muted-foreground">{t(`newWeekGenerateHint.${mode}`)}</p>
            <GenerateForm … mode={mode} />
          </section>

          <CopyDoor plans={plans.filter((plan) => plan.id !== currentPlanId)} … />
          <EmptyDoor clientId={clientId} weekStartDate={weekStartDate} locale={locale} />
        </DialogBody>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 3: Fill in `CopyDoor` and `EmptyDoor`**

`CopyDoor` holds `useState` for the chosen plan id, renders one `<label>` per plan with a real `<input type="radio" name="sourcePlanId">` inside a `<form action={startWeekFromPlanAction}>`, and a submit `Button variant="outline"` reading `t('copyIntoWeek', { date: weekStartDate })`. Each row shows the week's date and `t('kcalValue', { value: plan.kcalTargetSnapshot })` and `t('planMeals', { count: plan.mealCount })` — the three facts the database actually holds. No plan names and no usage counts; neither exists.

`EmptyDoor` is the `EmptyEntry` form lifted from `new-week-menu.tsx` unchanged, with its `Entry` button swapped for a `Button variant="outline"`.

Both doors render `blocked` state as the design says — stated, not hidden — using the existing `errors.profileIncomplete` and `errors.notConfigured` keys.

- [ ] **Step 4: Swap it into the header and delete the menu**

Replace `<NewWeekMenu …/>` in `plan-board.tsx`, then:

```bash
git rm src/features/weekly-plans/components/new-week-menu.tsx
```

Run: `grep -rn "NewWeekMenu\|new-week-menu" src/`
Expected: no output.

The route's `newWeek` prop shape changes — it now needs `plans` rather than a single `previousPlan`. Update `[clientId]/page.tsx` accordingly and delete the `previousPlan` derivation, which existed only to pick the one plan the menu could show.

- [ ] **Step 5: Add the keys**

```json
"newWeekTitle": "إعداد أسبوع جديد",
"newWeekSubtitle": "اختر طريقة البدء لتخطيط الوجبات لهذا الأسبوع.",
"newWeekGenerate": { "create": "توليد بالذكاء الاصطناعي", "regenerate": "إعادة توليد هذا الأسبوع" },
"newWeekGenerateHint": {
  "create": "خطة كاملة مبنية على هدف العميل وتفضيلاته.",
  "regenerate": "خطة كاملة جديدة. المسودة الحالية سيتم استبدالها."
},
"regenerateWeek": "إعادة توليد هذا الأسبوع"
```

English equivalents in `en.json`. `newWeekGenerate` and `newWeekGenerateHint` change from strings to objects — grep for their old call sites and update them.

- [ ] **Step 6: Verify**

Run: `bun run lint && bun run typecheck && bun test`
Expected: PASS.

In the browser, with a **draft** open: the first door must read "إعادة توليد هذا الأسبوع". Publish the plan (or open a published one): it must read "توليد بالذكاء الاصطناعي". Confirm the copy list excludes the open plan. Confirm Escape closes the dialog and focus returns to the trigger. Confirm it is a bottom sheet on a phone.

- [ ] **Step 7: Commit**

```bash
git add -A src/features/weekly-plans src/app/[locale]/app/weekly-plans src/i18n/messages
git commit -m "Promote the three doors into a dialog

Starting a week is the page's most consequential choice and it lived in
a 288px dropdown, with the generate path handing off to a form in a
different panel. All three doors are now one dialog, the generate form
is inside it, and the copy door offers every past week rather than only
the most recent."
```

---

## Task 14: History becomes a viewer

Spec §5. Its copy button is redundant now the dialog exists, and it duplicates the page's week-date nav.

**Files:**
- Modify: `plan-history.tsx`, `[clientId]/page.tsx:121-138`

- [ ] **Step 1: Strip the copy form**

Delete `CopyForm` and `CopySubmit` from `plan-history.tsx`, along with the `startWeekFromPlanAction`, `initialNewWeekState`, `useActionState` and `useFormStatus` imports and the `nextWeekStartDate` / `currentPlanId` props that only fed them. The file becomes a server component — delete `'use client'`.

Each row becomes a `Card variant="listRow"` whose whole surface links, per the design system's `linked` row pattern.

- [ ] **Step 2: Delete the duplicate nav**

In `[clientId]/page.tsx`, delete the entire `{plans.length > 1 && (<nav …>…</nav>)}` block and the now-unused `Link` import.

- [ ] **Step 3: Verify**

Run: `bun run lint && bun run typecheck && bun test`
Expected: PASS.

In the browser: the page header shows no row of week dates; the "السابق" tab lists every week; clicking one loads it.

- [ ] **Step 4: Commit**

```bash
git add -A src/features/weekly-plans src/app/[locale]/app/weekly-plans
git commit -m "Make the history tab a viewer

Copying a week is the dialog's job now. The tab stops being a launcher,
which also removes the reason for the second week-date navigation the
page rendered above the board."
```

---

## Task 15: The client context panel

Spec §5. Loses the generate form, gains a shape.

**Files:**
- Modify: `context-panel.tsx`, `[clientId]/page.tsx`

- [ ] **Step 1: Take the form out of the rail**

In `[clientId]/page.tsx`, both branches pass `<ContextPanel context={context} />` alone. Delete the `<GenerateForm …/>` wrapper and its `border-t` div from both; the form lives only in the dialog now.

- [ ] **Step 2: Restructure the panel**

Order becomes: the name and edit link; the `missing fields` warning (unchanged, still first among the content); **two stat tiles** for the daily target and BMI in a `grid-cols-2`; allergen badges as `Badge variant="medical"`; goal and measurements as plain sections; then a `<details>` holding preferences, dislikes, standing instructions and medical notes; then the schedule as a `Table` with `numeric` on the calorie column.

The tiles use `Card size="sm" variant="tinted"` — do not hand-roll a tinted box. Every `text-xs` in the file becomes `text-body-sm` or `text-label` per the scale; the `Section` helper's `text-label` heading is already correct.

- [ ] **Step 3: Verify**

Run: `bun run lint && bun run typecheck`
Expected: PASS.

Run: `grep -n "text-xs\|text-\[" src/features/weekly-plans/components/context-panel.tsx`
Expected: no output.

Check a client with no profile: the panel must still render, showing `unset` rather than blanks, and the disclosure must be absent rather than empty.

- [ ] **Step 4: Commit**

```bash
git add -A src/features/weekly-plans src/app/[locale]/app/weekly-plans
git commit -m "Give the client panel a shape

With the generate form gone it was ten stacked label/value rows with
nothing to anchor them. The two numbers that get read — daily target and
BMI — become tiles, the prose collapses behind a disclosure, and the
schedule becomes a table."
```

---

## Task 16: The dish catalog

Spec §5. Sizing, and making its best behaviour visible.

**Files:**
- Modify: `dish-catalog.tsx`, both message files

- [ ] **Step 1: Bring it to spec**

The search `Input` loses `className="h-8 text-xs"`. `FilterChip` goes from `text-[10px]` to `text-label` with `px-3 py-1`. `CatalogRow` becomes a `Card size="sm"`; its `text-[10px]` lines become `text-caption` and the `text-[9px]` badge becomes a plain `Badge`.

- [ ] **Step 2: Make the slot filter explicit**

The panel silently re-sorts by proximity to the open slot's budget and says so only in 10px helper text. Replace that with a stated header above the list when a slot is open:

```tsx
        {slot && slot.budgetKcal > 0 && (
          <p className="rounded-md bg-primary/5 px-3 py-2 text-caption text-muted-foreground">
            {t('sortedForSlot', { value: slot.budgetKcal })}
          </p>
        )}
```

`ar.json`: `"sortedForSlot": "مرتّبة حسب قربها من {value} سعرة"` — `en.json`: `"sortedForSlot": "Sorted by fit to {value} kcal"`. Delete the old `fitsSlot` key and its call site.

- [ ] **Step 3: Verify**

Run: `bun run lint && bun run typecheck`
Expected: PASS.

Run: `grep -n "text-\[" src/features/weekly-plans/components/dish-catalog.tsx`
Expected: no output.

Open a meal, switch to the dishes tab, and confirm the header appears and the top result is genuinely near that slot's budget. Confirm an allergen-blocked dish is still shown, disabled, and names the allergen.

- [ ] **Step 4: Commit**

```bash
git add -A src/features/weekly-plans src/i18n/messages
git commit -m "Bring the dish catalog to spec and state its filter

The panel's most useful behaviour — ranking by fit to the open slot —
was mentioned only in 10px helper text. It now says so above the list,
and the search, chips and rows are at the sizes the system allows."
```

---

## Task 17: The rail becomes a sheet below xl

Spec §8. Two of the three layouts.

**Files:**
- Create: `src/features/weekly-plans/components/board-sheet.tsx`
- Modify: `plan-board.tsx`

- [ ] **Step 1: Write the sheet**

`BoardSheet` wraps `Dialog` and takes the *whole* rail — all four tabs — not just the meal panel, so the rail's content lives in one place and one component decides how it is presented.

```tsx
'use client';

import { Dialog } from '@/components/ui/dialog';

/**
 * The rail, on a screen too narrow to spare 300px for it.
 *
 * Wraps `Dialog` rather than inventing a sheet: `<dialog>` gives focus
 * trapping, the inert background and Escape for free, and its mobile form is
 * already a bottom sheet.
 */
export function BoardSheet({ open, onClose, label, dir, children }: {
  open: boolean;
  onClose: () => void;
  label: string;
  dir: 'rtl' | 'ltr';
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onClose={onClose} label={label} dir={dir} className="sm:h-full sm:max-h-none">
      <div className="flex h-full min-h-0 flex-col p-4">{children}</div>
    </Dialog>
  );
}
```

- [ ] **Step 2: Render the rail twice, never both at once**

In `plan-board.tsx`, extract the rail's contents into a local `railContent` variable so the markup is not duplicated. Render:

```tsx
        <aside className="hidden w-[19rem] shrink-0 flex-col overflow-y-auto border-s border-border ps-4 xl:flex">
          {railContent}
        </aside>

        <BoardSheet open={sheetOpen} onClose={() => setSheetOpen(false)} label={t('title')} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          {railContent}
        </BoardSheet>
```

Selecting a meal opens the sheet below `xl`. Add a `useMediaQuery`-free approach: always call `setSheetOpen(true)` in `onSelectMeal`, and let the sheet be `xl:hidden` so it never appears on a wide screen. Set `className="xl:hidden"` on the `BoardSheet`'s dialog.

- [ ] **Step 3: Make the week scroll below xl**

On the week grid, add `max-xl:min-w-[64rem]` and put `overflow-x-auto` on its parent. Seven columns at a 150px floor need about 1100px; below that the board scrolls rather than crushing the columns.

- [ ] **Step 4: Pin the tabs**

`RailTabs` gets `shrink-0` and the panel below it `min-h-0 flex-1 overflow-y-auto`, so the tabs stay put while the panel scrolls.

- [ ] **Step 5: Verify**

Run: `bun run lint && bun run typecheck && bun test`
Expected: PASS.

Resize to 1440, 1100 and 800px. At 1440 the rail is fixed and no sheet appears. At 1100 the rail is gone, clicking a meal opens the sheet, and the board scrolls sideways. Confirm Escape closes the sheet and returns focus to the card.

- [ ] **Step 6: Commit**

```bash
git add -A src/features/weekly-plans
git commit -m "Move the rail into a sheet below xl

The board had two breakpoint classes in the whole feature and became
unusable under about 1100px. The rail now becomes a sheet and the week
scrolls rather than crushing seven columns into a phone."
```

---

## Task 18: One day at a time below md

Spec §8. The third layout.

**Files:**
- Modify: `plan-board.tsx`, `day-column.tsx`

- [ ] **Step 1: Add day selection**

In `BoardBody`, add `const [day, setDay] = useState(todayOfWeek())` — or `0` if that helper does not exist; do not add one to `week.ts`, which is out of scope. Render a day strip above the grid, `md:hidden`, following the 4-then-3 layout in `plan-day-strip.tsx`. Read that file's comments first: it already worked out why seven Arabic weekday names do not fit across a phone and why `Intl`'s narrow forms are not an answer.

The staff strip selects in local state, not the URL, because the staff board already holds the whole week in memory and does not need the round trip the portal's version pays.

- [ ] **Step 2: Show one column below md**

On the week grid, `max-md:grid-cols-1`, and on each `DayColumn` pass `hidden={day.dayOfWeek !== selectedDay}` which applies `max-md:hidden`. The subgrid rows still apply from `md` up.

- [ ] **Step 3: Verify**

Run: `bun run lint && bun run typecheck && bun test`
Expected: PASS.

At 375px: the strip shows 4 days then 3, tapping a day switches the board, cards are full width, and the header's buttons stack rather than overflow. Confirm in Arabic — this is the layout where RTL and long weekday names bite.

- [ ] **Step 4: Commit**

```bash
git add -A src/features/weekly-plans
git commit -m "Show one day at a time on a phone

Seven columns do not fit a phone. This reuses the 4-then-3 day strip the
client portal already proved, selecting in local state rather than the
URL because the staff board already has the whole week loaded."
```

---

## Task 19: Sweep and verify

- [ ] **Step 1: Confirm the design-system violations are gone**

Run: `grep -rn "text-\[" src/features/weekly-plans/`
Expected: no output.

Run: `grep -rnE "h-6|h-7|h-8" src/features/weekly-plans/components/`
Expected: no output. Any hit is a control below the 40px floor.

Run: `grep -rnE "⠿|🗑|⟲" src/features/weekly-plans/`
Expected: no output.

- [ ] **Step 2: Confirm the logic layer is untouched**

Run: `git diff --stat main -- src/features/weekly-plans/*.ts`
Expected: only `drift.ts`, `band.ts`, `new-week.ts` and their tests appear as additions. **If any of `queries.ts`, `nutrition.ts`, `targets.ts`, `similar.ts`, `editor-mutations.ts`, `editor-state.ts`, `generate.ts`, `prompt.ts`, `skeleton.ts`, `usage.ts`, `week.ts`, `schema.ts`, `llm.ts`, `actions.ts` or `editor-actions.ts` is listed, stop and report it** — the redesign was scoped as presentation-only and a change there means something was mis-scoped.

- [ ] **Step 3: Full suite**

```bash
bun run lint
bun run typecheck
bun run test
```

Expected: all PASS. Tests need the separate database from `.env.test.local` — see [`docs/development.md`](../../development.md).

- [ ] **Step 4: Both languages, three widths**

Walk `/ar/app/weekly-plans/<id>` and `/en/app/weekly-plans/<id>` at 1440px, 1000px and 375px. Check specifically: the picker's popup opens on the correct side in both; numbers, times and `×1.25` keep LTR order inside Arabic; the day band fills from the inline-start edge in both; nothing scrolls the page body sideways.

- [ ] **Step 5: Keyboard**

Tab through the board with no mouse. Every meal must be reachable and openable; the drag handle is the one thing that may be pointer-only. From an open detail panel, the stepper, clear and remove must all be reachable. Confirm `prefers-reduced-motion` kills the sheet and dialog animations.

- [ ] **Step 6: Commit anything the sweep turned up**

```bash
git add -A
git commit -m "Fix what the redesign sweep turned up"
```

---

## Self-review notes

Checked against the spec, section by section:

- **§1** — Tasks 1, 7, 8, 15, 16, and the greps in 19.
- **§2 card** — Task 7. **§2 grid** — Task 8. **§2 controls moving** — Task 9.
- **§3** — Task 11 (picker, both routes, rail deleted).
- **§4** — Tasks 6, 12, 13.
- **§5** — Tasks 14 (history), 15 (context), 16 (catalog).
- **§6** — Tasks 2, 3, 4, 8.
- **§7** — Task 10, plus the model id moving in Task 9.
- **§8** — Tasks 17, 18.
- **New shared components** — `ComfortBand` (4), `Combobox` (5). `Dialog`'s wide size (6) was not in the spec's component list; it is a variant on an existing component, which the design system prefers over a className, so it stays.

**Known soft spots in this plan, flagged rather than hidden:**

- **Tasks 7–9 are one atomic change split across three commits.** The tree does not typecheck at 7 or 8. That is called out in both, but if you are running tasks through separate agents, they must run in order and the reviewer must not treat the interim red as a failure.
- **Task 13 does not give complete code for `CopyDoor` and `EmptyDoor`.** Step 3 describes them precisely and `EmptyDoor` is a lift of existing code, but this is the one task where an implementer writes markup from a description rather than copying it. It is also the task most likely to need a second pass.
- **Task 5 may not compile first try.** The Base UI combobox API was read from its typings, not from a working call site — there is no existing combobox in this repo to copy. Step 3 exists for exactly that, and says to fix against the typings rather than cast past them.
