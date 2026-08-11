/**
 * Form state shapes and their initial values.
 *
 * Separate from `actions.ts` because a `"use server"` module may only export
 * async functions — exporting a plain object from one does not fail the build, it
 * fails at runtime and confusingly. See the same note in
 * `src/features/clients/form-state.ts`.
 *
 * Every `messageKey` is a path inside the `whatsapp` namespace of
 * `src/i18n/messages/*.json`.
 */

export type ConnectionActionState =
  | { status: 'idle' }
  | {
      status: 'error';
      messageKey: 'errors.disabled' | 'errors.gateway' | 'errors.misconfigured' | 'errors.unexpected';
    }
  | { status: 'success'; messageKey: 'connection.started' | 'connection.disconnected' };

export type AutomationActionState =
  | { status: 'idle' }
  | { status: 'error'; messageKey: 'errors.invalid' | 'errors.notLinked' | 'errors.unexpected' }
  | { status: 'success'; messageKey: 'automation.saved' };

/**
 * The composer's outcome. `skipped` is its own status rather than an error: "this
 * client has no phone number" is a fact about the record, not a failure of the
 * send, and it needs different wording.
 */
export type SendMessageActionState =
  | { status: 'idle' }
  | {
      status: 'error';
      messageKey: 'errors.invalid' | 'errors.sendFailed' | 'errors.misconfigured' | 'errors.unexpected';
    }
  | {
      status: 'skipped';
      messageKey: 'send.noPhone' | 'send.notOnWhatsapp' | 'send.notConnected' | 'send.notConfigured';
    }
  | { status: 'success'; messageKey: 'send.sent' };

export const initialConnectionState: ConnectionActionState = { status: 'idle' };
export const initialAutomationState: AutomationActionState = { status: 'idle' };
export const initialSendMessageState: SendMessageActionState = { status: 'idle' };
