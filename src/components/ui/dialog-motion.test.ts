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

  test('uses semantic motion slots instead of the Add Client experiment selector', async () => {
    const [dialogSource, confirmSource, cssSource] = await Promise.all([
      Bun.file(`${import.meta.dir}/dialog.tsx`).text(),
      Bun.file(`${import.meta.dir}/confirm-dialog.tsx`).text(),
      Bun.file(`${import.meta.dir}/../../app/globals.css`).text(),
    ]);

    for (const slot of ['dialog-header', 'dialog-body', 'dialog-footer']) {
      expect(dialogSource).toContain(`data-slot="${slot}"`);
      expect(confirmSource).toContain(`data-slot="${slot}"`);
      expect(cssSource).toContain(`[data-slot='${slot}']`);
    }

    expect(cssSource).not.toContain('.client-form-dialog-seam');
    expect(cssSource).not.toContain('.app-navigation-drawer) [data-slot');
  });

  test('Add Client uses the shared presence lifecycle', async () => {
    const source = await Bun.file(
      `${import.meta.dir}/../../features/clients/components/client-form-trigger.tsx`,
    ).text();

    expect(source).toContain('useDialogPresence(open)');
    expect(source).not.toContain('client-form-dialog-seam');
    expect(source).not.toContain('client-form-motion');
  });

  test('conditional dialog owners retain their subtrees for exit motion', async () => {
    const paths = [
      '../../features/clients/components/intake-form-trigger.tsx',
      '../../features/requests/components/requests-dialog-trigger.tsx',
      '../../features/notifications/components/notifications-bell.tsx',
      '../../features/requests/components/appointment-request-actions.tsx',
    ];

    for (const path of paths) {
      const source = await Bun.file(`${import.meta.dir}/${path}`).text();
      expect(source).toContain('useDialogPresence(');
    }

    const approveSource = await Bun.file(
      `${import.meta.dir}/../../features/requests/components/approve-dialog.tsx`,
    ).text();
    expect(approveSource).toContain('open: boolean;');
    expect(approveSource).toContain('<Dialog open={open}');
  });

  test('booking dialogs retain payloads while passing explicit open state', async () => {
    const [calendarSource, appointmentSource, newClientSource] = await Promise.all([
      Bun.file(`${import.meta.dir}/../../features/booking/components/calendar.tsx`).text(),
      Bun.file(`${import.meta.dir}/../../features/booking/components/appointment-dialog.tsx`).text(),
      Bun.file(`${import.meta.dir}/../../features/booking/components/new-client-dialog.tsx`).text(),
    ]);

    expect(calendarSource).toContain('useDialogPresenceValue(newClientFor)');
    expect(calendarSource).toContain('useDialogPresenceValue(editing)');
    expect(appointmentSource).toContain('open: boolean;');
    expect(appointmentSource).toContain('<Dialog open={open}');
    expect(newClientSource).toContain('open: boolean;');
    expect(newClientSource).toContain('open={open}');
  });

  test('URL-owned appointment request waits for shared presence before navigating', async () => {
    const source = await Bun.file(
      `${import.meta.dir}/../../features/portal/components/appointment-request-dialog.tsx`,
    ).text();

    expect(source).toContain('useDialogPresence(open)');
    expect(source).toContain('if (dialogPresent || open) return;');
  });
});
