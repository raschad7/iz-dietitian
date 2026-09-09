import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import { appointments } from '@/db/schema/appointments';
import { user } from '@/db/schema/auth';
import { session as sessionTable } from '@/db/schema/auth';
import { clientCharges, clientPayments } from '@/db/schema/billing';
import { catalogFoods } from '@/db/schema/catalog-foods';
import { clients } from '@/db/schema/clients';
import { clinics } from '@/db/schema/clinics';
import { weeklyPlans, weeklyPlanGenerations } from '@/db/schema/weekly-plans';
import { whatsappSettings } from '@/db/schema/whatsapp';

import type { UsageRow } from './ai-usage';
import { escapeLike } from './audit-rules';
import { assessClinic, type ClinicActivity, type ClinicHealth } from './health';
import { bucketBy, dayKey, dayKeys, monthKey, monthKeys, type Period } from './period';
import { loadPlanCatalog } from './plan-catalog';
import { isKnownPlan, planOf, type PlanCatalog } from './plans';

/**
 * The platform's reads — the ONLY queries in this application that deliberately
 * omit a `clinic_id` filter.
 *
 * ⚠ **Nothing outside `src/features/admin/` may import from this module.** Every
 * other read path in the app is scoped by the clinic `requireStaffClinic()`
 * returns, and a query that crosses that boundary is correct in exactly one
 * place: behind `requireAdminSession()`, which is the only guard that grants a
 * session with no clinic of its own. Imported anywhere else it is a data leak
 * between tenants, so the boundary is enforced by lint as well as by review —
 * see the `no-restricted-imports` entry in `eslint.config.mjs`.
 *
 * ## Two rules this file follows that the first version did not
 *
 * **Counting happens in the database.** The overview used to `select` whole
 * tables — every user, every plan, every clinic — and count them in JavaScript.
 * That is correct arithmetic and the wrong shape: the one screen that should be
 * cheap was the one that transferred the most, and it grew linearly with the
 * deployment while answering a question whose answer is a dozen integers.
 * Aggregates with `filter (where …)` do it in one pass per table.
 *
 * **Every window has the window before it.** A figure with no baseline cannot
 * be acted on. Reads that answer "how many in this period" take a `Period` from
 * `period.ts` and answer for both halves, so the screen can show a delta rather
 * than a bare count.
 *
 * ## A note on `sql` templates here
 *
 * Column names inside these templates are written as bare SQL, not interpolated
 * Drizzle columns. That is deliberate and it is not laziness: Drizzle renders an
 * interpolated column **without its table**, which in a correlated subquery
 * resolved `id` against the wrong relation and produced a `uuid = text` error —
 * the loud version of a bug that would otherwise have counted zero everywhere.
 * Every template below reads from exactly one table, so bare names are
 * unambiguous, and the join-carrying reads use Drizzle's own builder instead.
 */

/**
 * An instant, as a bound parameter a raw `sql` template can carry.
 *
 * ⚠ **Never interpolate a bare `Date` into a `sql` template.** Drizzle's own
 * comparison helpers — `gte`, `lt` — know the column's type and encode a `Date`
 * for it, but inside a hand-written fragment there is no column to learn from,
 * so the value reaches postgres.js unconverted and it refuses:
 * *"The 'string' argument must be of type string or an instance of Buffer or
 * ArrayBuffer. Received an instance of Date."*
 *
 * It fails at runtime and nowhere earlier: the template accepts `unknown`, so
 * `tsc` is happy and eslint has nothing to say. Every `filter (where …)` clause
 * below goes through this.
 *
 * The explicit `::timestamptz` is not decoration. A bare string parameter would
 * be compared as `unknown` and Postgres would resolve the operator by guessing
 * from the other side; saying the type means the comparison is the one intended
 * even if the column's type ever changes.
 */
function at(instant: Date) {
  return sql`${instant.toISOString()}::timestamptz`;
}

/* ── AI usage ──────────────────────────────────────────────────────────────── */

/**
 * Every model call in a window, joined to the clinic that made it.
 *
 * One row per call rather than a `group by` in SQL, and that is a deliberate
 * trade. The aggregation lives in `ai-usage.ts` as pure functions over these
 * rows, which is what lets the same set be totalled four ways — by clinic, by
 * model, by scope, by day — from one read, and lets every one of those totals be
 * asserted in a unit test with no database.
 *
 * That trade holds because of what this table is: one row per plan generation,
 * across every clinic. A busy deployment writes a few thousand a year. The
 * screen's range picker is what bounds it, and `until` is what lets the same
 * function answer for the previous period without a second query shape.
 */
