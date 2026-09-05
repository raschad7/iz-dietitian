import { and, asc, desc, eq, inArray, max, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  clientMeasurementFiles,
  clientMeasurements,
  clients,
  type ClientMeasurement,
} from '@/db/schema';
import { type IsoDate } from '@/lib/iso-date';

import { type ComparableMeasurement } from './compare';

/**
 * Reading measurements.
 *
 * Every function here takes a `clinicId` as its first argument and filters on
 * it, per the tenant rule in `docs/architecture.md`. A measurement is a clinical
 * record, and there is no read path that reaches one without naming the clinic
 * it belongs to.
 *
 * ⚠ Nothing here joins `client_measurement_files`. The stored PDF is several
 * hundred kilobytes and every screen in this feature is built from numbers; the
 * file is fetched on its own, by the one route that streams it. See the note on
 * that table.
 */

/**
 * One measurement as the feature reads it — the row, minus the columns only the
 * detail view needs, and typed so it satisfies {@link ComparableMeasurement}.
 *
 * `real` columns come back from postgres.js as JavaScript numbers, and
 * `date` in `mode: 'string'` as `YYYY-MM-DD`, so no mapping is needed between
 * this and the comparison arithmetic.
 */
export type MeasurementRow = ClientMeasurement;

/** Compile-time proof that a stored row can be compared without a mapping step. */
const _rowIsComparable = (row: MeasurementRow): ComparableMeasurement => row;
void _rowIsComparable;

function inClinic(clinicId: string, clientId: string) {
  return and(eq(clientMeasurements.clinicId, clinicId), eq(clientMeasurements.clientId, clientId));
}

/**
 * One client's measurements, **newest first**.
 *
 * The order is load-bearing: `summariseProgress` documents that it takes
 * measurements newest-first and reads the latest off the head rather than
 * sorting again, so the two must not disagree. Both sort columns are named, in
 * the same direction as the index behind them.
 */
export async function listMeasurements(
  clinicId: string,
  clientId: string,
): Promise<MeasurementRow[]> {
  return db
    .select()
    .from(clientMeasurements)
    .where(inClinic(clinicId, clientId))
    .orderBy(desc(clientMeasurements.measuredOn), desc(clientMeasurements.measuredAtMinute));
}

/**
 * One measurement, scoped.
 *
 * Takes the client id as well as the measurement id so a row belonging to
 * another client of the same clinic cannot be reached by guessing a uuid — the
 * detail view is always opened from within a client's record, so it always
 * knows both.
 */
export async function getMeasurement(
  clinicId: string,
  clientId: string,
  measurementId: string,
): Promise<MeasurementRow | null> {
  const [row] = await db
    .select()
    .from(clientMeasurements)
    .where(and(inClinic(clinicId, clientId), eq(clientMeasurements.id, measurementId)))
    .limit(1);

  return row ?? null;
}

/**
 * The most recent measurement for each of several clients, in one query.
 *
 * For list screens — the roster, and the dashboard's overdue sweep — where
 * asking per client would be one round trip per row. Returns only the date, not
 * the row: the question those screens ask is "when were they last measured",
 * and reading twenty full measurements to answer it would be waste.
 */
export async function lastMeasuredOn(
  clinicId: string,
  clientIds: readonly string[],
): Promise<Map<string, IsoDate>> {
  if (clientIds.length === 0) return new Map();

  const rows = await db
    .select({
      clientId: clientMeasurements.clientId,
      measuredOn: max(clientMeasurements.measuredOn),
    })
    .from(clientMeasurements)
    .where(
      and(
        eq(clientMeasurements.clinicId, clinicId),
        inArray(clientMeasurements.clientId, [...clientIds]),
      ),
    )
    .groupBy(clientMeasurements.clientId);

  const byClient = new Map<string, IsoDate>();
  for (const row of rows) {
    // `max` over an empty group cannot happen here — a group only exists
    // because a row did — but the column type is nullable, so this narrows.
    if (row.measuredOn) byClient.set(row.clientId, row.measuredOn);
  }

  return byClient;
}

