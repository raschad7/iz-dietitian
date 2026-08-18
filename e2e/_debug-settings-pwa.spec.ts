import { expect, test } from '@playwright/test';

import { loginAsPortalClient, readSeed, type Seed } from './fixtures';

let seed: Seed;

test.beforeAll(() => {
  seed = readSeed();
});

test.beforeEach(async ({ page }) => {
  await loginAsPortalClient(page, seed);
});

test('install row shows the unavailable state when no native prompt has fired, and opens the help dialog on tap', async ({
  page,
}) => {
  await page.goto('/en/portal/settings');
  await page.waitForLoadState('networkidle');

  const row = page.getByRole('button', { name: /Install app/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Not available right now');

  await row.click();
  await expect(page.getByRole('dialog', { name: "Installation isn't available yet" })).toBeVisible();
});

test('install row disappears once the app is recorded as installed', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('iz.portal.pwa.install.v1', JSON.stringify({ dismissedAt: null, installed: true }));
  });

  await page.goto('/en/portal/settings');
  await page.waitForLoadState('networkidle');

  await expect(page.getByRole('button', { name: /Install app/ })).toHaveCount(0);
});