export async function listGenerations(since: Date | null, until?: Date | null): Promise<UsageRow[]> {
  const bounds = [
    since ? gte(weeklyPlanGenerations.createdAt, since) : undefined,
    until ? lt(weeklyPlanGenerations.createdAt, until) : undefined,
  ].filter(Boolean);

  return db
    .select({
      clinicId: clinics.id,
      clinicName: clinics.name,
      scope: weeklyPlanGenerations.scope,
      model: weeklyPlanGenerations.model,
      status: weeklyPlanGenerations.status,
      promptTokens: weeklyPlanGenerations.promptTokens,
      completionTokens: weeklyPlanGenerations.completionTokens,
      durationMs: weeklyPlanGenerations.durationMs,
      createdAt: weeklyPlanGenerations.createdAt,
    })
    .from(weeklyPlanGenerations)
    .innerJoin(clinics, eq(clinics.id, weeklyPlanGenerations.clinicId))
    .where(bounds.length > 0 ? and(...bounds) : undefined)
    .orderBy(desc(weeklyPlanGenerations.createdAt));
}

/** One failed run, for the screen's short list of what is going wrong. */
export type GenerationFailure = {
  clinicId: string;
  clinicName: string;
  scope: string;
  model: string;
  error: string | null;
  createdAt: Date;
};

/**
 * The most recent failures, newest first.
 *
 * A separate read rather than a filter over `listGenerations`, because it wants
 * a column that one does not select: `error`, which holds up to 1,000 characters
 * of the provider's own explanation. Carrying that on every row of a
 * whole-platform read to display it on a handful would be the expensive half of
 * the table loaded for nothing.
 */
export async function listRecentFailures(since: Date | null, limit = 10): Promise<GenerationFailure[]> {
  return db
    .select({
      clinicId: clinics.id,
      clinicName: clinics.name,
      scope: weeklyPlanGenerations.scope,
      model: weeklyPlanGenerations.model,
      error: weeklyPlanGenerations.error,
      createdAt: weeklyPlanGenerations.createdAt,
    })
    .from(weeklyPlanGenerations)
    .innerJoin(clinics, eq(clinics.id, weeklyPlanGenerations.clinicId))
    .where(
      since
        ? and(eq(weeklyPlanGenerations.status, 'failed'), gte(weeklyPlanGenerations.createdAt, since))
        : eq(weeklyPlanGenerations.status, 'failed'),
    )
    .orderBy(desc(weeklyPlanGenerations.createdAt))
    .limit(limit);
}

/**
 * How many clinics exist.
 *
 * `count()` in the database. It read every id and took `.length` before, which
 * is the same answer bought by transferring one row per clinic to discard it.
 */
export async function countClinics(): Promise<number> {
  const [row] = await db.select({ total: count() }).from(clinics);

  return row?.total ?? 0;
}

/* ── Clinic activity and health ────────────────────────────────────────────── */

/** A clinic as the registry lists it, with everything the row shows. */
export type ClinicRecord = {
  id: string;
  name: string;
  phone: string | null;
  contactEmail: string | null;
  address: string | null;
  onboardingCompletedAt: Date | null;
  suspendedAt: Date | null;
  createdAt: Date;
  plan: string;
  planStartedAt: Date | null;
  trialEndsAt: Date | null;
  planPriceMinor: number | null;
  staff: number;
  clients: number;
  plans: number;
  /** What the practice has billed and collected from its own patients, in minor units. */
  billedMinor: number;
  collectedMinor: number;
  activity: ClinicActivity;
  health: ClinicHealth;
};

type Counts = {
  staff: number;
  clients: number;
  activeClients: number;
  plans: number;
  billedMinor: number;
  collectedMinor: number;
  lastPlanAt: Date | null;
  lastClientAt: Date | null;
  lastSignInAt: Date | null;
  plansRecent: number;
  plansPrevious: number;
  aiPlansThisMonth: number;
};

const NO_COUNTS: Counts = {
  staff: 0,
  clients: 0,
  activeClients: 0,
  plans: 0,
  billedMinor: 0,
  collectedMinor: 0,
  lastPlanAt: null,
  lastClientAt: null,
  lastSignInAt: null,
  plansRecent: 0,
  plansPrevious: 0,
  aiPlansThisMonth: 0,
};

