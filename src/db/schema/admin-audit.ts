import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth';

/**
 * What the platform operator did, and why.
 *
 * ## Why this table exists
 *
 * Every other write in this application is made by a clinic to its own data,
 * and the clinic can see the result. The platform area is the one place where a
 * person reaches across that boundary — suspending a practice, disabling an
 * account, rewriting a food every clinic reads — and the party affected by that
 * write cannot see it happen. A privileged action nobody can review afterwards
 * is one nobody can answer for.
 *
 * So this is not a debug log. It is the answer to "who turned this clinic off,
 * when, and what reason did they give", asked months later by someone who may
 * not be the person who did it.
 *
 * ## Every row is a snapshot, not a set of pointers
 *
 * `actorEmail`, `targetLabel` and the two payloads are **copies taken at the
 * time**, not joins resolved on read. A log that renders "user 9f3a… suspended
 * clinic 7c1b…" the day after both rows were deleted has recorded nothing. The
 * foreign key on `actorId` is there so a live account can still be linked to,
 * and it is `set null` rather than `cascade` for the same reason: deleting the
 * operator must not erase the record of what they did.
 *
 * ## Nothing here is ever updated or deleted
 *
 * There is no update path and no delete path in the feature. Postgres cannot
 * enforce append-only against a role that holds `UPDATE`, so this is a rule
 * about the code rather than a constraint — but it is why the table carries no
 * `updated_at`. A row that could be corrected would be a row nobody can cite.
 *
 * ## Failures are recorded too
 *
 * A refused action — the last admin trying to disable themselves, a promotion
 * blocked because the clinic still has patients — is written with
 * `outcome: 'refused'`. "Someone tried to do this and the system said no" is
 * exactly the kind of thing a review wants to see, and a log that only records
 * what succeeded cannot show an attempt.
 */
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * The admin account that acted. `set null` when that account is removed —
     * see the header. `actorEmail` is what keeps the row readable either way.
     */
    actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),

    /** The operator's address as it was at the time. Never re-resolved. */
    actorEmail: text('actor_email').notNull(),

    /**
     * A dotted verb: `clinic.suspend`, `account.disable`, `catalog.food.update`.
     *
     * `text` rather than a `pgEnum` — the list grows every time the platform
     * area grows a button, and that should not be a migration. The closed set
     * lives in `src/features/admin/audit.ts` as `ADMIN_ACTIONS`, which is also
     * what the screen's filter is built from.
     */
    action: text('action').notNull(),

    /** `clinic` | `account` | `food`. What kind of thing was acted on. */
    targetType: text('target_type').notNull(),

    /** The row's id, as text: clinics use uuid, accounts use Better Auth's id. */
    targetId: text('target_id').notNull(),

    /**
     * What the thing was called at the time — a clinic name, an email address.
     *
     * Denormalised on purpose. This is the column that makes a deleted target's
     * history still mean something, and it is what the log's search matches on.
     */
    targetLabel: text('target_label').notNull(),

    /**
     * `ok` | `refused`. See the header: a blocked attempt is worth recording.
     */
    outcome: text('outcome').notNull().default('ok'),

    /**
     * Why, in the operator's own words.
     *
     * Nullable in the database and required by the action for anything
     * destructive. The column cannot express "required for these six verbs and
     * not the other three", so the rule lives where the verbs do — in
     * `ADMIN_ACTIONS` — and the schema records what was actually given.
     */
    reason: text('reason'),

    /**
     * The fields that changed, before and after — `{ suspendedAt: null }` then
     * `{ suspendedAt: '2026-09-05T…' }`.
     *
     * Only the fields the action touched, never the whole row. A full snapshot
     * of a clinic on every edit would bury the one changed value in forty that
     * did not, which is the failure mode of most audit tables.
     */
    before: jsonb('before'),
    after: jsonb('after'),

    /**
     * Where the request came from, when a proxy told us. Forgeable without a
     * trusted proxy in front — the same caveat `auth_attempts.ip_address`
     * carries, and for the same reason. A hint, never evidence.
     */
    ipAddress: text('ip_address'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /* The log's default view is "everything, newest first", and every filtered
       view is that same order narrowed. This index serves all of them. */
    index('admin_audit_log_created_at_idx').on(table.createdAt),
    /* "What has ever been done to this clinic" — the query the clinic detail
       screen runs, and the one a support question always turns into. */
    index('admin_audit_log_target_idx').on(table.targetType, table.targetId, table.createdAt),
    /* "Every suspension", "everything this operator did". */
    index('admin_audit_log_action_idx').on(table.action, table.createdAt),
    index('admin_audit_log_actor_idx').on(table.actorId, table.createdAt),
  ],
);

export type AdminAuditEntry = typeof adminAuditLog.$inferSelect;
export type NewAdminAuditEntry = typeof adminAuditLog.$inferInsert;
