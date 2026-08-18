# Dynamic Calorie Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the meal-schedule editor show a live running total of the calorie shares and add a one-click "balance to 100%" button, so the dietitian is never confused by a total of 115% or 90%.

**Architecture:** A new pure helper (`balanceToHundred`) does the proportional-scale-to-100 math and is unit-tested in isolation. The `MealScheduleField` component in `intake-form.tsx` is changed so each share input is controlled (driving a live total) and a button calls the helper. Server-side normalisation in `targets.ts` is left as-is — it remains the safety net.

**Tech Stack:** TypeScript, React (Next.js), `bun:test`, next-intl for translations, Drizzle (no schema change here).

**Spec:** `docs/superpowers/specs/2026-08-15-dynamic-calorie-split-design.md`

---

## File Structure

- `src/features/clients/meal-split.ts` — **new.** Pure `balanceToHundred(percents)` helper. No React, no DB — unit-testable directly, same discipline as `targets.ts`.
- `src/features/clients/meal-split.test.ts` — **new.** Tests for the helper.
- `src/features/clients/components/intake-form.tsx` — **modify.** `MealScheduleField`: controlled share input for the live total, plus the "balance to 100%" button.
- `src/i18n/messages/en.json` and `src/i18n/messages/ar.json` — **modify.** One new key `clients.intake.balanceShares`.

---

## Task 1: The `balanceToHundred` pure helper

**Files:**
- Create: `src/features/clients/meal-split.ts`
- Test: `src/features/clients/meal-split.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/clients/meal-split.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { balanceToHundred } from './meal-split';

describe('balanceToHundred', () => {
  test('leaves a set that already sums to 100 unchanged', () => {
    expect(balanceToHundred([30, 40, 30])).toEqual([30, 40, 30]);
  });

  test('scales an over-100 set down proportionally', () => {
    // Five equal meals at 25 each sum to 125; scaled to 20 each.
    expect(balanceToHundred([25, 25, 25, 25, 25])).toEqual([20, 20, 20, 20, 20]);
  });

  test('scales an under-100 set up proportionally', () => {
    // 10/10/10 sums to 30; each becomes 33, drift of +1 lands on the first.
    expect(balanceToHundred([10, 10, 10])).toEqual([34, 33, 33]);
  });

  test('splits evenly when every share is zero', () => {
    // 100/3 = 33 each, drift of +1 on the first.
    expect(balanceToHundred([0, 0, 0])).toEqual([34, 33, 33]);
  });

  test('always sums to exactly 100', () => {
    for (const input of [[33, 33, 33], [1, 2, 3], [80, 80], [0, 0, 0, 0]]) {
      const sum = balanceToHundred(input).reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
    }
  });

  test('puts the rounding remainder on the largest entry', () => {
    // 20/30/49 sums to 99; the +1 drift goes to the 49, not the others.
    expect(balanceToHundred([20, 30, 49])).toEqual([20, 30, 50]);
  });

  test('treats negative shares as zero', () => {
    expect(balanceToHundred([-5, 50, 50])).toEqual([0, 50, 50]);
  });

  test('returns an empty array for empty input', () => {
    expect(balanceToHundred([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/features/clients/meal-split.test.ts`
Expected: FAIL — cannot find module `./meal-split` / `balanceToHundred` is not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/clients/meal-split.ts`:

```ts
/**
 * Scaling whole-number meal-calorie shares so they sum to exactly 100.
 *
 * Pure, no React and no database — the same discipline as `targets.ts`, so the
 * rounding rules are pinned down by a test rather than discovered in the UI.
 *
 * Mirrors what the server already does on save (`slotBudgets` normalises the
 * shares); this just makes that adjustment visible and one-click for the
 * dietitian, instead of a silent correction they never see.
 */