/**
 * Everything the registry needs about every clinic, keyed by clinic id.
 *
 * **Six grouped queries merged in JavaScript, and neither of the two obvious
 * alternatives.**
 *
 * Not one statement with six left joins: joining `clients`, `weekly_plans` and
 * `client_charges` onto `clinics` together multiplies the rows — a clinic with 8
 * patients, 12 plans and 30 charges produces 2,880 — and every figure then needs
 * a `count(distinct …)` or a divided `sum` to undo the damage. That fan-out is
 * silent, which is the worst property a wrong number can have.
 *
 * Not correlated subqueries either, which is what this was first written as. See
 * the note in the file header about how Drizzle renders an interpolated column
 * inside a `sql` template.
 *
 * Six simple statements, each grouped on an indexed column, run concurrently,
 * and each is obviously right by reading.
 *
 * ## `lastSignInAt` is a floor, not a fact
 *
 * It is the newest `sessions.updated_at` among a clinic's staff, and sessions
 * are deleted on sign-out and swept when they expire. So it answers "the oldest
 * this clinic's activity can be" rather than "when someone last signed in": a
 * dietitian who signed in six months ago and out again leaves nothing behind.
 * The health rules treat it as the weakest of three signals for exactly that
 * reason, and the screen labels it "last seen" rather than "last sign-in".
 */
async function statsByClinic(now: Date): Promise<Map<string, Counts>> {
  const thirty = new Date(now.getTime() - 30 * 86_400_000);
  const sixty = new Date(now.getTime() - 60 * 86_400_000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [staffRows, clientRows, planRows, chargeRows, paymentRows, genRows] = await Promise.all([
    db
      .select({
        clinicId: user.clinicId,
        total: count(),
        lastSignInAt: sql<Date | null>`max(${sessionTable.updatedAt})`,
      })
      .from(user)
      .leftJoin(sessionTable, eq(sessionTable.userId, user.id))
      .where(eq(user.role, 'staff'))
      .groupBy(user.clinicId),

    db
      .select({
        clinicId: clients.clinicId,
        total: count(),
        active: sql<number>`(count(*) filter (where status = 'active'))::int`,
        lastAt: sql<Date | null>`max(created_at)`,
      })
      .from(clients)
      .groupBy(clients.clinicId),

    db
      .select({
        clinicId: weeklyPlans.clinicId,
        total: count(),
        lastAt: sql<Date | null>`max(created_at)`,
        recent: sql<number>`(count(*) filter (where created_at >= ${at(thirty)}))::int`,
        previous: sql<number>`(count(*) filter (where created_at >= ${at(sixty)} and created_at < ${at(thirty)}))::int`,
      })
      .from(weeklyPlans)
      .groupBy(weeklyPlans.clinicId),

    db
      .select({
        clinicId: clientCharges.clinicId,
        totalMinor: sql<number>`coalesce(sum(amount_minor), 0)::int`,
      })
      .from(clientCharges)
      .groupBy(clientCharges.clinicId),

    db
      .select({
        clinicId: clientPayments.clinicId,
        totalMinor: sql<number>`coalesce(sum(amount_minor), 0)::int`,
      })
      .from(clientPayments)
      .groupBy(clientPayments.clinicId),

    db
      .select({
        clinicId: weeklyPlanGenerations.clinicId,
        thisMonth: sql<number>`(count(*) filter (where created_at >= ${at(monthStart)}))::int`,
      })
      .from(weeklyPlanGenerations)
      .groupBy(weeklyPlanGenerations.clinicId),
  ]);

  const stats = new Map<string, Counts>();

  /*
    Named `bucketFor`, not `at` — the module-level `at()` that encodes a
    timestamp for a raw `sql` template is declared above, and a local `const`
    of the same name shadows it inside this whole function body. The queries
    at the top then read the shadow before its initialiser has run:
    "Cannot access 'at' before initialization", at runtime only.
  */
  const bucketFor = (clinicId: string | null): Counts | null => {
    // `user.clinic_id` is nullable, so a grouped read has a null bucket holding
    // every account that belongs to no clinic. It is not a clinic; drop it.
    if (!clinicId) return null;

    const held = stats.get(clinicId) ?? { ...NO_COUNTS };
    stats.set(clinicId, held);

    return held;
  };

  for (const row of staffRows) {
    const held = bucketFor(row.clinicId);
    if (!held) continue;
    held.staff = row.total;
    held.lastSignInAt = row.lastSignInAt ? new Date(row.lastSignInAt) : null;
  }

  for (const row of clientRows) {
    const held = bucketFor(row.clinicId);
    if (!held) continue;
    held.clients = row.total;
    held.activeClients = row.active;
    held.lastClientAt = row.lastAt ? new Date(row.lastAt) : null;
  }

  for (const row of planRows) {
    const held = bucketFor(row.clinicId);
    if (!held) continue;
    held.plans = row.total;
    held.lastPlanAt = row.lastAt ? new Date(row.lastAt) : null;
    held.plansRecent = row.recent;
    held.plansPrevious = row.previous;
  }

  for (const row of chargeRows) {
    const held = bucketFor(row.clinicId);
    if (held) held.billedMinor = row.totalMinor;
  }

  for (const row of paymentRows) {
    const held = bucketFor(row.clinicId);
    if (held) held.collectedMinor = row.totalMinor;
  }

  for (const row of genRows) {
    const held = bucketFor(row.clinicId);
    if (held) held.aiPlansThisMonth = row.thisMonth;
  }

  return stats;
}

/** Turns a clinic row and its counts into the record the screens read. */
function toRecord(
  row: typeof clinics.$inferSelect,
  stats: Counts,
  now: Date,
  catalog: PlanCatalog,
): ClinicRecord {
  const activity: ClinicActivity = {
    lastPlanAt: stats.lastPlanAt,
    lastClientAt: stats.lastClientAt,
    lastSignInAt: stats.lastSignInAt,
    plansRecent: stats.plansRecent,
    plansPrevious: stats.plansPrevious,
    staff: stats.staff,
    clients: stats.clients,
    aiPlansThisMonth: stats.aiPlansThisMonth,
  };

  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    contactEmail: row.contactEmail,
    address: row.address,
    onboardingCompletedAt: row.onboardingCompletedAt,
    suspendedAt: row.suspendedAt,
    createdAt: row.createdAt,
    plan: row.plan,
    planStartedAt: row.planStartedAt,
    trialEndsAt: row.trialEndsAt,
    planPriceMinor: row.planPriceMinor,
    staff: stats.staff,
    clients: stats.clients,
    plans: stats.plans,
    billedMinor: stats.billedMinor,
    collectedMinor: stats.collectedMinor,
    activity,
    health: assessClinic(row, activity, planOf(catalog, row.plan), now),
  };
}

