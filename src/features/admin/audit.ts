import 'server-only';

import { and, desc, eq, gte, ilike, inArray, or, sql } from 'drizzle-orm';
import { headers } from 'next/headers';

import { db } from '@/db';
import { adminAuditLog } from '@/db/schema/admin-audit';
import { readClientIp } from '@/features/auth/rate-limit';

import {
  actionSpec,
  AUDIT_TARGET_FALLBACK,
  escapeLike,
  isUsableReason,
  REASON_MIN_LENGTH,
  requiresReason,
  type AdminActionKey,
  type AuditTargetType,
} from './audit-rules';

/**
 * The record of what the platform operator did — the half that talks to the
 * database.
 *
 * ⚠ **This module is server-only**, and says so on its first line. It imports
 * `next/headers` and the `postgres` driver, so a client component that reaches
 * for anything here drags a TCP client into the browser bundle. That happened
 * once already: `ReasonDialog` imported two length constants from here and the
 * dev server answered with four `Module not found` walls for `net`, `tls`, `fs`
 * and `perf_hooks`. The `server-only` import turns that into one sentence naming
 * the file that did it, and the constants live in `audit-rules.ts` where a
 * client component can have them.
 *
 * ## Every row is a snapshot
 *
 * `actorEmail` and `targetLabel` are copies taken at the time, not joins
 * resolved on read. A log that renders "user 9f3a… suspended clinic 7c1b…" the
 * day after both rows were deleted has recorded nothing.
 *
 * ## Nothing here is ever updated or deleted
 *
 * There is no update path and no delete path. Postgres cannot enforce
 * append-only against a role that holds `UPDATE`, so this is a rule about the
 * code rather than a constraint — but it is why the table carries no
 * `updated_at`. A row that could be corrected would be a row nobody can cite.
 */

/** The rules, re-exported so a caller needs one import rather than two. */
export {
  actionSpec,
  ADMIN_ACTIONS,
  escapeLike,
  isUsableReason,
  REASON_MAX_LENGTH,
  REASON_MIN_LENGTH,
  requiresReason,
  type AdminActionKey,
  type AdminActionSpec,
  type AuditTargetType,
} from './audit-rules';

/** One thing that happened, as the caller describes it. */
export type AuditInput = {
  action: AdminActionKey;
  actorId: string;
  actorEmail: string;
  targetId: string;
  /** The name or address the target went by at the time. Never re-resolved on read. */
  targetLabel: string;
  reason?: string | null;
  /** Only the fields the action touched. See the schema's note. */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** `refused` when the system said no. Those attempts are worth seeing. */
  outcome?: 'ok' | 'refused';
};

/**
 * Writes one entry.
 *
 * ## It is called inside the action's transaction where there is one
 *
 * `tx` is a parameter rather than a global so a suspension and its log entry
 * commit or fail together. A panel that can suspend a clinic and then fail to
 * record it has a log that is worse than none — it is a log that looks complete.
 *
 * ## The IP is read here, not passed in
 *
 * `headers()` is available to a server action, and reading it at the point of
 * writing means no caller can forget. It is a hint and not evidence — see the
 * column's own note and `readClientIp`.
 *
 * ## It throws when a destructive verb arrives with no reason
 *
 * Not a returned error state: every caller validates the reason against
 * `isUsableReason` before it does anything, so reaching this branch means a code
 * path skipped that. Loud is correct.
 */
export async function writeAudit(
  input: AuditInput,
  tx: Pick<typeof db, 'insert'> = db,
): Promise<void> {
  const reason = input.reason?.trim() || null;

  if (requiresReason(input.action) && !isUsableReason(reason)) {
    throw new Error(
      `audit: ${input.action} requires a reason of at least ${REASON_MIN_LENGTH} characters`,
    );
  }

  const spec = actionSpec(input.action);

  await tx.insert(adminAuditLog).values({
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    action: input.action,
    targetType: spec?.target ?? AUDIT_TARGET_FALLBACK,
    targetId: input.targetId,
    targetLabel: input.targetLabel,
    outcome: input.outcome ?? 'ok',
    reason,
    before: input.before ?? null,
    after: input.after ?? null,
    ipAddress: readClientIp(await headers()),
  });
}

