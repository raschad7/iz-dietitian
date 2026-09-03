'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { localeSchema } from '@/features/clients/schema';
import { type Locale } from '@/i18n/routing';
import { requireStaffClinic } from '@/lib/session';

import { normalizeForSearch } from '@/features/clients/search';

import { type MeasurementFormEcho, type MeasurementFormState } from './form-state';
import {
  applyWeightToProfile,
  createMeasurement,
  createMeasurementWithFile,
  deleteMeasurement,
  setMeasurementSharing,
  updateMeasurement,
  type MeasurementFileInput,
} from './mutations';
import { extractFirstPage } from './parse/extract';
import { parseReport } from './parse/report';
import { REPORT_FIGURES } from './parse/types';
import { getClientForReport, measurementExistsAt } from './queries';
import { type RecordWarning, type ReadReportState } from './report-state';
import {
  deleteMeasurementSchema,
  MEASUREMENT_FILE_MAX_BYTES,
  MEASUREMENT_FILE_TYPES,
  saveMeasurementSchema,
  updateMeasurementSchema,
} from './schema';

/**
 * A server action is a public endpoint. The layout guard protects the page
 * render, not the mutation, so every action below re-verifies the session and
 * scopes every write to the caller's own clinic.
 *
 * State shapes and their initial values live in `./form-state` — this module is
 * `"use server"`, and such a module may only export async functions.
 */

/**
 * Reads every field the schema declares, from the schema's own key list.
 *
 * ⚠ **This is deliberately not a hand-written list of `formData.get` calls.**
 * `clients/actions.ts` carries a long warning about what happened when its
 * intake reader fell behind its schema: every missing field was `optional()`,
 * so it parsed as `undefined`, validated cleanly, and was written as SQL NULL.
 * Two panels reported "saved" and threw the answers away, silently, every time.
 *
 * Every figure on this form is optional for the same reason theirs were — a
 * machine reports what it reports — so this form is open to the identical bug.
 * Driving the reader off `shape` makes the two impossible to disagree: a field
 * added to the schema is read from the moment it exists, and a field removed
 * stops being read in the same edit.
 */
function readForm(formData: FormData, shape: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(shape).map((key) => [key, formData.get(key)]));
}

/**
 * The same fields as strings, to hand back with a refusal.
 *
 * See {@link MeasurementFormEcho}: React empties an uncontrolled form once its
 * action returns, so a rejected save has to carry what was typed or fourteen
 * numeric boxes come back blank with one complaint on them.
 */
function echoForm(formData: FormData, shape: Record<string, unknown>): MeasurementFormEcho {
  const echo: MeasurementFormEcho = {};

  for (const key of Object.keys(shape)) {
    const value = formData.get(key);
    // A file part, or a missing field, is not something to hand back to a text
    // input — both become the empty string the field would have shown anyway.
    echo[key] = typeof value === 'string' ? value : '';
  }

  return echo;
}

/**
 * Applies the weight to the nutrition profile, when the box was ticked, and
 * reports which of the three things happened.
 *
 * Shared by create and update so the two cannot drift on the one decision in
 * this feature that changes a figure outside it.
 */
async function applyCurrentWeight(
  clinicId: string,
  clientId: string,
  weightKg: number,
  requested: boolean,
): Promise<'untouched' | 'applied' | 'noProfile'> {
  if (!requested) return 'untouched';

  const applied = await applyWeightToProfile(clinicId, clientId, weightKg);
  return applied ? 'applied' : 'noProfile';
}

/**
 * The uploaded report, when the confirm screen carried one back.
 *
 * The file crosses the wire twice — once to be read, once to be saved — rather
 * than being parked somewhere between the two. A few hundred kilobytes sent
 * again is cheaper than a draft store that needs a sweeper for every upload
 * somebody abandoned, and there is no window in which an orphan can exist.
 */