/**
 * Every clinic on the deployment, with its health assessed.
 *
 * Not paginated, and not filtered in SQL. A deployment with enough clinics for
 * either is one whose platform screens deserve a rethink rather than a page
 * control bolted on — and the filtering the registry offers is by *health*,
 * which is computed in JavaScript from six aggregates, so it could not be a
 * `where` clause without moving those rules into the database where nobody can
 * test them.
 */
export async function listClinics(now: Date): Promise<ClinicRecord[]> {
  const [rows, stats, catalog] = await Promise.all([
    db.select().from(clinics).orderBy(desc(clinics.createdAt)),
    statsByClinic(now),
    loadPlanCatalog(),
  ]);

  return rows.map((row) => toRecord(row, stats.get(row.id) ?? NO_COUNTS, now, catalog));
}

/** One clinic, or null when the id names nothing. */
export async function getClinic(clinicId: string, now: Date): Promise<ClinicRecord | null> {
  const [row] = await db.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1);
  if (!row) return null;

  // The grouped read, filtered to one key. Grouping the whole table to pick a
  // single clinic out of it costs a scan that grows with the deployment, but the
  // alternative is a second set of six queries whose arithmetic could drift from
  // the registry's — and a detail screen disagreeing with the list it was opened
  // from is worse than a scan of a table with tens of rows in it.
  const [stats, catalog] = await Promise.all([statsByClinic(now), loadPlanCatalog()]);

  return toRecord(row, stats.get(clinicId) ?? NO_COUNTS, now, catalog);
}

/** The people who can sign in to one clinic. */
export type ClinicStaff = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  disabledAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
};

