# Dynamic calorie split: make the meal-split editor add up live

Date: 2026-08-15
Status: Approved, ready for planning
Branch: study/ai-weekly-planner

## The problem

The meal-schedule editor (`intake-form.tsx`, `MealScheduleField`) lets the
dietitian split the day's calories across meals as whole-number percentages, one
box per meal. Two things make it confusing:

1. **The running total does not update while typing.** The percent boxes are
   uncontrolled (`defaultValue`, `intake-form.tsx:1343`), so the total badge
   (`intake-form.tsx:1392`) only recomputes when a meal is added or removed. Typing
   25 into a box does not move the total.
2. **A wrong total is silently accepted.** On save the server normalises the shares
   (divides each by the total, `slotBudgets` in `targets.ts:216`), so a schedule of
   115% or 90% still produces a valid plan — but the dietitian sees numbers that do
   not add up and has no feedback.

The result: "I can add a meal and make the percentage 115, or remove and make it
90." The plan is mathematically fine, but the editor lies to the dietitian.

## The goal

Make the editor show a live, correct total so the dietitian always knows where they
are, and can reach 100% in one click.

## Design

1. **Live total.** Track each meal's percentage in React state instead of relying on
   `defaultValue`, so the total recomputes on every keystroke. This is the core fix.

2. **Clear total state.** The total badge is quiet when the total is 100%, and shows
   an attention/warning style when it is not — as it already intends to, but now
   driven by live values.

3. **"Balance to 100%" button.** One click scales the current percentages
   proportionally so they sum to 100, keeping each meal's relative share. Whole-number
   rounding drift is absorbed by the largest meal so the displayed total reads exactly
   100.

4. **Saving is allowed even when the total is not exactly 100%.** A red total is a
   warning, not a hard block. Reason: whole-number percentages cannot always sum to
   exactly 100 (three equal meals = 33 + 33 + 33 = 99). The server already normalises
   the shares, so any total produces a correct plan. The change makes the total
   *visible* and *fixable*, rather than changing what saving does.

## Scope

### In scope

- `src/features/clients/components/intake-form.tsx` — the `MealScheduleField`
  component: controlled percentage inputs, live total, the "balance to 100%" button.
- A small pure helper for the balance math (proportional scale to 100, whole-number,
  drift on the largest), placed where it can be unit-tested without React.

### Out of scope

- No change to how the server stores or normalises shares (`targets.ts` `slotBudgets`
  stays; it remains the safety net).
- No switch to editing calories directly instead of percentages (considered and not
  chosen — it needs the daily target to be set first).
- No database or schema change.

## The "balance to 100%" math

Given the current percentages `p[i]` summing to `T`:

- If `T` is 0 (all blank), distribute evenly: `round(100 / n)` each, drift on the
  largest index.
- Otherwise scale each: `round(p[i] * 100 / T)`, then adjust the largest entry by the
  rounding remainder so the visible total is exactly 100.

This mirrors what the server already does on save, made visible and one-click.

## Testing

- Unit-test the balance helper: proportional cases (e.g. 30/40/30 stays), scaling
  cases (e.g. 25/25/25/25/25 → 20 each), all-blank (even split), and rounding drift
  (e.g. three equal meals resolve to a visible 100 total).
- Confirm the live total updates on keystroke and the badge switches state at 100.
- Confirm Arabic (RTL) and English (LTR) rendering of the row and badge.

## Success criteria

- The total updates on every keystroke.
- The dietitian can reach exactly 100% with one button click.
- Saving still succeeds, with the shares normalised as before.
- `bun run lint`, `bun run typecheck`, and `bun run test` pass.
