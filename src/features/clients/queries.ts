import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';

import { db } from '@/db';
import { clientNutritionProfiles, clients, weeklyPlans, type Client } from '@/db/schema';
import { type PlanStatus } from '@/features/weekly-plans/schema';

import { DEFAULT_MEAL_SCHEDULE, mealScheduleSchema } from './nutrition';
import { normalizeForSearch } from './search';
import { clientSeq } from './seq';
import { clientIdSchema, type ListClientsInput } from './schema';
import { type ClientIntakeValues, type MealSlotValues } from './types';

/**
 * Reads for the clients feature. Imports nothing from Next.js so that the tests
 * can call these directly — see the note at the top of `mutations.ts`.
 */

export const CLIENTS_PAGE_SIZE = 20;

export type ClientListItem = {
  id: string;
  fullName: string;
  phone: string | null;
  /**
   * `YYYY-MM-DD`, for the age the register shows.
   *
   * The date rather than a computed age, for the same reason the dashboard's
   * register card takes it: an age is a number about *today*, and computing it
   * in the query would cache a value that is wrong the morning after someone's
   * birthday.
   */
  dateOfBirth: string | null;
  hasPortalAccess: boolean;
  /**
   * The client's stored avatar colour, for the initials disc in the register's
   * first column.
   *
   * Read from the row rather than derived from the name here, for the reason
   * `src/lib/avatar-color.ts` records: renaming a client must not change the
   * colour staff have learned to recognise them by. It is the same value the
   * calendar and the planner rail already show them in.
   */
  color: string;
  /**
   * The status of this client's most recent plan that still stands, or `null`
   * for a client who has none.
   *
   * The *latest* plan rather than "a published plan exists": what the register
   * answers is "where does this person stand right now", and a client whose
   * newest week is still a draft is in a different position from one whose
   * newest week is live — even if both have a published plan somewhere in their
   * history.
   *
   * Archived is not among the answers, which is why this is narrower than
   * `PlanStatus`. See {@link latestPlanStatuses}.
   */
  latestPlanStatus: LivePlanStatus | null;
};

/**
 * A plan status the register can report: everything a plan can be except
 * archived, which {@link latestPlanStatuses} filters out before ranking.
 *
 * Narrowed rather than reusing `PlanStatus` so the badge that renders this has
 * a case for every value it can receive, instead of an `archived` that would
 * fall through to whatever its last branch happens to be.
 */
export type LivePlanStatus = Exclude<PlanStatus, 'archived'>;

export type ClientListResult = {
  items: ClientListItem[];
  total: number;
  page: number;
  pageCount: number;
};

export type ClientDetail = Client & {
  hasPortalAccess: boolean;
  /**
   * The client's position in their clinic — what their colour is derived from.
   * See `./seq`, and `patientHue` for what the record's header does with it.
   */
  seq: number;
};

/**
 * The one column the reader chose to filter on, if any.
 *
 * `status` is not here, and is no longer a filter at all — it is a property of
 * *which page you are on*, and it arrives on `input.status`. A column with no
 * value filters nothing: the popover can be opened and a column picked without
 * a term typed yet, and that state should show the register, not an empty one.
 */
function filterCondition(input: ListClientsInput): SQL | undefined {
  const value = input.filterValue;
  if (!value) return undefined;

  switch (input.filterBy) {
    // Matched as typed, like the register renders them: a phone number and an
    // email address have no folded copy to search, and both are read
    // left-to-right whatever the page's direction is.
    case 'phone':
      return ilike(clients.phone, `%${value}%`);
    case 'email':
      return ilike(clients.email, `%${value}%`);
    // Not a column — `userId IS NOT NULL`, exactly what the list renders in
    // that cell and what `SORT_COLUMNS` orders it by.
    case 'portalAccess':
      return value === 'yes'
        ? isNotNull(clients.userId)
        : value === 'no'
          ? isNull(clients.userId)
          : undefined;
    default:
      return undefined;
  }
}

/**
 * Every read is scoped to one clinic.
 *
 * `clinicId` is a required first argument rather than an optional filter so that
 * forgetting it is a type error, not a silent cross-tenant leak.
 */
function buildFilter(clinicId: string, input: ListClientsInput): SQL | undefined {
  const conditions: SQL[] = [eq(clients.clinicId, clinicId), eq(clients.status, input.status)];

  if (input.q) {
    /*
      **The search field is the name column, and only the name column.** It
      used to also match phone and email, which made one field mean three
      things: typing "05" returned every client whose number contains it and
      whoever happens to have "05" in their address, and there was no way to
      say which you meant. Those two are columns you *filter* on now — see
      `filterCondition` — and this is the one you search.

      Matched against the normalised column using the same folding applied when
      the name was stored, so "احمد" finds "أحمد".
    */
    conditions.push(ilike(clients.searchName, `%${normalizeForSearch(input.q)}%`));
  }

  const filter = filterCondition(input);
  if (filter) conditions.push(filter);

  return and(...conditions);
}