/** Who works at a clinic, for its detail screen. */
export async function listClinicStaff(clinicId: string): Promise<ClinicStaff[]> {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      disabledAt: user.disabledAt,
      lastSeenAt: sql<Date | null>`max(${sessionTable.updatedAt})`,
      createdAt: user.createdAt,
    })
    .from(user)
    .leftJoin(sessionTable, eq(sessionTable.userId, user.id))
    .where(and(eq(user.clinicId, clinicId), eq(user.role, 'staff')))
    .groupBy(user.id)
    .orderBy(asc(user.createdAt));
}

/** How many model calls one clinic has made, for its detail screen. */
export async function countClinicGenerations(clinicId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(weeklyPlanGenerations)
    .where(eq(weeklyPlanGenerations.clinicId, clinicId));

  return row?.total ?? 0;
}

/* ── Accounts ──────────────────────────────────────────────────────────────── */

/** An account as the platform lists it. */
export type AccountRecord = {
  id: string;
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
  disabledAt: Date | null;
  clinicId: string | null;
  clinicName: string | null;
  clinicSuspendedAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
};

export type AccountFilters = {
  query?: string;
  /** `admin` | `staff` | `client`, or undefined for every role. */
  role?: string;
  /** `active` | `disabled` | `unverified`, or undefined for every state. */
  status?: string;
  clinicId?: string;
  limit?: number;
  offset?: number;
};

/** How many accounts one page of the register holds. */
export const ACCOUNTS_PAGE_SIZE = 50;

/** The conditions a set of account filters comes to, shared by the list and its count. */
function accountConditions(filters: AccountFilters) {
  const term = filters.query?.trim();

  return [
    filters.role ? eq(user.role, filters.role) : undefined,
    filters.clinicId ? eq(user.clinicId, filters.clinicId) : undefined,
    filters.status === 'disabled' ? sql`${user.disabledAt} is not null` : undefined,
    filters.status === 'active' ? isNull(user.disabledAt) : undefined,
    filters.status === 'unverified'
      ? and(eq(user.emailVerified, false), eq(user.role, 'staff'))
      : undefined,
    term
      ? or(
          ilike(user.name, `%${escapeLike(term)}%`),
          ilike(user.email, `%${escapeLike(term)}%`),
        )
      : undefined,
  ].filter(Boolean);
}

/**
 * A page of accounts.
 *
 * **It is paginated, and the first version was not.** That read every account on
 * the deployment — including every patient, of whom a ten-dietitian practice has
 * hundreds — sorted them in JavaScript and rendered the lot. It was correct on a
 * development database with eight rows and would have been the slowest page in
 * the application on a real one.
 *
 * The ordering is `role, then newest`, expressed in SQL rather than sorted after
 * the fact: with a `limit` in play, ordering in JavaScript would sort whichever
 * fifty rows the database happened to return, which is not the same list.
 *
 * `escapeLike` on the search term: without it, searching for a name containing
 * `%` matches every account, because the term is interpolated into a `LIKE`
 * pattern. Not an injection — the value is still bound — but a search that
 * silently returns everything is one nobody can trust.
 */
export async function listAccounts(filters: AccountFilters = {}): Promise<AccountRecord[]> {
  const conditions = accountConditions(filters);

  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      disabledAt: user.disabledAt,
      clinicId: user.clinicId,
      clinicName: clinics.name,
      clinicSuspendedAt: clinics.suspendedAt,
      lastSeenAt: sql<Date | null>`max(${sessionTable.updatedAt})`,
      createdAt: user.createdAt,
    })
    .from(user)
    .leftJoin(clinics, eq(clinics.id, user.clinicId))
    .leftJoin(sessionTable, eq(sessionTable.userId, user.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(user.id, clinics.name, clinics.suspendedAt)
    /*
      Staff and admins before clients. They outnumber everyone — a deployment
      with 10 dietitians has hundreds of patients — and a register that opens on
      page one of patients never answers the question it was opened with.
      Excluding them would be worse: a disabled portal account is a real support
      case, and this is the only screen that can see one.
    */
    .orderBy(
      sql`case ${user.role} when 'admin' then 0 when 'staff' then 1 else 2 end`,
      desc(user.createdAt),
    )
    .limit(filters.limit ?? ACCOUNTS_PAGE_SIZE)
    .offset(filters.offset ?? 0);
}

/** How many accounts match, so the register can page rather than guess. */
export async function countAccounts(filters: AccountFilters = {}): Promise<number> {
  const conditions = accountConditions(filters);

  const [row] = await db
    .select({ total: count() })
    .from(user)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return row?.total ?? 0;
}

/** How many accounts hold the platform role, so the last one cannot be locked out. */
export async function countActiveAdmins(): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(user)
    .where(and(eq(user.role, 'admin'), isNull(user.disabledAt)));

  return row?.total ?? 0;
}

