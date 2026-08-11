'use server';

import { revalidatePath } from 'next/cache';

import { type Locale } from '@/i18n/routing';
import { requireStaffClinic } from '@/lib/session';

import { isWhatsappEnabled, WhatsappConfigError } from './config';
import { connectClinic, disconnectClinic, readConnection, refreshConnection } from './connection';
import {
  type AutomationActionState,
  type ConnectionActionState,
  type SendMessageActionState,
} from './form-state';
import { GatewayError } from './gateway';
import { updateAutomationSettings } from './mutations';
import { sendManualMessage } from './notify';
import { automationSettingsSchema, localeSchema, sendMessageSchema } from './schema';
import { type ConnectionView } from './types';

/**
 * The WhatsApp feature's mutations.
 *
 * A server action is a public endpoint — the page guard protects the render, not
 * the write — so every action re-verifies the staff session and scopes everything
 * to the caller's own clinic. Same shape as `src/features/clients/actions.ts`:
 * validation in `./schema.ts`, gateway work in `./connection.ts`, and only the
 * Next.js concerns here.
 *
 * `errors.gateway` is deliberately a distinct outcome from `errors.unexpected`.
 * "The WhatsApp gateway is not answering" is something the dietitian can act on
 * (start it, check the URL); "something went wrong" is not.
 *
 * `errors.misconfigured` is there for the same reason and was learnt the hard
 * way. An install with `WHATSAPP_ENABLED=true` and an empty `WHATSAPP_API_KEY`
 * threw out of `readConfig` on every Connect, landed in the generic branch, and
 * told the clinic to try again — which cannot work, because no number of
 * retries sets an environment variable. The variable's name goes to the log for
 * whoever runs the install; the screen says the install is unfinished.
 */

function settingsPath(locale: Locale): string {
  return `/${locale}/app/settings/whatsapp`;
}

function readLocale(formData: FormData): Locale {
  return localeSchema.parse(formData.get('locale'));
}

/** Both gateway-facing actions fail the same four ways. */
function toConnectionError(error: unknown, operation: string): ConnectionActionState {
  if (error instanceof GatewayError) {
    console.error(`[whatsapp] ${operation} failed`, { status: error.status, detail: error.detail });
    return { status: 'error', messageKey: 'errors.gateway' };
  }

  // Checked before the generic branch because it is the one failure here that
  // nothing at the clinic's end can fix — see the note at the top of the file.
  if (error instanceof WhatsappConfigError) {
    console.error(`[whatsapp] ${operation} failed: ${error.message}`);
    return { status: 'error', messageKey: 'errors.misconfigured' };
  }

  console.error(`[whatsapp] ${operation} failed`, error);
  return { status: 'error', messageKey: 'errors.unexpected' };
}

export async function connectWhatsappAction(
  _previousState: ConnectionActionState,
  formData: FormData,
): Promise<ConnectionActionState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  if (!isWhatsappEnabled()) return { status: 'error', messageKey: 'errors.disabled' };

  try {
    await connectClinic(clinicId);
  } catch (error) {
    return toConnectionError(error, 'connect');
  }

  revalidatePath(settingsPath(locale));

  return { status: 'success', messageKey: 'connection.started' };
}

export async function disconnectWhatsappAction(
  _previousState: ConnectionActionState,
  formData: FormData,
): Promise<ConnectionActionState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  try {
    await disconnectClinic(clinicId);
  } catch (error) {
    return toConnectionError(error, 'disconnect');
  }

  revalidatePath(settingsPath(locale));

  return { status: 'success', messageKey: 'connection.disconnected' };
}

/**
 * Re-reads the gateway and hands the whole view back to the client component.
 *
 * Called on a timer while pairing: a QR code expires in well under a minute, so
 * the page has to ask again rather than render one and wait. It returns state
 * instead of revalidating, because a full route revalidation per poll would
 * re-run every query on the page to redraw one image.
 *
 * The stored row is returned unchanged if the gateway is unreachable — see
 * `refreshConnection`.
 */
export async function refreshWhatsappStatusAction(rawLocale: string): Promise<ConnectionView> {
  const locale = localeSchema.parse(rawLocale);
  const { clinicId } = await requireStaffClinic(locale);

  if (!isWhatsappEnabled()) return readConnection(clinicId);

  try {
    return await refreshConnection(clinicId);
  } catch (error) {
    console.error('[whatsapp] status refresh failed', error);
    return readConnection(clinicId);
  }
}

export async function saveAutomationSettingsAction(
  _previousState: AutomationActionState,
  formData: FormData,
): Promise<AutomationActionState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = automationSettingsSchema.safeParse({
    remindersEnabled: formData.get('remindersEnabled'),
    confirmationsEnabled: formData.get('confirmationsEnabled'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  try {
    const saved = await updateAutomationSettings(clinicId, parsed.data);

    // No row means the clinic never pressed Connect. Saving preferences for a
    // connection that does not exist would silently do nothing.
    if (!saved) return { status: 'error', messageKey: 'errors.notLinked' };
  } catch (error) {
    console.error('[whatsapp] saving automation settings failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }

  revalidatePath(settingsPath(locale));

  return { status: 'success', messageKey: 'automation.saved' };
}

/**
 * Sends a message a dietitian typed on a client's page.
 *
 * The client id is validated against the caller's clinic inside
 * `sendManualMessage` (`getClientTarget` is clinic-scoped), so a forged id in the
 * form reaches nobody.
 */
export async function sendWhatsappMessageAction(
  _previousState: SendMessageActionState,
  formData: FormData,
): Promise<SendMessageActionState> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const parsed = sendMessageSchema.safeParse({
    clientId: formData.get('clientId'),
    body: formData.get('body'),
  });

  if (!parsed.success) return { status: 'error', messageKey: 'errors.invalid' };

  try {
    const result = await sendManualMessage(clinicId, parsed.data.clientId, parsed.data.body);

    if (result.status === 'sent') {
      revalidatePath(`/${locale}/app/clients/${parsed.data.clientId}`);
      return { status: 'success', messageKey: 'send.sent' };
    }

    if (result.status === 'failed') return { status: 'error', messageKey: 'errors.sendFailed' };

    // A duplicate cannot happen here — a manual send gets a random dedupe key —
    // so the remaining reasons are about the setup, not the message.
    if (result.reason === 'no_phone') return { status: 'skipped', messageKey: 'send.noPhone' };
    if (result.reason === 'not_on_whatsapp') return { status: 'skipped', messageKey: 'send.notOnWhatsapp' };
    if (result.reason === 'not_connected') return { status: 'skipped', messageKey: 'send.notConnected' };
    // Unreachable through this action (the schema rejects an empty body), but it is
    // a bad input rather than a missing connection, so it must not say otherwise.
    if (result.reason === 'empty_body') return { status: 'error', messageKey: 'errors.invalid' };

    return { status: 'skipped', messageKey: 'send.notConfigured' };
  } catch (error) {
    // The same half-finished install reaches here through `getWhatsappConfig`,
    // and deserves the same answer it gets on the settings page rather than a
    // second, vaguer name for one problem.
    if (error instanceof WhatsappConfigError) {
      console.error(`[whatsapp] manual send failed: ${error.message}`);
      return { status: 'error', messageKey: 'errors.misconfigured' };
    }

    console.error('[whatsapp] manual send failed', error);
    return { status: 'error', messageKey: 'errors.unexpected' };
  }
}
