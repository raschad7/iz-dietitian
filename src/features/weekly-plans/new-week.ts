/** What the dialog's generate door does with the plan already on screen. */
export type NewWeekMode = 'regenerate' | 'create';

/**
 * A draft is work in progress and nobody has seen it, so generating again
 * replaces it. Anything else — a published plan, no plan, a status this build
 * does not recognise — gets a new week, because overwriting something a client
 * may already be following is not a default.
 */
export function newWeekMode(board: { status: string } | null): NewWeekMode {
  return board?.status === 'draft' ? 'regenerate' : 'create';
}
