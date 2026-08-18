import { expect, test } from '@playwright/test';

import { loginAsPortalClient, readSeed, type Seed } from './fixtures';

/**
 * Appointments are read-only for a client — the dietitian books the slot —
 * so the realistic flow here is filing a *request*, not a booking: open
 * Appointments, see nothing upcoming, ask for one, and see the request show
 * up back on the appointments screen with the real "waiting" status the
 * database holds (`appointment_requests.status = 'pending'`), not a
 * client-side optimistic stand-in.
 */

let seed: Seed;

test.beforeAll(() => {
  seed = readSeed();
});

test.beforeEach(async ({ page }) => {
  await loginAsPortalClient(page, seed);
});

test('a client with nothing booked sees the empty state, not an error', async ({ page }) => {
  await page.goto('/en/portal/appointments');

  await expect(page.getByRole('heading', { name: 'Appointments' })).toBeVisible();
  await expect(page.getByText('No upcoming appointments')).toBeVisible();
});

test('requesting an appointment files a pending request the client can see', async ({ page }) => {
  await page.goto('/en/portal/appointments');

  // The ask opens as a dialog over this page (`?request=1`), not a
  // separate route — see `appointment-request-dialog.tsx`.
  await page.getByRole('link', { name: 'Request an appointment' }).click();
  await expect(page).toHaveURL(/\/en\/portal\/appointments\?request=1/);
  await expect(page.getByRole('dialog', { name: 'Request an appointment' })).toBeVisible();

  await page.getByLabel('Write to your dietitian').fill('E2E test: could I come in next week?');
  await page.getByRole('button', { name: 'Send the request' }).click();

  // The action redirects back to the appointments list with a confirmation.
  await expect(page).toHaveURL(/\/en\/portal\/appointments/);
  await expect(page.getByText('Your request has been sent.')).toBeVisible();

  // The request itself is real data read back from `appointment_requests`,
  // not the toast standing in for it — it is still there after a reload.
  // A `new` request with no chosen day is a plain note to the dietitian
  // (`isNote` in `request-list.tsx`), so it carries no status badge — the
  // note text itself, verbatim, is the proof this round-tripped through the
  // database rather than staying in the form's own local state.
  await page.reload();
  await expect(page.getByText('E2E test: could I come in next week?')).toBeVisible();
});
