/**
 * Pacing for outgoing WhatsApp messages.
 *
 * The gateway drives an unofficial WhatsApp client, and a burst of messages
 * from one number is the single most reliable way to get that number
 * restricted — `infra/openwa/README.md` is explicit about it. A clinic's real
 * volume is a handful of messages an hour, so spacing them costs nothing and
 * removes the failure mode entirely.
 *
 * Two things make this different from a `sleep()` in a loop, which is what
 * `sendDueAppointmentReminders` used to do on its own:
 *
 *  1. **Every path is paced, not just the reminder run.** A course of
 *     appointments booked in one save, a bill and its PDF, a dietitian typing
 *     two messages in a row — none of those go through the reminder loop, and
 *     all of them leave the same number.
 *  2. **Sends are serialized per clinic.** Two requests that happen to overlap
 *     would each see "the last send was a while ago" and fire together; the
 *     queue below makes the second wait for the first, then wait its gap.
 *
 * The gap is per clinic, because that is the unit that owns a phone number.
 * Two clinics sending at the same moment are two different numbers and do not
 * need to take turns.
 *
 * **In-process only.** The state is a module-level map, so two app instances
 * pace independently. That is honest for this deployment — one Next.js process
 * per install — and a cross-instance version would need the gap in the database
 * on the send path, which is a cost worth paying only once a second instance
 * exists.
 */

type PacingOptions = {
  /** Minimum gap between two sends for the same clinic. Zero disables pacing. */
  spacingMs: number;
  /**
   * Extra random delay on top of the gap, so a run of reminders does not leave
   * a metronome-perfect trail behind it. Zero for an exact gap.
   */
  jitterMs: number;
};

/** The tail of each clinic's queue: resolves when the send before it is done. */
const queues = new Map<string, Promise<void>>();
/** When each clinic's last send finished. */
const finishedAt = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Runs `send` after this clinic's turn comes up and its gap has elapsed.
 *
 * Returns whatever `send` returns and rethrows what it throws — a failed send
 * still counts as a send for pacing purposes, because the gateway talked to
 * WhatsApp either way.
 */
export function paceSend<T>(clinicId: string, options: PacingOptions, send: () => Promise<T>): Promise<T> {
  const previous = queues.get(clinicId) ?? Promise.resolve();

  const result = previous.then(async () => {
    const last = finishedAt.get(clinicId);

    if (last !== undefined && options.spacingMs > 0) {
      const jitter = options.jitterMs > 0 ? Math.random() * options.jitterMs : 0;
      const wait = last + options.spacingMs + jitter - Date.now();

      if (wait > 0) await sleep(wait);
    }

    try {
      return await send();
    } finally {
      finishedAt.set(clinicId, Date.now());
    }
  });

  // The queue tail must never reject, or the next send would inherit the
  // failure instead of simply taking its turn.
  const tail = result.then(
    () => undefined,
    () => undefined,
  );

  queues.set(clinicId, tail);

  // Drop the clinic once nothing is waiting behind it, so a long-lived process
  // does not hold a promise per clinic it has ever messaged. The timestamp
  // stays: it is what the *next* send measures its gap from.
  void tail.then(() => {
    if (queues.get(clinicId) === tail) queues.delete(clinicId);
  });

  return result;
}

/** Test seam: forgets every clinic's turn and last-send time. */
export function resetSendPacing(): void {
  queues.clear();
  finishedAt.clear();
}