/* ── Overview ──────────────────────────────────────────────────────────────── */

/** A figure and what it was in the equally-long window before. */
export type Paired = { value: number; previous: number | null };

export type PlatformOverview = {
  clinics: { total: number; active: number; suspended: number; onboarding: number; joined: Paired };
  accounts: { staff: number; clients: number; admins: number; disabled: number; joined: Paired };
  plans: { total: number; published: number; created: Paired };
  generations: { runs: Paired; failed: Paired };
  appointments: { booked: Paired };
  whatsapp: { configured: number; connected: number };
  /** Signups per calendar month over the last six, for the chart. */
  signups: { key: string; value: number }[];
  /** Plans written per day across the period, for the chart. */
  planSeries: { key: string; value: number }[];
};

/**
 * Everything the overview states, in one function.
 *
 * ## Counted in the database, and in pairs
 *
 * Each table is one aggregate with `filter (where …)` clauses rather than a
 * `select *` counted in JavaScript, and each windowed figure is answered for the
 * current period and the one before it in the same pass. The previous half is
 * `null` when the range is `all`, because there is no period before all of
 * history — see `periodOf`.
 *
 * ## What is deliberately not here
 *
 * **Failed sign-ins.** The first version of this screen showed a tile counting
 * `auth_attempts` in the last 24 hours and calling them failed sign-ins. That
 * number could not be right: `recordAttempt` deletes every row older than the
 * longest rate-limit window — one hour — on each write, and `clearAttempts`
 * wipes an address's rows the moment it signs in successfully. The tile
 * therefore read near-zero during an attack that had ended an hour earlier. A
 * security figure that is structurally incapable of alarming is worse than no
 * figure, so it is gone rather than relabelled. Recording sign-in failures
 * durably is a real feature with a retention policy attached, and it belongs in
 * the auth layer that owns the table.
 */