/**
 * How many measurements a client has, without reading any of them.
 *
 * The record header's "3 measurements" and the empty-state decision, for a
 * screen that is not the Measurements tab and has no use for the figures.
 */
export async function countMeasurements(clinicId: string, clientId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(clientMeasurements)
    .where(inClinic(clinicId, clientId));

  return row?.total ?? 0;
}

/**
 * Whether this client already has a measurement at this exact wall clock.
 *
 * The unique index refuses a duplicate either way; this exists so the form can
 * say "there is already a reading for 12 March at 06:34" *before* the save,
 * rather than turning a database constraint into an unexplained failure. The
 * index remains the guarantee — this is only the courtesy.
 */
export async function measurementExistsAt(
  clinicId: string,
  clientId: string,
  measuredOn: IsoDate,
  measuredAtMinute: number,
  excludeMeasurementId?: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: clientMeasurements.id })
    .from(clientMeasurements)
    .where(
      and(
        inClinic(clinicId, clientId),
        eq(clientMeasurements.measuredOn, measuredOn),
        eq(clientMeasurements.measuredAtMinute, measuredAtMinute),
      ),
    )
    .limit(2);

  return rows.some((row) => row.id !== excludeMeasurementId);
}

/**
 * Every measurement for a client, oldest first.
 *
 * Only for the places that genuinely read forwards — a printed history, an
 * export. Screens use {@link listMeasurements} and let `summariseProgress` and
 * `trendSeries` order what they need.
 */
export async function listMeasurementsAscending(
  clinicId: string,
  clientId: string,
): Promise<MeasurementRow[]> {
  return db
    .select()
    .from(clientMeasurements)
    .where(inClinic(clinicId, clientId))
    .orderBy(asc(clientMeasurements.measuredOn), asc(clientMeasurements.measuredAtMinute));
}

/**
 * The two facts an uploaded report is checked against: who this client is, and
 * how tall the record says they are.
 *
 * Name and height only. The check is "did this report land on the right record"
 * and "does the machine agree about the height" — nothing else about the client
 * is any of the reader's business, and selecting a whole row would drag their
 * notes and allergies through a parse.
 */
export async function getClientForReport(
  clinicId: string,
  clientId: string,
): Promise<{ fullName: string; heightCm: number | null } | null> {
  const [row] = await db
    .select({ fullName: clients.fullName, heightCm: clients.heightCm })
    .from(clients)
    .where(and(eq(clients.clinicId, clinicId), eq(clients.id, clientId)))
    .limit(1);

  return row ?? null;
}

/**
 * The stored report for one measurement, bytes and all.
 *
 * ⚠ **The only read in this feature that touches `client_measurement_files`,
 * and it is called by exactly one route.** Every other screen here is built from
 * numbers; joining a few hundred kilobytes of base64 into a query that wanted a
 * weight is the cost the table was split to avoid. See its schema note.
 *
 * Joined through the measurement rather than read by file id, so the clinic and
 * the client both have to match before any bytes come back.
 */
export async function getMeasurementFile(
  clinicId: string,
  clientId: string,
  measurementId: string,
): Promise<{ fileName: string; contentType: string; content: string } | null> {
  const [row] = await db
    .select({
      fileName: clientMeasurementFiles.fileName,
      contentType: clientMeasurementFiles.contentType,
      content: clientMeasurementFiles.content,
    })
    .from(clientMeasurementFiles)
    .innerJoin(
      clientMeasurements,
      eq(clientMeasurements.id, clientMeasurementFiles.measurementId),
    )
    .where(and(inClinic(clinicId, clientId), eq(clientMeasurements.id, measurementId)))
    .limit(1);

  return row ?? null;
}

/** Which measurements have a report behind them, for the "open original" link. */
export async function measurementsWithFiles(
  clinicId: string,
  clientId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ measurementId: clientMeasurementFiles.measurementId })
    .from(clientMeasurementFiles)
    .innerJoin(
      clientMeasurements,
      eq(clientMeasurements.id, clientMeasurementFiles.measurementId),
    )
    .where(inClinic(clinicId, clientId));

  return new Set(rows.map((row) => row.measurementId));
}
