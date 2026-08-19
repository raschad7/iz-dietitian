type DialogEvent = {
  target: unknown;
  currentTarget: unknown;
};

/**
 * React delegates dialog events, so a nested native dialog can reach an
 * ancestor dialog's handler even when the platform event does not bubble.
 * Only the dialog that actually emitted the event may act on it.
 */
export function isCurrentDialogEvent(event: DialogEvent): boolean {
  return event.target === event.currentTarget;
}