export function balanceToHundred(percents: readonly number[]): number[] {
  const n = percents.length;
  if (n === 0) return [];

  // Negative shares are meaningless here and would poison the proportional
  // scale, so they are floored to zero before anything else.
  const clamped = percents.map((p) => (p > 0 ? p : 0));
  const total = clamped.reduce((sum, p) => sum + p, 0);

  // Nothing to scale from: an all-zero (or all-negative) schedule splits the day
  // evenly rather than staying at zero, which is the sensible default a dietitian
  // pressing "balance" expects.
  const scaled =
    total <= 0
      ? Array.from({ length: n }, () => Math.floor(100 / n))
      : clamped.map((p) => Math.round((p / total) * 100));

  // Whole-number rounding rarely lands on exactly 100. The remainder is added to
  // the largest entry, where a point or two is least noticeable and cannot make a
  // small meal look wrong.
  const drift = 100 - scaled.reduce((sum, p) => sum + p, 0);
  if (drift !== 0) {
    let largest = 0;
    for (let i = 1; i < scaled.length; i += 1) {
      if (scaled[i]! > scaled[largest]!) largest = i;
    }
    scaled[largest]! += drift;
  }

  return scaled;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/features/clients/meal-split.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/features/clients/meal-split.ts src/features/clients/meal-split.test.ts
git commit -m "Add balanceToHundred helper for meal-share editing"
```

---

## Task 2: Live running total (controlled share input)

**Files:**
- Modify: `src/features/clients/components/intake-form.tsx` (the `slotShare` input inside `MealScheduleField`, around lines 1338–1345)

**Why:** Today the share `<Input>` is uncontrolled (`defaultValue`), so typing does not update the `slots` state — the total badge (`percent`, line 1294) only recomputes on add/remove. Making the input controlled off `slot.kcalShare` makes the total live, and also lets Task 3's button rewrite the visible numbers.

- [ ] **Step 1: Replace the uncontrolled share input with a controlled one**

Find this block (around `intake-form.tsx:1338`):

```tsx
          <Input
            name="slotShare"
            type="number"
            min={0}
            max={100}
            defaultValue={Math.round(slot.kcalShare * 100)}
            aria-label={t('fields.slotShare')}
          />
```

Replace it with:

```tsx
          <Input
            name="slotShare"
            type="number"
            min={0}
            max={100}
            value={Math.round(slot.kcalShare * 100)}
            onChange={(event) => {
              const percent = Number(event.target.value);
              onChange(
                slots.map((current, position) =>
                  position === index
                    ? { ...current, kcalShare: Number.isFinite(percent) ? percent / 100 : 0 }
                    : current,
                ),
              );
            }}
            aria-label={t('fields.slotShare')}
          />
```

Note: `slots`, `index`, and `onChange` are already in scope — `slots`/`onChange` are `MealScheduleField` props, `index` is the `.map()` index. The input still submits under `name="slotShare"`, so the server read path is unchanged.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS — no type errors.

- [ ] **Step 3: Verify the live total in the browser**

Start the app (via the preview/dev server) and open a client's intake dialog (client profile → nutrition intake). In the meal schedule:
- Type a new number into any share box.
- Expected: the "Shares total N%" badge updates on every keystroke, and turns from the attention style to the muted style exactly when the total reads 100.

- [ ] **Step 4: Commit**

```bash
git add src/features/clients/components/intake-form.tsx
git commit -m "Make meal-share total update live while typing"
```

---

## Task 3: The "balance to 100%" button

**Files:**
- Modify: `src/features/clients/components/intake-form.tsx` (import + footer row of `MealScheduleField`, around lines 1362–1395)
- Modify: `src/i18n/messages/en.json` (add `clients.intake.balanceShares`)
- Modify: `src/i18n/messages/ar.json` (add `clients.intake.balanceShares`)

- [ ] **Step 1: Add the English translation key**

In `src/i18n/messages/en.json`, in the `clients.intake` object (next to `"addSlot": "Add a meal"` around line 732), add:

```json
      "balanceShares": "Balance to 100%",
```

- [ ] **Step 2: Add the Arabic translation key**

In `src/i18n/messages/ar.json`, in the same `clients.intake` object (next to `"addSlot": "إضافة وجبة"` around line 732), add:

```json
      "balanceShares": "توزيع حتى 100٪",
```

- [ ] **Step 3: Import the helper**

At the top of `src/features/clients/components/intake-form.tsx`, with the other `@/features/clients` imports, add:

```tsx
import { balanceToHundred } from '@/features/clients/meal-split';
```

- [ ] **Step 4: Add the button to the footer row**

Find the footer row in `MealScheduleField` (around `intake-form.tsx:1362`), which contains the "Add a meal" button and the shares-total `Badge`. Add the balance button just before the `Badge`:

```tsx
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={percent === 100}
          onClick={() => {
            const balanced = balanceToHundred(slots.map((slot) => Math.round(slot.kcalShare * 100)));
            onChange(
              slots.map((slot, position) => ({ ...slot, kcalShare: balanced[position]! / 100 })),
            );
          }}
        >
          {t('intake.balanceShares')}
        </Button>
```

`percent` is already computed at the top of `MealScheduleField` (line 1294); the button disables itself when the total is already 100.

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Verify the button in the browser**

Open the same intake dialog. Set the shares to a total that is not 100 (e.g. 25/25/25/25/25 = 125%).
- Click "Balance to 100%".
- Expected: the share boxes rewrite to numbers that sum to exactly 100 (20/20/20/20/20), the badge reads "Shares total 100%" and turns muted, and the button becomes disabled.
- Check the same in Arabic (RTL): the dialog language toggle or an `/ar` route — the button label reads in Arabic and the row layout is mirrored correctly.

- [ ] **Step 7: Commit**

```bash
git add src/features/clients/components/intake-form.tsx src/i18n/messages/en.json src/i18n/messages/ar.json
git commit -m "Add balance-to-100% button to the meal schedule editor"
```

---

## Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full check set**

Run: `bun run lint`
Expected: PASS.

Run: `bun run typecheck`
Expected: PASS.

Run: `bun run test`
Expected: PASS, including the new `meal-split.test.ts`.

- [ ] **Step 2: Confirm the save path still works end to end**

In the browser, edit a client's meal schedule to a non-100 total, save, reopen the dialog.
- Expected: the schedule saves without error (the server normalises the shares as before), and generating a plan for that client still produces per-meal budgets that add up to the day's target.

---

## Self-Review notes

- **Spec coverage:** live total → Task 2; clear total state (badge) → already present, driven live by Task 2; "balance to 100%" button → Tasks 1 + 3; saving allowed when not exactly 100 → unchanged server path, confirmed in Task 4 Step 2; balance math tests → Task 1. All spec sections covered.
- **No schema change**, per spec.
- **Type consistency:** the helper is `balanceToHundred(percents: readonly number[]): number[]` in Task 1 and called with `number[]` in Task 3; `kcalShare` stays a 0–1 fraction throughout, converted to/from whole-number percent only at the input boundary.