/**
 * Sort key → the column it actually orders by.
 *
 * A lookup rather than a dynamic column reference: the key is validated by
 * `listClientsSchema` before it gets here, and this keeps the set of orderable
 * columns readable in one place.
 *
 * `fullName` sorts on `searchName`, the folded copy the search already matches
 * against — sorting on the raw name would order "آدم" by its diacritics and put
 * an unaccented duplicate somewhere else entirely.
 *
 * `portalAccess` is not a column; it is `userId IS NOT NULL`, which is exactly
 * what the list renders.
 */
const SORT_COLUMNS: Record<ListClientsInput['sort'], AnyColumn | SQL> = {
  fullName: clients.searchName,
  phone: clients.phone,
  /** Ordered by the date behind it; see `INVERTED_SORTS` for the direction. */
  age: clients.dateOfBirth,
  portalAccess: sql`(${clients.userId} is not null)`,
  createdAt: clients.createdAt,
};

/**
 * Nullable columns are pushed to the end in **both** directions. A blank is not
 * "smallest"; it is missing, and a reader flipping the direction to find the As
 * is not asking to be shown eleven dashes first.
 */
const NULLABLE_SORTS = new Set<ListClientsInput['sort']>(['phone', 'age']);

/**
 * Sorts whose column runs the opposite way to the value on screen.
 *
 * Age is the only one: the *oldest* client has the *earliest* date of birth, so
 * ascending age is descending date. Flipped here rather than at the call site,
 * so the header's arrow means the same thing on this column as on every other.
 */
const INVERTED_SORTS = new Set<ListClientsInput['sort']>(['age']);

function buildOrder(input: ListClientsInput): SQL[] {
  const column = SORT_COLUMNS[input.sort];
  const ascending = INVERTED_SORTS.has(input.sort) ? input.dir === 'desc' : input.dir === 'asc';
  const direction = ascending ? asc : desc;

  const order: SQL[] = [];
  if (NULLABLE_SORTS.has(input.sort)) order.push(sql`${column} is null`);
  order.push(direction(column));

  // A stable tiebreak, so two clients registered with the same status (or the
  // same missing phone number) do not swap places between page loads.
  if (input.sort !== 'createdAt') order.push(desc(clients.createdAt));

  return order;
}

export async function listClients(clinicId: string, input: ListClientsInput): Promise<ClientListResult> {
  const where = buildFilter(clinicId, input);

  const [totals] = await db.select({ value: count() }).from(clients).where(where);
  const total = totals?.value ?? 0;

  const rows = await db
    .select({
      id: clients.id,
      fullName: clients.fullName,
      phone: clients.phone,
      dateOfBirth: clients.dateOfBirth,
      userId: clients.userId,
      color: clients.color,
    })
    .from(clients)
    .where(where)
    .orderBy(...buildOrder(input))
    .limit(CLIENTS_PAGE_SIZE)
    .offset((input.page - 1) * CLIENTS_PAGE_SIZE);

  const latestPlanByClient = await latestPlanStatuses(
    clinicId,
    rows.map((row) => row.id),
  );

  return {
    items: rows.map(({ userId, ...rest }) => ({
      ...rest,
      hasPortalAccess: userId !== null,
      latestPlanStatus: latestPlanByClient.get(rest.id) ?? null,
    })),
    total,
    page: input.page,
    pageCount: Math.max(1, Math.ceil(total / CLIENTS_PAGE_SIZE)),
  };
}

/**
 * The newest plan's status for each of the given clients.
 *
 * A second query rather than a join onto the page above, for two reasons. A
 * `LEFT JOIN` against `weekly_plans` multiplies the client rows by their plan
 * history before anything can pick the newest one, which breaks both the
 * `LIMIT` and the `count()` the pager runs on. And `DISTINCT ON` — PostgreSQL's
 * own "first row of each group" — cannot be expressed as a joined subquery
 * through Drizzle without the aliased aggregate coming out unqualified; the
 * planner rail hit exactly that and settled on the same shape (see
 * `listPlannableClients`).
 *
 * Scoped to the ids actually on screen rather than to the whole clinic, so a
 * register of two thousand clients still reads at most twenty plans. Still
 * filtered by `clinicId` as well: an id list is not a tenancy check, and every
 * read in this app carries one.
 *
 * Archived plans are excluded rather than ranked. An archived plan is one that
 * publishing superseded, so it never describes where a client stands — and
 * including them makes the answer unstable as well as wrong. `publishPlan`
 * archives the outgoing plan and publishes the incoming one in a single
 * transaction, calling `new Date()` for each; in a fast transaction both land on
 * the same millisecond, and two rows sharing a week and a timestamp leave the
 * `ORDER BY` below with nothing to separate them. The register would then report
 * "no plan" for a client whose plan is live, depending on which row PostgreSQL
 * happened to reach first. Filtering them out settles it at the source.
 *
 * The `ORDER BY` must lead with the `DISTINCT ON` expression; what follows is
 * what decides which row wins — newest week first, then the most recently
 * touched plan within that week.
 */
