import { expect, test, type Locator, type Page } from '@playwright/test';

import { loginAsPortalClient, readSeed, type Seed } from './fixtures';

/**
 * The realistic flow the test plan asks for:
 *
 *   Login as a valid client -> open Portal -> open today's plan
 *   -> complete a meal -> open Progress -> the number on screen is the
 *   number the database actually holds.
 *
 * `global-setup.ts` seeded exactly two meals for today and nothing else, so
 * every fraction below is predictable: not a hardcoded UI value, but the
 * direct consequence of what this spec itself ticks. Nothing here mocks the
 * backend — this is the real `toggleMealCompletion` mutation, the real
 * `recomputeDayAdherence`, and the real `loadProgressPage` read, driven
 * through the browser exactly as a client would.
 *
 * The meal-count caption ("1 of 2 meals") only renders on the home screen's
 * ring — the progress tab's `TodayAdherenceCard` passes
 * `showMealsCaption={false}` and says the same fact as a sentence instead
 * (`level.partial`, `level.full`, …) — so each screen is asserted on the
 * text it actually shows rather than a text that happens to exist somewhere
 * in the app.
 */

let seed: Seed;

test.beforeAll(() => {
  seed = readSeed();
});

test.beforeEach(async ({ page }) => {
  await loginAsPortalClient(page, seed);
});

/**
 * Ticks (or unticks) a meal and waits for the write to actually land.
 *
 * `MealCheck` flips optimistically the instant it is clicked (see
 * `plan-day-completion.tsx`), so `aria-checked` turns true before the
 * server action that persists it has even been sent — navigating away right
 * after `.click()` can abort that request mid-flight. Waiting for the
 * network to go quiet gives the `toggleMealCompletionAction` round trip a
 * chance to finish before the next step reads the database it just wrote.
 */
async function toggleMeal(page: Page, checkbox: Locator, expectChecked: boolean): Promise<void> {
  await checkbox.click();
  await expect(checkbox).toHaveAttribute('aria-checked', String(expectChecked));
  await page.waitForLoadState('networkidle');
}

test.describe('meal completion -> progress', () => {
  test('progress starts empty before anything is ticked', async ({ page }) => {
    await page.goto('/en/portal/progress');

    await expect(page.getByRole('heading', { name: 'Your commitment today' })).toBeVisible();
    // Nothing ticked yet: the prompt copy shows, not a level or a percentage.
    await expect(page.getByText('Tick off today\'s meals in My Plan to see your commitment here.')).toBeVisible();
  });

  test('ticking one of two meals moves today\'s adherence to 50%, and unticking reverts it', async ({ page }) => {
    // Home page lists today's plan with the two seeded meals.
    await page.goto('/en/portal');

    const breakfastCheck = page.getByRole('checkbox', { name: 'Breakfast' });
    await expect(breakfastCheck).toBeVisible();
    await expect(breakfastCheck).toHaveAttribute('aria-checked', 'false');

    await toggleMeal(page, breakfastCheck, true);

    // The home screen's own ring shows the exact pair the tick just wrote.
    await expect(page.getByText(/^1 of 2 meals?$/)).toBeVisible();

    // The progress tab reads the same write back from the database — no
    // client-side cache carries the number across the navigation.
    await page.goto('/en/portal/progress');
    await expect(page.getByText('A good step toward your plan.')).toBeVisible();

    // Untick it and confirm both screens reflect the reversal — to an
    // explicit 0-of-2 "missed" day, not back to "nothing recorded". Unticking
    // deletes the completion row but `recomputeDayAdherence` still writes
    // `client_plan_adherence` with `completedMeals: 0`, because a day the
    // client answered and kept at zero is a different fact from a day nobody
    // asked about at all — see the column comment on that table.
    await page.goto('/en/portal');
    await toggleMeal(page, page.getByRole('checkbox', { name: 'Breakfast' }), false);

    await page.goto('/en/portal/progress');
    await expect(page.getByText('That\'s alright — tomorrow is a fresh start.')).toBeVisible();
  });

  test('ticking every meal for today reads full completion on the progress tab', async ({ page }) => {
    await page.goto('/en/portal');

    await toggleMeal(page, page.getByRole('checkbox', { name: 'Breakfast' }), true);
    await toggleMeal(page, page.getByRole('checkbox', { name: 'Lunch' }), true);

    await expect(page.getByText(/^2 of 2 meals?$/)).toBeVisible();

    await page.goto('/en/portal/progress');
    await expect(page.getByText('Wonderful commitment today!')).toBeVisible();

    // Leave both meals unticked for the next test, which reads the current,
    // real state rather than assuming a fresh seed — each spec still starts
    // from `beforeEach`'s login, but the database state a prior spec left
    // behind is exactly the point: this is one continuously running app, not
    // a reset-per-test mock.
    await page.goto('/en/portal');
    await toggleMeal(page, page.getByRole('checkbox', { name: 'Breakfast' }), false);
    await toggleMeal(page, page.getByRole('checkbox', { name: 'Lunch' }), false);
  });
});