async function readReportFile(formData: FormData): Promise<Omit<MeasurementFileInput, 'parserVersion'> | null> {
  const file = formData.get('report');
  if (!(file instanceof File) || file.size === 0) return null;

  if (
    file.size > MEASUREMENT_FILE_MAX_BYTES ||
    !MEASUREMENT_FILE_TYPES.includes(file.type as (typeof MEASUREMENT_FILE_TYPES)[number])
  ) {
    // The upload control already refused this; a payload that reaches here
    // anyway is not one to store.
    return null;
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  /*
    The extracted text is stored beside the bytes so a re-parse need not run PDF
    extraction again, and so a parsing bug can be reproduced from the text the
    parser actually saw rather than from the file it was handed. A file this
    reader cannot open is still worth keeping — it is the source document.
  */
  let extractedText: string | null = null;
  try {
    extractedText = (await extractFirstPage(new Uint8Array(bytes))).plainText;
  } catch (error) {
    console.error('measurement file text extraction failed', error);
  }

  return {
    fileName: file.name.slice(0, 200),
    contentType: file.type,
    byteSize: bytes.byteLength,
    content: bytes.toString('base64'),
    extractedText,
  };
}

/** One more refusal than this form has already had. */
function nextAttempt(previous: MeasurementFormState): number {
  return (previous.status === 'error' ? previous.attempt : 0) + 1;
}

function readLocale(formData: FormData): Locale {
  return localeSchema.parse(formData.get('locale'));
}

/**
 * Refreshes every screen that shows this client's figures.
 *
 * The nutrition view is included because ticking "make this the current weight"
 * moves the weight its BMI, calorie target and protein suggestion are all
 * derived from — leaving it cached would show the dietitian the old target
 * beside the new measurement, which reads as the app disagreeing with itself.
 * The plan board is included for the same reason.
 */
function revalidateClient(locale: Locale, clientId: string) {
  revalidatePath(`/${locale}/app/clients/${clientId}`);
  revalidatePath(`/${locale}/app/clients/${clientId}/nutrition`);
  revalidatePath(`/${locale}/app/weekly-plans/${clientId}`);
}

export async function saveMeasurementAction(
  previous: MeasurementFormState,
  formData: FormData,
): Promise<MeasurementFormState> {
  const attempt = nextAttempt(previous);
  const shape = saveMeasurementSchema.shape;

  try {
    const locale = readLocale(formData);
    const { clinicId, session } = await requireStaffClinic(locale);

    const parsed = saveMeasurementSchema.safeParse(readForm(formData, shape));

    if (!parsed.success) {
      return {
        status: 'error',
        messageKey: 'errors.invalid',
        fieldErrors: z.flattenError(parsed.error).fieldErrors,
        values: echoForm(formData, shape),
        attempt,
      };
    }

    const {
      clientId,
      applyToCurrentWeight,
      deviceLabel,
      deviceSubjectId,
      parserVersion,
      rawValues,
      ...input
    } = parsed.data;
    const origin = { deviceLabel, deviceSubjectId, parserVersion, rawValues };

    /*
      The courtesy check. The unique index is the guarantee — see
      `measurementExistsAt` — but a constraint violation surfaces as an
      unexplained failure, and "there is already a reading for this date and
      time" is something the dietitian can act on. Uploading the same report
      twice is the ordinary mistake here.
    */
    if (await measurementExistsAt(clinicId, clientId, input.measuredOn, input.measuredAtMinute ?? 0)) {
      return {
        status: 'error',
        messageKey: 'errors.duplicate',
        values: echoForm(formData, shape),
        attempt,
      };
    }

    /*
      `source` is decided here, from whether a file actually arrived, and is
      never read off the form. A posted field could otherwise claim a
      hand-typed measurement came off a machine that never saw the client.
    */
    const file = await readReportFile(formData);

    const record = {
      ...input,
      source: file ? ('device' as const) : ('manual' as const),
      deviceLabel: file ? (origin.deviceLabel ?? null) : null,
      deviceSubjectId: file ? (origin.deviceSubjectId ?? null) : null,
      rawValues: file ? (origin.rawValues ?? null) : null,
      recordedBy: session.user.id,
    };

    const measurementId = file
      ? await createMeasurementWithFile(clinicId, clientId, record, {
          ...file,
          parserVersion: origin.parserVersion ?? null,
        })
      : await createMeasurement(clinicId, clientId, record);

    /*
      Only when the box was ticked, and only for the weight — see
      `applyWeightToProfile`. A client with no nutrition profile yet has nothing
      to update, which is reported rather than treated as a failure: the
      measurement is recorded either way, and a dietitian who ticked a box has
      to be told when the box did nothing.
    */
    const currentWeight = await applyCurrentWeight(
      clinicId,
      clientId,
      input.weightKg,
      applyToCurrentWeight,
    );

    revalidateClient(locale, clientId);

    return { status: 'success', measurementId, currentWeight, weightKg: input.weightKg };
  } catch (error) {
    console.error('saveMeasurementAction failed', error);
    return {
      status: 'error',
      messageKey: 'errors.unexpected',
      values: echoForm(formData, shape),
      attempt,
    };
  }
}

export async function updateMeasurementAction(
  previous: MeasurementFormState,
  formData: FormData,
): Promise<MeasurementFormState> {
  const attempt = nextAttempt(previous);
  const shape = updateMeasurementSchema.shape;

  try {
    const locale = readLocale(formData);
    const { clinicId } = await requireStaffClinic(locale);

    const parsed = updateMeasurementSchema.safeParse(readForm(formData, shape));

    if (!parsed.success) {
      return {
        status: 'error',
        messageKey: 'errors.invalid',
        fieldErrors: z.flattenError(parsed.error).fieldErrors,
        values: echoForm(formData, shape),
        attempt,
      };
    }

    /*
      The origin fields are pulled out and dropped. `updateMeasurement` does not
      touch `source`, `device_label` or `raw_values` for the reason stated there:
      a dietitian fixing a mistyped percentage is correcting a reading, not
      changing where it came from, and the report is still attached to the row.
    */
    const {
      clientId,
      measurementId,
      applyToCurrentWeight,
      deviceLabel: _deviceLabel,
      deviceSubjectId: _deviceSubjectId,
      parserVersion: _parserVersion,
      rawValues: _rawValues,
      ...input
    } = parsed.data;

    // Excluding this row, so re-saving a measurement without moving its time is
    // not a collision with itself.
    const collides = await measurementExistsAt(
      clinicId,
      clientId,
      input.measuredOn,
      input.measuredAtMinute ?? 0,
      measurementId,
    );

    if (collides) {
      return {
        status: 'error',
        messageKey: 'errors.duplicate',
        values: echoForm(formData, shape),
        attempt,
      };
    }

    const updated = await updateMeasurement(clinicId, clientId, measurementId, input);

    if (!updated) {
      return {
        status: 'error',
        messageKey: 'errors.notFound',
        values: echoForm(formData, shape),
        attempt,
      };
    }

    const currentWeight = await applyCurrentWeight(
      clinicId,
      clientId,
      input.weightKg,
      applyToCurrentWeight,
    );

    revalidateClient(locale, clientId);

    return { status: 'success', measurementId, currentWeight, weightKg: input.weightKg };
  } catch (error) {
    console.error('updateMeasurementAction failed', error);
    return {
      status: 'error',
      messageKey: 'errors.unexpected',
      values: echoForm(formData, shape),
      attempt,
    };
  }
}

/**
 * Deletes one measurement.
 *
 * A plain form action rather than a `useActionState` pair, matching
 * `deleteClientAction`: the confirm dialog has already asked, and there is no
 * field for a message to attach to. A row that fails to delete stays on screen,
 * which is the visible outcome.
 *
 * Nothing is archived. Unlike a client, a measurement has no life of its own to
 * suspend, and the reason to remove one is almost always that it should never
 * have existed — a duplicate, or a reading filed onto the wrong record. A
 * soft-deleted wrong reading would go on sitting in the wrong client's history.
 *
 * The weight this measurement may once have written onto the nutrition profile
 * is **not** rolled back. That value has since been read by whatever plans were
 * generated from it, and silently moving a client's current weight because a
 * historical row was tidied up would be a stranger outcome than leaving it. The
 * dietitian sets it from whichever reading they mean.
 */
export async function deleteMeasurementAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const { clientId, measurementId } = deleteMeasurementSchema.parse({
    measurementId: formData.get('measurementId'),
    clientId: formData.get('clientId'),
  });

  await deleteMeasurement(clinicId, clientId, measurementId);

  revalidateClient(locale, clientId);
}

