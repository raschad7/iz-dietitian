import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, type Page } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type Seed = {
  clinicId: string;
  clientId: string;
  username: string;
  password: string;
  /** Clinic-local `YYYY-MM-DD`, the same date `global-setup.ts` planned meals for. */
  today: string;
};

/** The fixture data `global-setup.ts` wrote for this run. */
export function readSeed(): Seed {
  const raw = readFileSync(resolve(__dirname, '.seed.json'), 'utf-8');
  return JSON.parse(raw) as Seed;
}

/**
 * Logs the seeded client into the portal through the real sign-in form —
 * never by injecting a session — so every spec exercises the same
 * `requireClientSession` -> `requirePortalClient` path a real client goes
 * through.
 */
export async function loginAsPortalClient(page: Page, seed: Seed): Promise<void> {
  await page.goto('/en/client-login');

  await page.locator('input[name="username"]').fill(seed.username);
  await page.locator('input[name="password"]').fill(seed.password);
  await page.getByRole('button', { name: 'Sign in', exact: false }).click();

  await expect(page).toHaveURL(/\/en\/portal(\/)?$/);
}
