/**
 * Which holes each editable message may carry, and what fills them.
 *
 * `renderWhatsappMessage` throws when a template names a placeholder it has no
 * value for — which is the right behaviour for copy that ships with the app and
 * the wrong one for copy a dietitian typed a minute ago, because the throw
 * happens at *send* time. A patient's booking would go unconfirmed because
 * somebody wrote `{data}` for `{date}`, and the only trace would be a failed
 * send in a log.
 *
 * So the set is stated here, the editor lists it, and the action refuses a body
 * that uses anything else. The check runs where the mistake is made, in front of
 * the person who made it.
 *
 * ⚠ **These are the names the templates already use**, and they have to keep
 * matching `WhatsappTemplateVariables` and what `notify.ts` actually passes for
 * each kind. A name added here that nothing fills is a message that throws at
 * send time — exactly what this file exists to prevent.
 */
export const WHATSAPP_PLACEHOLDERS = {
  /** Booked: the appointment that was just made. */
  appointmentConfirmation: ['clientName', 'clinicName', 'date', 'time'],
  /** The day before: the appointment that is coming. */
  appointmentReminder: ['clientName', 'clinicName', 'date', 'time'],
  /**
   * Moved: where it is now, and where it was.
   *
   * The previous slot is what makes this message worth sending as its own
   * thing rather than as a second confirmation — a patient who reads only the
   * new time cannot tell whether they misremembered the old one.
   */
  appointmentRescheduled: ['clientName', 'clinicName', 'date', 'time', 'previousDate', 'previousTime'],
  /** Deleted: the slot that is no longer held. */
  appointmentCancelled: ['clientName', 'clinicName', 'date', 'time'],
  /**
   * Owed: what is still outstanding on the account.
   *
   * No date or time — this message is about a balance, not a moment, and the
   * figure is read from the ledger at the moment somebody presses send.
   */
  paymentReminder: ['clientName', 'clinicName', 'amount'],
} as const satisfies Record<string, readonly string[]>;

/** The messages the Forms tab can rewrite. */
export type WhatsappFormKind = keyof typeof WHATSAPP_PLACEHOLDERS;

/** `{name}` — the same shape `templates.ts` renders. */
const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * The placeholder names a body uses, in the order it uses them, with repeats
 * collapsed.
 *
 * Deliberately a plain scan of the text rather than an attempt to render it:
 * the question the editor asks is "does this body name anything I cannot
 * fill", and rendering to find out would mean inventing values for a message
 * nobody is sending.
 */
export function placeholdersIn(body: string): string[] {
  return [...new Set([...body.matchAll(PLACEHOLDER)].map((match) => match[1]!))];
}

/**
 * The placeholders a body uses that the message has no value for — empty when
 * the body is safe to send.
 *
 * Unknown names only. A body that *omits* a placeholder is fine and is not
 * reported: a clinic that does not want the time in its cancellation notice is
 * entitled to leave it out, and there is nothing to fail at send time.
 */
export function unknownPlaceholders(body: string, allowed: readonly string[]): string[] {
  return placeholdersIn(body).filter((name) => !allowed.includes(name));
}