async function latestPlanStatuses(
  clinicId: string,
  clientIds: string[],
): Promise<Map<string, LivePlanStatus>> {
  if (clientIds.length === 0) return new Map();

  const rows = await db
    .selectDistinctOn([weeklyPlans.clientId], {
      clientId: weeklyPlans.clientId,
      status: weeklyPlans.status,
    })
    .from(weeklyPlans)
    .where(
      and(
        eq(weeklyPlans.clinicId, clinicId),
        inArray(weeklyPlans.clientId, clientIds),
        ne(weeklyPlans.status, 'archived'),
      ),
    )
    .orderBy(
      asc(weeklyPlans.clientId),
      desc(weeklyPlans.weekStartDate),
      desc(weeklyPlans.updatedAt),
    );

  return new Map(rows.map((row) => [row.clientId, row.status as LivePlanStatus]));
}

/**
 * Validates the id before querying, so a malformed route param becomes a 404
 * rather than a PostgreSQL error on the failed uuid cast.
 *
 * A client belonging to another clinic returns null — indistinguishable from a
 * client that does not exist, which is deliberate: a different response would
 * confirm the id is real to someone guessing.
 */
export async function getClient(clinicId: string, id: string): Promise<ClientDetail | null> {
  const parsed = clientIdSchema.safeParse(id);
  if (!parsed.success) return null;

  // Every column, plus the position the record's colour comes from. Spelled out
  // with `getTableColumns` because a bare `select()` cannot carry an extra
  // expression alongside the row.
  const [row] = await db
    .select({ ...getTableColumns(clients), seq: clientSeq })
    .from(clients)
    .where(and(eq(clients.id, parsed.data), eq(clients.clinicId, clinicId)))
    .limit(1);

  if (!row) return null;

  return { ...row, hasPortalAccess: row.userId !== null };
}

/**
 * Reads the stored schedule, falling back to the default.
 *
 * Validated on read and not only on write: `meal_schedule` is jsonb, so a
 * hand-edited row or a schema change could otherwise put a malformed slot into
 * a form and crash the render. A bad value degrades to the default rather than
 * throwing.
 */
function readMealSchedule(value: MealSlotValues[] | null): MealSlotValues[] {
  if (!value) return DEFAULT_MEAL_SCHEDULE;
  const parsed = mealScheduleSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_MEAL_SCHEDULE;
}

/**
 * One client's whole intake, across both tables, for the dialog that writes it.
 *
 * A left join and not two reads: the profile row does not exist until the first
 * save, and a client with no profile is the ordinary case rather than an error.
 * Everything comes back with the defaults the form would have offered anyway, so
 * a first-time intake and a fifth edit render through the same code path.
 *
 * Null for a client of another clinic — indistinguishable from one that does
 * not exist, the same rule `getClient` follows.
 */
export async function getClientIntake(
  clinicId: string,
  id: string,
): Promise<ClientIntakeValues | null> {
  const parsed = clientIdSchema.safeParse(id);
  if (!parsed.success) return null;

  const [row] = await db
    .select({
      clientId: clients.id,
      fullName: clients.fullName,
      dateOfBirth: clients.dateOfBirth,
      sex: clients.sex,
      heightCm: clients.heightCm,
      goal: clients.goal,
      activityLevel: clients.activityLevel,
      allergies: clients.allergies,
      conditions: clients.conditions,
      medications: clients.medications,
      medicalNotes: clients.medicalNotes,
      notes: clients.notes,
      profileId: clientNutritionProfiles.id,
      weightKg: clientNutritionProfiles.weightKg,
      dailyKcalTarget: clientNutritionProfiles.dailyKcalTarget,
      proteinTargetGrams: clientNutritionProfiles.proteinTargetGrams,
      allergenTags: clientNutritionProfiles.allergenTags,
      customAllergens: clientNutritionProfiles.customAllergens,
      preferences: clientNutritionProfiles.preferences,
      dislikes: clientNutritionProfiles.dislikes,
      permanentInstructions: clientNutritionProfiles.permanentInstructions,
      mealSchedule: clientNutritionProfiles.mealSchedule,
    })
    .from(clients)
    .leftJoin(clientNutritionProfiles, eq(clientNutritionProfiles.clientId, clients.id))
    .where(and(eq(clients.id, parsed.data), eq(clients.clinicId, clinicId)))
    .limit(1);

  if (!row) return null;

  return {
    clientId: row.clientId,
    fullName: row.fullName,
    dateOfBirth: row.dateOfBirth,
    sex: row.sex,
    heightCm: row.heightCm,
    goal: row.goal,
    activityLevel: row.activityLevel,
    allergies: row.allergies,
    conditions: row.conditions,
    medications: row.medications,
    medicalNotes: row.medicalNotes,
    notes: row.notes,
    weightKg: row.weightKg,
    dailyKcalTarget: row.dailyKcalTarget,
    proteinTargetGrams: row.proteinTargetGrams,
    allergenTags: row.allergenTags ?? [],
    customAllergens: row.customAllergens ?? [],
    preferences: row.preferences,
    dislikes: row.dislikes,
    permanentInstructions: row.permanentInstructions,
    mealSchedule: readMealSchedule(row.mealSchedule),
    hasProfile: row.profileId !== null,
  };
}