/** One entry, as the log screen lists it. */
export type AuditEntry = {
  id: string;
  actorId: string | null;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  outcome: string;
  reason: string | null;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  createdAt: Date;
};

export type AuditFilters = {
  /** Matches the operator's address, the target's label, or the reason. */
  query?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  since?: Date | null;
  limit?: number;
  offset?: number;
};

/** The most this reads in one page. A log is scrolled, not studied all at once. */
export const AUDIT_PAGE_SIZE = 50;

/**
 * The `where` a set of filters comes to, shared by the list and its count.
 *
 * One function rather than two copies, because a filter that narrows the rows
 * and not the count produces a pager that offers pages which come back empty —
 * the kind of bug that only shows up on page three.
 */
function auditConditions(filters: AuditFilters) {
  const term = filters.query?.trim();

  return [
    filters.action ? eq(adminAuditLog.action, filters.action) : undefined,
    filters.targetType ? eq(adminAuditLog.targetType, filters.targetType) : undefined,
    filters.targetId ? eq(adminAuditLog.targetId, filters.targetId) : undefined,
    filters.since ? gte(adminAuditLog.createdAt, filters.since) : undefined,
    term
      ? or(
          ilike(adminAuditLog.actorEmail, `%${escapeLike(term)}%`),
          ilike(adminAuditLog.targetLabel, `%${escapeLike(term)}%`),
          ilike(adminAuditLog.reason, `%${escapeLike(term)}%`),
        )
      : undefined,
  ].filter(Boolean);
}

/**
 * The log, newest first.
 *
 * Paginated in SQL rather than capped, unlike the other platform reads. This is
 * the one table that only grows: every other screen here is bounded by how many
 * clinics or foods exist, and this one is bounded by how much the operator has
 * done. A `limit` with no `offset` would make the panel unable to show anything
 * but the last fifty things that ever happened.
 *
 * The search matches three columns rather than one. An operator looking a
 * suspension up has either the clinic's name, their own address, or a phrase
 * from the reason they wrote — and which of the three they have is not something
 * a search box should make them declare.
 */
export async function listAuditEntries(filters: AuditFilters = {}): Promise<AuditEntry[]> {
  const conditions = auditConditions(filters);

  return db
    .select()
    .from(adminAuditLog)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(filters.limit ?? AUDIT_PAGE_SIZE)
    .offset(filters.offset ?? 0);
}

/** How many entries match, so the screen can page rather than guess. */
export async function countAuditEntries(filters: AuditFilters = {}): Promise<number> {
  const conditions = auditConditions(filters);

  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(adminAuditLog)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return row?.total ?? 0;
}

/**
 * The last few things done to one clinic or account, for its own screen.
 *
 * A person opening a clinic that is suspended wants to know why without going
 * to a second screen and filtering it. This is that question, asked directly.
 */
export function listAuditForTarget(
  targetType: AuditTargetType,
  targetId: string,
  limit = 10,
): Promise<AuditEntry[]> {
  return listAuditEntries({ targetType, targetId, limit });
}

/** How many entries each of several targets has, so a list can show a marker. */
export async function countAuditByTarget(
  targetType: AuditTargetType,
  targetIds: readonly string[],
): Promise<Map<string, number>> {
  if (targetIds.length === 0) return new Map();

  const rows = await db
    .select({ targetId: adminAuditLog.targetId, total: sql<number>`count(*)::int` })
    .from(adminAuditLog)
    .where(
      and(eq(adminAuditLog.targetType, targetType), inArray(adminAuditLog.targetId, [...targetIds])),
    )
    .groupBy(adminAuditLog.targetId);

  return new Map(rows.map((row) => [row.targetId, row.total]));
}