/**
 * Reads an uploaded report and hands back a draft. **Writes nothing.**
 *
 * This is the load-bearing rule of the whole upload path, and it is why there is
 * no "import" button that files a measurement on its own. The figures on these
 * sheets are located by position, because a Tanita's labels are images (see
 * `parse/tanita-mc780.ts`), and the way that fails is by returning the
 * neighbouring value rather than by returning nothing. A wrong body-fat
 * percentage saved unattended is a clinical decision made on a typo.
 *
 * So the reader's output is a form, pre-filled, with everything that looked
 * wrong stated above it. `saveMeasurementAction` is the only thing that writes,
 * and it runs when a person presses Save.
 */
export async function readReportAction(
  _previous: ReadReportState,
  formData: FormData,
): Promise<ReadReportState> {
  try {
    const locale = readLocale(formData);
    const { clinicId } = await requireStaffClinic(locale);

    const clientId = z.uuid().parse(formData.get('clientId'));
    const file = formData.get('report');

    if (!(file instanceof File) || file.size === 0) {
      return { status: 'error', messageKey: 'errors.fileMissing' };
    }
    if (file.size > MEASUREMENT_FILE_MAX_BYTES) {
      return { status: 'error', messageKey: 'errors.fileTooLarge' };
    }
    if (!MEASUREMENT_FILE_TYPES.includes(file.type as (typeof MEASUREMENT_FILE_TYPES)[number])) {
      return { status: 'error', messageKey: 'errors.fileNotPdf' };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const page = await extractFirstPage(bytes);
    const report = parseReport(page);

    /*
      The record's own objections, which the parser cannot raise because it is
      pure over a page and has never heard of this client. Dropping a report on
      the wrong record is the likeliest mistake in this feature, and the name and
      the machine's date are the two things that catch it.
    */
    const warnings: (RecordWarning | (typeof report.warnings)[number])[] = [...report.warnings];
    const client = await getClientForReport(clinicId, clientId);

    if (client) {
      if (report.subjectName && !namesLookAlike(report.subjectName, client.fullName)) {
        warnings.push({
          kind: 'nameMismatch',
          onReport: report.subjectName,
          onRecord: client.fullName,
        });
      }

      const reportHeight = report.figures.heightCm.value;
      if (reportHeight !== null && client.heightCm !== null && Math.abs(reportHeight - client.heightCm) >= 1) {
        warnings.push({
          kind: 'heightMismatch',
          onReport: reportHeight,
          onRecord: client.heightCm,
        });
      }

      if (report.measuredOn) {
        const exists = await measurementExistsAt(
          clinicId,
          clientId,
          report.measuredOn,
          report.measuredAtMinute ?? 0,
        );
        if (exists) warnings.push({ kind: 'duplicate', measuredOn: report.measuredOn });
      }
    }

    const found = REPORT_FIGURES.filter((figure) => report.figures[figure].value !== null).length;

    return {
      status: 'ready',
      report,
      warnings,
      file: { name: file.name, byteSize: file.size },
      found,
      total: REPORT_FIGURES.length,
    };
  } catch (error) {
    console.error('readReportAction failed', error);
    return { status: 'error', messageKey: 'errors.unreadable' };
  }
}

/**
 * Whether the name on the report plausibly belongs to this client.
 *
 * Deliberately loose. A Tanita's operator types the name into the machine, so it
 * arrives transliterated, abbreviated, or with the parts in the other order —
 * `sara muhtaseb` against `سارة المحتسب`. A strict comparison would cry wolf on
 * every upload, and a warning nobody believes is worse than no warning: this
 * exists to catch a report belonging to a *different person*, not to police
 * spelling.
 *
 * So it asks whether the two share any word at all, over the same normalisation
 * the client search uses. A shared word means the same person often enough; no
 * shared word at all is what the dietitian should look at.
 */
function namesLookAlike(onReport: string, onRecord: string): boolean {
  const words = (value: string) =>
    normalizeForSearch(value)
      .split(/\s+/)
      .filter((word) => word.length > 2);

  const reportWords = words(onReport);
  const recordWords = new Set(words(onRecord));

  // Nothing comparable — a machine that printed no name, or one whose script
  // normalises away entirely. Silence beats a warning that is always on.
  if (reportWords.length === 0 || recordWords.size === 0) return true;

  return reportWords.some((word) => recordWords.has(word));
}

/**
 * Shows or hides this client's measurements in their own portal.
 *
 * A plain form action: the switch has already said what it means, and there is
 * no field for a message to attach to. It revalidates the record so the control
 * re-renders from the stored value rather than from optimistic client state — a
 * disclosure switch that *looks* on while the column says off is the one failure
 * worth a round trip to avoid.
 */
export async function setMeasurementSharingAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const { clinicId } = await requireStaffClinic(locale);

  const clientId = z.uuid().parse(formData.get('clientId'));
  const shared = formData.get('shared') === 'on';

  await setMeasurementSharing(clinicId, clientId, shared);

  revalidateClient(locale, clientId);
}