export async function getPlatformOverview(period: Period): Promise<PlatformOverview> {
  const { start, end, previousStart, previousEnd } = period;

  /* A window pair as a `filter (where …)` fragment. `sql` interpolates the dates
     as bound parameters; the column name is bare because each aggregate below
     reads from exactly one table. */
  const inCurrent = start ? sql`created_at >= ${at(start)} and created_at < ${at(end)}` : sql`true`;
  const inPrevious =
    previousStart && previousEnd
      ? sql`created_at >= ${at(previousStart)} and created_at < ${at(previousEnd)}`
      : sql`false`;

  const [clinicRow, accountRow, planRow, genRow, apptRow, waRow, signupRows, planDays] =
    await Promise.all([
      db
        .select({
          total: sql<number>`count(*)::int`,
          suspended: sql<number>`(count(*) filter (where suspended_at is not null))::int`,
          onboarding: sql<number>`(count(*) filter (where suspended_at is null and onboarding_completed_at is null))::int`,
          joined: sql<number>`(count(*) filter (where ${inCurrent}))::int`,
          joinedPrevious: sql<number>`(count(*) filter (where ${inPrevious}))::int`,
        })
        .from(clinics),

      db
        .select({
          staff: sql<number>`(count(*) filter (where role = 'staff'))::int`,
          clients: sql<number>`(count(*) filter (where role = 'client'))::int`,
          admins: sql<number>`(count(*) filter (where role = 'admin'))::int`,
          disabled: sql<number>`(count(*) filter (where disabled_at is not null))::int`,
          joined: sql<number>`(count(*) filter (where ${inCurrent}))::int`,
          joinedPrevious: sql<number>`(count(*) filter (where ${inPrevious}))::int`,
        })
        .from(user),

      db
        .select({
          total: sql<number>`count(*)::int`,
          published: sql<number>`(count(*) filter (where status = 'published'))::int`,
          created: sql<number>`(count(*) filter (where ${inCurrent}))::int`,
          createdPrevious: sql<number>`(count(*) filter (where ${inPrevious}))::int`,
        })
        .from(weeklyPlans),

      db
        .select({
          runs: sql<number>`(count(*) filter (where ${inCurrent}))::int`,
          runsPrevious: sql<number>`(count(*) filter (where ${inPrevious}))::int`,
          failed: sql<number>`(count(*) filter (where status <> 'ok' and ${inCurrent}))::int`,
          failedPrevious: sql<number>`(count(*) filter (where status <> 'ok' and ${inPrevious}))::int`,
        })
        .from(weeklyPlanGenerations),

      db
        .select({
          booked: sql<number>`(count(*) filter (where ${inCurrent}))::int`,
          bookedPrevious: sql<number>`(count(*) filter (where ${inPrevious}))::int`,
        })
        .from(appointments),

      db
        .select({
          configured: sql<number>`count(*)::int`,
          connected: sql<number>`(count(*) filter (where status = 'connected'))::int`,
        })
        .from(whatsappSettings),

      db.select({ createdAt: clinics.createdAt }).from(clinics),

      db
        .select({ createdAt: weeklyPlans.createdAt })
        .from(weeklyPlans)
        .where(start ? gte(weeklyPlans.createdAt, start) : undefined),
    ]);

  /*
    Signups by calendar month, and plans by day, grouped in JavaScript rather
    than with `date_trunc`.

    The month boundaries have to be the ones `Intl` will label the axis with, not
    whatever time zone the database session happens to be in. Every other date on
    this deployment is displayed in `DISPLAY_TIME_ZONE`; a chart that silently
    used UTC would put a clinic that signed up late on the 31st into the wrong
    bar. Both reads are one column over a small table, so the transfer is cheap
    where the counts above would not have been.
  */
  const signups = bucketBy(signupRows, monthKeys(end, 6), (row) => monthKey(row.createdAt));
  const planSeries = bucketBy(
    planDays,
    start ? dayKeys(start, end) : dayKeys(new Date(end.getTime() - 29 * 86_400_000), end),
    (row) => dayKey(row.createdAt),
  );

  const paired = (value: number, previous: number): Paired => ({
    value,
    previous: previousStart ? previous : null,
  });

  const clinicTotals = clinicRow[0] ?? { total: 0, suspended: 0, onboarding: 0, joined: 0, joinedPrevious: 0 };
  const accounts = accountRow[0] ?? { staff: 0, clients: 0, admins: 0, disabled: 0, joined: 0, joinedPrevious: 0 };
  const plans = planRow[0] ?? { total: 0, published: 0, created: 0, createdPrevious: 0 };
  const gens = genRow[0] ?? { runs: 0, runsPrevious: 0, failed: 0, failedPrevious: 0 };
  const appts = apptRow[0] ?? { booked: 0, bookedPrevious: 0 };
  const wa = waRow[0] ?? { configured: 0, connected: 0 };

  return {
    clinics: {
      total: clinicTotals.total,
      suspended: clinicTotals.suspended,
      onboarding: clinicTotals.onboarding,
      active: clinicTotals.total - clinicTotals.suspended - clinicTotals.onboarding,
      joined: paired(clinicTotals.joined, clinicTotals.joinedPrevious),
    },
    accounts: {
      staff: accounts.staff,
      clients: accounts.clients,
      admins: accounts.admins,
      disabled: accounts.disabled,
      joined: paired(accounts.joined, accounts.joinedPrevious),
    },
    plans: {
      total: plans.total,
      published: plans.published,
      created: paired(plans.created, plans.createdPrevious),
    },
    generations: {
      runs: paired(gens.runs, gens.runsPrevious),
      failed: paired(gens.failed, gens.failedPrevious),
    },
    appointments: { booked: paired(appts.booked, appts.bookedPrevious) },
    whatsapp: { configured: wa.configured, connected: wa.connected },
    signups,
    planSeries,
  };
}

/* ── Search ────────────────────────────────────────────────────────────────── */

/** One thing the global search found. */
export type SearchHit = {
  kind: 'clinic' | 'account' | 'food';
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  /** A word the result list tints — a suspended clinic, a disabled account. */
  flag: 'suspended' | 'disabled' | 'inactive' | null;
};

/** The most hits of each kind one search returns. */
export const SEARCH_LIMIT = 8;

