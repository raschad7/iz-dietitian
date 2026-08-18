import {
  and,
  asc,
  between,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';

import { db } from '@/db';
import {
  clientNutritionProfiles,
  clientPlanAdherence,
  clients,
  weeklyPlans,
  type Client,
} from '@/db/schema';
import { wallClockIn } from '@/features/booking/completed';
import { summariseAdherenceRun, type AdherenceRow } from '@/features/portal/adherence';
import { type PlanStatus } from '@/features/weekly-plans/schema';
// The plan's own seven dates from its `week_start_date` — NOT
// `portal/check-ins`'s `weekDates`, which is the Sunday-first calendar week.
// See `weeklyProgressByClient`.
import { weekDates as planDates } from '@/features/weekly-plans/week';
import { DISPLAY_TIME_ZONE } from '@/lib/format';

import { DEFAULT_MEAL_SCHEDULE, mealScheduleSchema } from './nutrition';
import { normalizeForSearch } from './search';
import { clientSeq } from './seq';
import {
  clientIdSchema,
  WEEKLY_PROGRESS_VALUES,
  type ListClientsInput,
  type WeeklyProgressFilterValue,
} from './schema';
import { type ClientIntakeValues, type MealSlotValues } from './types';

/**
 * Reads for the clients feature. Imports nothing from Next.js so that the tests
 * can call these directly — see the note at the top of `mutations.ts`.
 */

/**
 * How many clients one page of the register holds.
 *
 * Nine, and the number is a layout decision as much as a query one: nine rows
 * plus the title, the search row and the pager fits a laptop screen without the
 * list needing a scrollbar of its own. It was twenty, which never did — so the
 * register carried a bounded, independently scrolling table, and "where am I in
 * this list" was a question the page could not answer without being scrolled.
 * The pager answers it now, and it is the only way through the register.
 *
 * This doc is the only place the figure is written out. The page and the table
 * that depend on it describe the *constraint* — a register that fits the screen
 * — and name the constant rather than repeating its value, because a comment
 * three files away saying "ten" is one nobody edits when this line changes.
 *
 * Read by `listClients` for the `LIMIT`/`OFFSET` and the page count, and by
 * `ClientPagination` for the arithmetic behind the page numbers. One constant,
 * so the pager and the query cannot disagree.
 */
export const CLIENTS_PAGE_SIZE = 9;

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
   * The client's position in their clinic — what the register's avatar disc is
   * coloured from, through `patientHue`.
   *
   * Not `clients.color`, the stored hex. That column came from a fixed
   * ten-colour palette with a grey default behind it, so the register drew a
   * patient in a colour that was either shared with somebody else, or nobody's
   * at all, while the calendar drew the same patient in a hue that was
   * genuinely theirs. The register is the list you pick a person *out of*; a
   * disc that changes colour on the way to their appointment is worse there
   * than anywhere. See `./seq`.
   */
  seq: number;
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
  /**
   * How closely this client has followed the plan they are currently on, over
   * that plan's own period — or `null` when no published plan covers today.
   *
   * See {@link ClientWeeklyProgress} and {@link weeklyProgressByClient}.
   */
  weeklyProgress: ClientWeeklyProgress | null;
};

/**
 * A client's adherence across **their own current plan period**.
 *
 * ## The period is the plan's, not the calendar's
 *
 * `weekly_plans.week_start_date` may fall on any weekday, and two clients of
 * the same clinic routinely sit on periods that begin days apart. So this is
 * measured over the seven dates of the plan the client is actually on, and it
 * rolls over when *that* plan period ends — not at midnight on Saturday.
 *
 * This is deliberately not what the portal's progress tab shows. That screen
 * summarises the calendar week `today` falls in, which is the right frame for
 * "how has my week been going" on a client's own phone. The register is
 * answering a different question — "is this person keeping to the plan I gave
 * them" — and the plan is the only sensible frame for it. Both come from
 * `summariseAdherenceRun` in `portal/adherence.ts`; they differ in the dates
 * they hand it, and in nothing else.
 *
 * ## Not a second definition of progress
 *
 * Every field here comes straight off that one summary. The register keeps
 * three of its four and drops the seven-day strip, which is a screen's worth of
 * detail and this is a table cell.
 */
