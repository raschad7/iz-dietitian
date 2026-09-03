import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  clientMeasurementFiles,
  clientMeasurements,
  clientNutritionProfiles,
  clients,
} from '@/db/schema';

import { type MeasurementSource } from '@/db/schema';
import { type MeasurementInput } from './schema';

/**
 * Every write to `client_measurements`.
 *
 * Imports nothing from Next.js on purpose, the same split `clients/mutations.ts`
 * makes and for the same reason: `bun test` can call these directly, whereas a
 * `"use server"` module calling `revalidatePath` cannot run outside a request
 * scope. `actions.ts` is the thin layer that adds the Next.js concerns.
 */

/**
 * What a row needs, as opposed to what the form collects.
 *
 * `clientId` is here but `clinicId` is not: the clinic is proved by the caller
 * through `requireStaffClinic` and passed separately, so it can never arrive
 * from a form field.
 */
export type MeasurementRecordInput = Omit<MeasurementInput, 'clientId'> & {
  source?: MeasurementSource;
  deviceLabel?: string | null;
  deviceSubjectId?: string | null;
  rawValues?: unknown;
  appointmentId?: string | null;
  recordedBy?: string | null;
};

/**
 * Maps validated input onto columns.
 *
 * Optional figures become `null`, not skipped — clearing a body-fat percentage
 * on an edit has to actually clear it, and `undefined` would leave the old
 * value in place. This is the same rule `clients/mutations.ts` states.
 */
function toColumns(input: MeasurementRecordInput) {
  const orNull = (value: number | undefined) => value ?? null;

  return {
    measuredOn: input.measuredOn,
    // The column defaults to 0, but an edit that cleared the time must write the
    // 0 rather than leaving yesterday's time behind.
    measuredAtMinute: input.measuredAtMinute ?? 0,

    weightKg: input.weightKg,
    heightCm: orNull(input.heightCm),
    bodyFatPercent: orNull(input.bodyFatPercent),
    fatMassKg: orNull(input.fatMassKg),
    fatFreeMassKg: orNull(input.fatFreeMassKg),
    muscleMassKg: orNull(input.muscleMassKg),
    boneMassKg: orNull(input.boneMassKg),
    totalBodyWaterKg: orNull(input.totalBodyWaterKg),
    totalBodyWaterPercent: orNull(input.totalBodyWaterPercent),
    visceralFatRating: orNull(input.visceralFatRating),
    basalMetabolicRateKcal: orNull(input.basalMetabolicRateKcal),
    metabolicAge: orNull(input.metabolicAge),
    waistCm: orNull(input.waistCm),
    hipCm: orNull(input.hipCm),
    note: input.note ?? null,
  };
}

/**
 * Matches one measurement within one clinic.
 *
 * Every write goes through this rather than `eq(clientMeasurements.id, id)`
 * alone, so an id belonging to another clinic simply matches no rows — the
 * update reports "not found" instead of quietly succeeding across the tenant
 * boundary.
 */
function scoped(clinicId: string, clientId: string, measurementId: string) {
  return and(
    eq(clientMeasurements.id, measurementId),
    eq(clientMeasurements.clinicId, clinicId),
    eq(clientMeasurements.clientId, clientId),
  );
}

/**
 * The report a measurement was read from, as it is handed to the writer.
 *
 * `content` is base64 and `byteSize` is the size of the **decoded** file — the
 * figure a person recognises as "how big is this PDF" — matching the column's
 * own note.
 */
export type MeasurementFileInput = {
  fileName: string;
  contentType: string;
  byteSize: number;
  content: string;
  extractedText: string | null;
  parserVersion: string | null;
};

/**
 * Writes a measurement and the report it came from, together or not at all.
 *
 * One transaction, because the two halves are one fact. A row saying it was read
 * from a Tanita with no file behind it is a record whose provenance cannot be
 * checked, and a file with no row is invisible — neither is a state worth being
 * able to reach.
 */
export async function createMeasurementWithFile(
  clinicId: string,
  clientId: string,
  input: MeasurementRecordInput,
  file: MeasurementFileInput,
): Promise<string> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(clientMeasurements)
      .values({
        clinicId,
        clientId,
        source: input.source ?? 'device',
        deviceLabel: input.deviceLabel ?? null,
        deviceSubjectId: input.deviceSubjectId ?? null,
        rawValues: input.rawValues ?? null,
        appointmentId: input.appointmentId ?? null,
        recordedBy: input.recordedBy ?? null,
        ...toColumns(input),
      })
      .returning({ id: clientMeasurements.id });

    if (!row) throw new Error('Measurement insert returned no row.');

    await tx.insert(clientMeasurementFiles).values({
      measurementId: row.id,
      clinicId,
      fileName: file.fileName,
      contentType: file.contentType,
      byteSize: file.byteSize,
      content: file.content,
      extractedText: file.extractedText,
      parserVersion: file.parserVersion,
    });

    return row.id;
  });
}

