import { and, asc, count, desc, eq, ilike, isNotNull, isNull, sql, type AnyColumn, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { clientNutritionProfiles, clients, type Client } from '@/db/schema';

import { DEFAULT_MEAL_SCHEDULE, mealScheduleSchema } from './nutrition';
import { normalizeForSearch } from './search';
import {
  CLIENT_STATUSES,
  clientIdSchema,
  type ClientStatus,
  type ListClientsInput,
} from './schema';
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
  email: string | null;
  status: string;
  hasPortalAccess: boolean;
};

export type ClientListResult = {
  items: ClientListItem[];
  total: number;
  page: number;
  pageCount: number;
};

export type ClientDetail = Client & { hasPortalAccess: boolean };

/**
 * Which clients the status rule lets through.
 *
 * The register shows active clients unless it is explicitly told otherwise, so
 * this is the default whenever the reader is filtering on something else — or
 * on nothing. Only `filterBy: 'status'` can change it, and a value outside the
 * set falls back to the default rather than showing the whole register: a
 * mistyped query string should not quietly widen what is on screen.
 */
function statusRule(input: ListClientsInput): ClientStatus | 'all' {
  if (input.filterBy !== 'status') return 'active';

  const value = input.filterValue;
  if (value === 'all') return 'all';
  return CLIENT_STATUSES.find((status) => status === value) ?? 'active';
}

/**
 * The one column the reader chose to filter on, if any.
 *
 * `status` is not here — it is the rule above, because it is the one filter
 * that also has a default. A column with no value filters nothing: the popover
 * can be opened and a column picked without a term typed yet, and that state
 * should show the register, not an empty one.
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
  const conditions: SQL[] = [eq(clients.clinicId, clinicId)];

  const status = statusRule(input);
  if (status !== 'all') conditions.push(eq(clients.status, status));

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
  email: clients.email,
  status: clients.status,
  portalAccess: sql`(${clients.userId} is not null)`,
  createdAt: clients.createdAt,
};

/**
 * Nullable columns — phone and email — are pushed to the end in **both**
 * directions. A blank is not "smallest"; it is missing, and a reader flipping
 * the direction to find the As is not asking to be shown eleven dashes first.
 */
const NULLABLE_SORTS = new Set<ListClientsInput['sort']>(['phone', 'email']);

function buildOrder(input: ListClientsInput): SQL[] {
  const column = SORT_COLUMNS[input.sort];
  const direction = input.dir === 'asc' ? asc : desc;

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
      email: clients.email,
      status: clients.status,
      userId: clients.userId,
    })
    .from(clients)
    .where(where)
    .orderBy(...buildOrder(input))
    .limit(CLIENTS_PAGE_SIZE)
    .offset((input.page - 1) * CLIENTS_PAGE_SIZE);

  return {
    items: rows.map(({ userId, ...rest }) => ({ ...rest, hasPortalAccess: userId !== null })),
    total,
    page: input.page,
    pageCount: Math.max(1, Math.ceil(total / CLIENTS_PAGE_SIZE)),
  };
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

  const [row] = await db
    .select()
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