export type ClientWeeklyProgress = {
  /**
   * The first date of the plan period this describes — the plan's own
   * `week_start_date`.
   *
   * Carried up so the cell can say which period it is reporting on, and so a
   * reader debugging a surprising figure can see the window it was taken over
   * without opening the plan.
   */
  periodStartDate: string;
  /**
   * How many days the period runs — the plan's own length, the denominator
   * behind "5 / 7 days".
   *
   * Read off the plan's dates rather than hardcoded to seven, so a plan whose
   * `week_start_date` cannot be parsed yields an empty period instead of a cell
   * claiming a seven-day denominator it never had.
   */
  periodDays: number;
  /**
   * Mean of each reported day's own `completed ÷ total`, across the period's
   * days up to and including today. `null` when nothing is recorded yet.
   *
   * Null rather than zero: a period nobody has reported on has *no* figure, and
   * a 0% would accuse someone of ignoring a plan they may well be following.
   */
  averageFraction: number | null;
  /**
   * Days of the period carrying a report — the sample the average was taken
   * over.
   *
   * Worth keeping distinct from {@link fullyCompletedCount}: a day reported as
   * `missed` is recorded but not completed, and the two counts answer different
   * questions.
   */
  recordedCount: number;
  /**
   * Days of the period where every planned meal was ticked — what the cell's
   * "5 / 7 days" counts.
   *
   * The stricter of the two counts, and the one a dietitian actually scans for:
   * a day kept in full is the unit of a plan being followed.
   */
  fullyCompletedCount: number;
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
    /*
      Not a column — `userId IS NOT NULL`, exactly what the list renders in that
      cell and what `SORT_COLUMNS` orders it by.

      `phone` and `email` were `ilike` substring matches beside it and went with
      their entries in `CLIENT_FILTERS`; `default` is what a stale link carrying
      one of them lands on.

      ⚠ `weeklyProgress` is deliberately **not** a case here. It cannot be
      expressed as a condition on `clients` at all — it is an average over
      adherence rows inside each client's own plan period — so it is resolved
      into an id set first and handed to `buildFilter` as an extra condition.
      See {@link weeklyProgressCondition}.
    */
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
function buildFilter(
  clinicId: string,
  input: ListClientsInput,
  /**
   * The `weeklyProgress` filter, already resolved to a condition over
   * `clients.id` — see {@link weeklyProgressCondition}. Passed in rather than
   * computed here because resolving it takes two reads, and this function is
   * synchronous by design: it is what both the `count()` and the page query are
   * built from, and they must be built from exactly the same thing.
   */
  progress?: SQL,
): SQL | undefined {
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

  if (progress) conditions.push(progress);

  return and(...conditions);
}

/**
 * The `weeklyProgress` filter, as a condition over `clients.id`.
 *
 * ## Why it is an id set and not a join
 *
 * "Where does this client stand in the plan period they are currently on" is not
 * a column. It is: the newest published plan whose own seven dates contain
 * today, then the adherence rows inside those dates, then a summary of them —
 * three tables and a rule about which plan counts, none of which survives being
 * folded into a `WHERE` that also has to carry a `count()` and a `LIMIT`.
 *
 * So the period side is answered first, for the whole clinic, and the answer is
 * a list of ids. {@link weeklyProgressByClient} is the same reader the register's
 * own progress column uses — called with `null` for "every client in this
 * clinic" rather than a page of ids — so the filter cannot decide a client is
 * behind while the cell beside their name says otherwise.
 *
 * ## The cost, stated plainly
 *
 * Two extra reads whenever this filter is on, both scoped to the clinic and both
 * bounded by the clients who are *on a plan right now* rather than by the
 * register's size: the plan read returns published plans for the clinic, and the
 * adherence read spans the fortnight those periods can straddle. A clinic whose
 * whole register is on a live plan pays for its whole register; that is the
 * honest ceiling, and it is the same shape of read the page already makes for
 * nine rows.
 *
 * ## `noPlan` is the complement, not a lookup
 *
 * There is no set of "clients without a current period" to select — it is every
 * client the period read did not return, which is what `notInArray` says. With
 * nothing on a plan at all it degrades to no condition, so the register shows
 * everyone: correct, because with no periods anywhere every client is a client
 * with no period.
 */
async function weeklyProgressCondition(
  clinicId: string,
  input: ListClientsInput,
  today: string,
): Promise<SQL | undefined> {
  if (input.filterBy !== 'weeklyProgress') return undefined;

  const value = input.filterValue;
  // A stale or hand-edited value filters nothing, the same way an unknown
  // `filterBy` does — see `filterCondition`'s `default`.
  if (!isWeeklyProgressValue(value)) return undefined;

  const progressByClient = await weeklyProgressByClient(clinicId, null, today);

  if (value === 'noPlan') {
    const onAPlan = [...progressByClient.keys()];
    return onAPlan.length === 0 ? undefined : notInArray(clients.id, onAPlan);
  }

  const wanted = [...progressByClient]
    // `recordedCount` is days carrying a report, which is exactly "has this
    // person logged anything in this period" — a day reported as `missed` is
    // still a day they answered on.
    .filter(([, progress]) => (value === 'reported' ? progress.recordedCount > 0 : progress.recordedCount === 0))
    .map(([id]) => id);

  // No client matches, rather than "no filter": an empty result is the truthful
  // answer to "who has reported nothing" when everyone has.
  return wanted.length === 0 ? sql`false` : inArray(clients.id, wanted);
}

function isWeeklyProgressValue(value: string | undefined): value is WeeklyProgressFilterValue {
  return WEEKLY_PROGRESS_VALUES.includes(value as WeeklyProgressFilterValue);
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

/**
 * `today` is a parameter with a default rather than a clock read inside the
 * body, following the rule `adherence.ts` sets out at length: everything
 * time-dependent arrives as the clinic's own wall-clock date, so a test can
 * pin a Wednesday and two readers of the same week cannot disagree about which
 * day it is. The default is the clinic's zone, not the server's — the register
 * is a clinic-local view of a clinic-local week.
 */
export async function listClients(
  clinicId: string,
  input: ListClientsInput,
  today: string = wallClockIn(DISPLAY_TIME_ZONE).date,
): Promise<ClientListResult> {
  // Before the `count()`, because the pager counts the filtered register.
  const progress = await weeklyProgressCondition(clinicId, input, today);

  const where = buildFilter(clinicId, input, progress);

  const [totals] = await db.select({ value: count() }).from(clients).where(where);
  const total = totals?.value ?? 0;

  const rows = await db
    .select({
      id: clients.id,
      fullName: clients.fullName,
      phone: clients.phone,
      dateOfBirth: clients.dateOfBirth,
      userId: clients.userId,
      seq: clientSeq,
    })
    .from(clients)
    .where(where)
    .orderBy(...buildOrder(input))
    .limit(CLIENTS_PAGE_SIZE)
    .offset((input.page - 1) * CLIENTS_PAGE_SIZE);

  const clientIds = rows.map((row) => row.id);

  // Two independent lookups over the same page of ids, so they go together
  // rather than one after the other. Neither depends on the other's result.
  const [latestPlanByClient, weeklyProgressByClientId] = await Promise.all([
    latestPlanStatuses(clinicId, clientIds),
    weeklyProgressByClient(clinicId, clientIds, today),
  ]);

  return {
    items: rows.map(({ userId, ...rest }) => ({
      ...rest,
      hasPortalAccess: userId !== null,
      latestPlanStatus: latestPlanByClient.get(rest.id) ?? null,
      // Absent from the map means no published plan covers today — a client
      // with no current period at all, which the cell draws differently from a
      // period nobody has reported on yet.
      weeklyProgress: weeklyProgressByClientId.get(rest.id) ?? null,
    })),
    total,
    page: input.page,
    pageCount: Math.max(1, Math.ceil(total / CLIENTS_PAGE_SIZE)),
  };
}

/**
 * Each client's adherence across the plan period they are currently on, in two
 * reads for the whole page.
 *
 * ## The period is the plan's own, and that is the point
 *
 * ⚠ **`planDates` here is `weekly-plans/week.ts`, not `portal/check-ins.ts`.**
 * The two export the same name and mean different things: the check-ins one
 * returns the Sunday-first calendar week around a date, the plan one walks the
 * plan's own seven days from its `week_start_date`. This column was briefly
 * built on the first, which reset every client's figure at midnight on Saturday
 * regardless of when their plan actually began — wrong for every client whose
 * plan does not start on a Sunday, which is most of them.
 *
 * **Which plan is "current" is not decided here.** A plan is the current one
 * when its own seven dates include `today` — the rule
 * `weekly-plans/queries.ts:getPublishedBoard` states and
 * `getPublishedPlanWeekStart` repeats, with a warning on it that the two must
 * move together. This is the third reader of that rule and it applies it
 * unchanged, through the same `weekDates` helper, so the register cannot decide
 * a client is on a plan their portal is not showing them.
 *
 * `published` only, and for a concrete reason rather than symmetry:
 * `toggleMealCompletion` refuses to tick a meal whose plan is not published, so
 * a draft is a period the client has no way to report against. A client whose
 * only plan is a draft has no current period, which is what `latestPlanStatus`
 * is already telling the reader one column over.
 *
 * ## Why two reads and not one join
 *
 * Same construction and same reasoning as {@link latestPlanStatuses} above: a
 * `LEFT JOIN` onto the paged query would multiply each client row by their plan
 * history and then by up to seven adherence days, breaking both the `LIMIT` and
 * the pager's `count()`.
 *
 * The adherence read spans one range covering every client's period rather than
 * one query per client. Periods all contain `today` and run seven days, so the
 * union can only ever be about thirteen days wide however many clients are on
 * screen, and each client's rows are then filtered to their own dates before
 * being summarised. At most `CLIENTS_PAGE_SIZE` × 7 rows matter; the table's
 * `(clinic_id, date)` index covers the span and the id list narrows it further.
 *
 * Both reads are scoped by `clinicId` as well as by id — an id list is not a
 * tenancy check, the same rule every read in this file follows.
 *
 * ## Why the arithmetic is not recomputed here
 *
 * Grouping is all this does. The summary is {@link summariseAdherenceRun}'s,
 * from the portal feature that owns it, which already handles sparse rows, rows
 * out of order, rows outside the period, and future days that must not drag the
 * average down. A second implementation would be a second set of those
 * decisions to keep in step.
 */
async function weeklyProgressByClient(
  clinicId: string,
  /**
   * The page of clients to answer for — or `null` for every client in the
   * clinic, which is what {@link weeklyProgressCondition} needs: a filter has to
   * know who matches before the page is chosen, not after.
   *
   * `null` rather than an omitted argument, so "the whole clinic" has to be
   * asked for in as many characters as a page of ids does. This read is scoped
   * by `clinicId` either way — an id list was never the tenancy check.
   */
  clientIds: string[] | null,
  today: string,
): Promise<Map<string, ClientWeeklyProgress>> {
  if (clientIds?.length === 0) return new Map();

  // Newest period first, so the covering scan below settles on the most recent
  // plan in the vanishingly rare case that two published plans both contain
  // today — the same ordering, for the same reason, as the two portal readers.
  const planRows = await db
    .select({ clientId: weeklyPlans.clientId, weekStartDate: weeklyPlans.weekStartDate })
    .from(weeklyPlans)
    .where(
      and(
        eq(weeklyPlans.clinicId, clinicId),
        clientIds ? inArray(weeklyPlans.clientId, clientIds) : undefined,
        eq(weeklyPlans.status, 'published'),
      ),
    )
    .orderBy(desc(weeklyPlans.weekStartDate));

  /** Each client's current period, as the dates it actually covers. */
  const periodByClient = new Map<string, string[]>();

  for (const plan of planRows) {
    if (periodByClient.has(plan.clientId)) continue;

    const dates = planDates(plan.weekStartDate);
    // The covering rule. An unparseable `week_start_date` yields no dates and
    // so covers nothing, which is the safe direction: no period beats a period
    // running from a date nobody can put on a calendar.
    if (dates.includes(today)) periodByClient.set(plan.clientId, dates);
  }

  if (periodByClient.size === 0) return new Map();

  // One span wide enough for every period on this page. They all contain
  // `today`, so this stays within about a fortnight no matter how the periods
  // are staggered against each other.
  const allDates = [...periodByClient.values()].flat().sort();
  const from = allDates[0] ?? today;
  const to = allDates[allDates.length - 1] ?? today;

  const rows = await db
    .select({
      clientId: clientPlanAdherence.clientId,
      date: clientPlanAdherence.date,
      level: clientPlanAdherence.level,
      // The counts are the measure — every percentage downstream divides one by
      // the other. `level` rides along because `AdherenceRow` carries it.
      completedMeals: clientPlanAdherence.completedMeals,
      totalMeals: clientPlanAdherence.totalMeals,
    })
    .from(clientPlanAdherence)
    .where(
      and(
        eq(clientPlanAdherence.clinicId, clinicId),
        inArray(clientPlanAdherence.clientId, [...periodByClient.keys()]),
        between(clientPlanAdherence.date, from, to),
      ),
    );

  const byClient = new Map<string, AdherenceRow[]>();

  for (const { clientId, ...row } of rows) {
    // `level` is plain `text` behind a check constraint, so the union is
    // reasserted on the way out rather than trusted from the driver's `string`
    // — the same cast `listPlanAdherence` makes for the same reason.
    const adherenceRow: AdherenceRow = { ...row, level: row.level as AdherenceRow['level'] };

    const bucket = byClient.get(clientId);
    if (bucket) bucket.push(adherenceRow);
    else byClient.set(clientId, [adherenceRow]);
  }

  // Keyed off the clients that have a period, so a client with one but nothing
  // reported in it still gets an entry — "no data yet in this period" and "no
  // period at all" are different cells, and only the second is a missing key.
  //
  // The rows handed over are the whole span; `summariseAdherenceRun` reads only
  // the dates it is given, so a neighbour's period cannot leak into this
  // client's figure.
  return new Map(
    [...periodByClient].map(([id, dates]) => {
      const period = summariseAdherenceRun(dates, byClient.get(id) ?? [], today);

      return [
        id,
        {
          periodStartDate: dates[0] ?? today,
          periodDays: dates.length,
          averageFraction: period.averageFraction,
          recordedCount: period.recordedCount,
          fullyCompletedCount: period.fullyCompletedCount,
        },
      ];
    }),
  );
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
      maritalStatus: clientNutritionProfiles.maritalStatus,
      childrenCount: clientNutritionProfiles.childrenCount,
      bloodType: clientNutritionProfiles.bloodType,
      occupation: clientNutritionProfiles.occupation,
      visitReason: clientNutritionProfiles.visitReason,
      dietHistory: clientNutritionProfiles.dietHistory,
      drugAllergies: clientNutritionProfiles.drugAllergies,
      familyHistory: clientNutritionProfiles.familyHistory,
      activityNotes: clientNutritionProfiles.activityNotes,
      activityBarriers: clientNutritionProfiles.activityBarriers,
      sleepHours: clientNutritionProfiles.sleepHours,
      smoking: clientNutritionProfiles.smoking,
      caffeineFrequency: clientNutritionProfiles.caffeineFrequency,
      sweetDrinksFrequency: clientNutritionProfiles.sweetDrinksFrequency,
      fastFoodFrequency: clientNutritionProfiles.fastFoodFrequency,
      vegetablesFrequency: clientNutritionProfiles.vegetablesFrequency,
      fruitFrequency: clientNutritionProfiles.fruitFrequency,
      dairyFrequency: clientNutritionProfiles.dairyFrequency,
      redMeatFrequency: clientNutritionProfiles.redMeatFrequency,
      chickenFrequency: clientNutritionProfiles.chickenFrequency,
      fishFrequency: clientNutritionProfiles.fishFrequency,
      sweetsFrequency: clientNutritionProfiles.sweetsFrequency,
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
    maritalStatus: row.maritalStatus,
    childrenCount: row.childrenCount,
    bloodType: row.bloodType,
    occupation: row.occupation,
    visitReason: row.visitReason,
    dietHistory: row.dietHistory,
    drugAllergies: row.drugAllergies,
    familyHistory: row.familyHistory,
    activityNotes: row.activityNotes,
    activityBarriers: row.activityBarriers,
    sleepHours: row.sleepHours,
    smoking: row.smoking,
    caffeineFrequency: row.caffeineFrequency,
    sweetDrinksFrequency: row.sweetDrinksFrequency,
    fastFoodFrequency: row.fastFoodFrequency,
    vegetablesFrequency: row.vegetablesFrequency,
    fruitFrequency: row.fruitFrequency,
    dairyFrequency: row.dairyFrequency,
    redMeatFrequency: row.redMeatFrequency,
    chickenFrequency: row.chickenFrequency,
    fishFrequency: row.fishFrequency,
    sweetsFrequency: row.sweetsFrequency,
    hasProfile: row.profileId !== null,
  };
}