export async function createMeasurement(
  clinicId: string,
  clientId: string,
  input: MeasurementRecordInput,
): Promise<string> {
  const [row] = await db
    .insert(clientMeasurements)
    .values({
      clinicId,
      clientId,
      source: input.source ?? 'manual',
      deviceLabel: input.deviceLabel ?? null,
      deviceSubjectId: input.deviceSubjectId ?? null,
      rawValues: input.rawValues ?? null,
      appointmentId: input.appointmentId ?? null,
      recordedBy: input.recordedBy ?? null,
      ...toColumns(input),
    })
    .returning({ id: clientMeasurements.id });

  if (!row) throw new Error('Measurement insert returned no row.');
  return row.id;
}

/**
 * Corrects an existing measurement.
 *
 * `source`, `device_label` and `raw_values` are deliberately **not** touched: a
 * dietitian fixing a mistyped body-fat percentage is correcting a reading, not
 * changing where it came from. A row that says it was read from a Tanita report
 * must go on saying so, because the report is still attached to it.
 *
 * Returns false when nothing matched, which is how a cross-clinic id surfaces.
 */
export async function updateMeasurement(
  clinicId: string,
  clientId: string,
  measurementId: string,
  input: MeasurementRecordInput,
): Promise<boolean> {
  const rows = await db
    .update(clientMeasurements)
    .set({ ...toColumns(input), updatedAt: new Date() })
    .where(scoped(clinicId, clientId, measurementId))
    .returning({ id: clientMeasurements.id });

  return rows.length > 0;
}

export async function deleteMeasurement(
  clinicId: string,
  clientId: string,
  measurementId: string,
): Promise<boolean> {
  const rows = await db
    .delete(clientMeasurements)
    .where(scoped(clinicId, clientId, measurementId))
    .returning({ id: clientMeasurements.id });

  return rows.length > 0;
}

/**
 * Makes a weight the client's *current* weight.
 *
 * The one write in this feature that reaches outside its own table, and the
 * reason it is a separate function rather than a line inside
 * {@link createMeasurement}: it changes the figure the calorie target and the
 * next generated plan are built from, so a reader tracing "why did this
 * client's target move" finds a named call rather than a side effect.
 *
 * It is called only when the dietitian ticked the box — see
 * `saveMeasurementSchema.applyToCurrentWeight`.
 *
 * ⚠ `client_nutrition_profiles` rows are created lazily by the intake form, so
 * a client who has never had one saved has no row to update. That is not an
 * error and not a reason to refuse the measurement: the weight is recorded in
 * this feature's own table either way, and the intake form will read it when it
 * is next opened. Returns whether a profile was actually updated.
 */
export async function applyWeightToProfile(
  clinicId: string,
  clientId: string,
  weightKg: number,
): Promise<boolean> {
  const rows = await db
    .update(clientNutritionProfiles)
    .set({ weightKg, updatedAt: new Date() })
    .where(
      and(
        eq(clientNutritionProfiles.clinicId, clinicId),
        eq(clientNutritionProfiles.clientId, clientId),
      ),
    )
    .returning({ id: clientNutritionProfiles.id });

  return rows.length > 0;
}

/**
 * The client facts a comparison needs, read in one go.
 *
 * Goal and height, and nothing else — `MeasurementSubject` is deliberately not
 * a client row, so this reads two columns rather than dragging a whole record
 * (and its notes, and its allergies) into a chart.
 */
export async function measurementSubject(
  clinicId: string,
  clientId: string,
): Promise<{ goal: string | null; heightCm: number | null } | null> {
  const [row] = await db
    .select({ goal: clients.goal, heightCm: clients.heightCm })
    .from(clients)
    .where(and(eq(clients.clinicId, clinicId), eq(clients.id, clientId)))
    .limit(1);

  return row ?? null;
}

/**
 * Turns the portal card on or off for one client.
 *
 * Writes only when a nutrition profile already exists. A client who has never
 * had their intake saved has nothing to share yet — the portal reader gates on
 * this same row — so creating one here just to hold a `false` would be inventing
 * a clinical record to store a preference.
 */
export async function setMeasurementSharing(
  clinicId: string,
  clientId: string,
  shared: boolean,
): Promise<boolean> {
  const rows = await db
    .update(clientNutritionProfiles)
    .set({ shareMeasurementsWithClient: shared, updatedAt: new Date() })
    .where(
      and(
        eq(clientNutritionProfiles.clinicId, clinicId),
        eq(clientNutritionProfiles.clientId, clientId),
      ),
    )
    .returning({ id: clientNutritionProfiles.id });

  return rows.length > 0;
}