/**
 * One box that searches everything the platform can act on.
 *
 * ## Why this exists
 *
 * The panel had three search fields, each on a different screen and each scoped
 * to one table. An operator with an email address in front of them had to decide
 * first whether it belonged to a clinic, an account or neither — which is the
 * question they opened the panel to answer. Support work does not arrive
 * pre-sorted by table.
 *
 * Three reads rather than a `union`: the three tables have nothing in common to
 * union on, the shapes differ, and merging them in SQL would mean casting every
 * column to text to line them up. They run concurrently and each is capped, so
 * the cost is one round trip and at most 24 rows.
 *
 * Accounts search matches **email and name**, and clinics also match phone —
 * because a phone number is what a support message usually arrives with.
 */
export async function searchPlatform(query: string): Promise<SearchHit[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const like = `%${escapeLike(term)}%`;

  const [clinicRows, accountRows, foodRows] = await Promise.all([
    db
      .select({
        id: clinics.id,
        name: clinics.name,
        phone: clinics.phone,
        contactEmail: clinics.contactEmail,
        suspendedAt: clinics.suspendedAt,
      })
      .from(clinics)
      .where(
        or(
          ilike(clinics.name, like),
          ilike(clinics.phone, like),
          ilike(clinics.contactEmail, like),
        ),
      )
      .limit(SEARCH_LIMIT),

    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        disabledAt: user.disabledAt,
      })
      .from(user)
      .where(or(ilike(user.name, like), ilike(user.email, like)))
      .limit(SEARCH_LIMIT),

    db
      .select({
        id: catalogFoods.id,
        nameAr: catalogFoods.nameAr,
        nameEn: catalogFoods.nameEn,
        isActive: catalogFoods.isActive,
      })
      .from(catalogFoods)
      .where(
        and(
          // Shared foods only. A clinic's own private food is that clinic's
          // business, and the platform has no screen that can edit one.
          isNull(catalogFoods.clinicId),
          or(ilike(catalogFoods.nameAr, like), ilike(catalogFoods.nameEn, like)),
        ),
      )
      .limit(SEARCH_LIMIT),
  ]);

  return [
    ...clinicRows.map(
      (row): SearchHit => ({
        kind: 'clinic',
        id: row.id,
        title: row.name,
        subtitle: row.contactEmail ?? row.phone,
        href: `/admin/clinics/${row.id}`,
        flag: row.suspendedAt ? 'suspended' : null,
      }),
    ),
    ...accountRows.map(
      (row): SearchHit => ({
        kind: 'account',
        id: row.id,
        title: row.name,
        subtitle: row.email,
        href: `/admin/accounts?q=${encodeURIComponent(row.email)}`,
        flag: row.disabledAt ? 'disabled' : null,
      }),
    ),
    ...foodRows.map(
      (row): SearchHit => ({
        kind: 'food',
        id: row.id,
        title: row.nameAr,
        subtitle: row.nameEn,
        href: `/admin/catalog/${row.id}`,
        flag: row.isActive ? null : 'inactive',
      }),
    ),
  ];
}

/* ── Revenue ───────────────────────────────────────────────────────────────── */

/** What the platform earns, and from whom. */
export type RevenueSummary = {
  /** Rows the MRR arithmetic runs over. Kept whole so the pure functions can total them. */
  clinics: { id: string; name: string; plan: string; planPriceMinor: number | null; suspendedAt: Date | null }[];
  /** Clinics whose `plan` is a string this build does not know — drift worth seeing. */
  unknownPlans: string[];
};

/**
 * Every clinic's plan and price, for the revenue figures.
 *
 * A read of five columns rather than an aggregate, because the arithmetic — MRR,
 * average, the per-tier breakdown — lives in `plans.ts` as pure functions that
 * can be asserted without a database. The set is one row per clinic, which is
 * the smallest table on the deployment.
 */
export async function getRevenue(): Promise<RevenueSummary> {
  const rows = await db
    .select({
      id: clinics.id,
      name: clinics.name,
      plan: clinics.plan,
      planPriceMinor: clinics.planPriceMinor,
      suspendedAt: clinics.suspendedAt,
    })
    .from(clinics);

  const catalog = await loadPlanCatalog();
  const unknown = [
    ...new Set(rows.filter((row) => !isKnownPlan(catalog, row.plan)).map((row) => row.plan)),
  ];

  return { clinics: rows, unknownPlans: unknown.sort() };
}

/** Names for a set of clinic ids, for a screen that has ids and needs labels. */
export async function clinicNames(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const rows = await db
    .select({ id: clinics.id, name: clinics.name })
    .from(clinics)
    .where(inArray(clinics.id, [...ids]));

  return new Map(rows.map((row) => [row.id, row.name]));
}
