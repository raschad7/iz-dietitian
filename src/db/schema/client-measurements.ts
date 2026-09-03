import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { user } from './auth';
import { appointments } from './appointments';
import { clients } from './clients';
import { clinics } from './clinics';

/**
 * Where a measurement came from.
 *
 * `manual` is the dietitian typing what the scale said. `device` is a body
 * composition analyser's own report, read and then **confirmed by a person** —
 * there is deliberately no third value for "read but unreviewed", because a
 * row only ever exists after somebody looked at it. An extraction nobody
 * confirmed is a draft in a form, not a record.
 */
export const MEASUREMENT_SOURCES = ['manual', 'device'] as const;

export type MeasurementSource = (typeof MEASUREMENT_SOURCES)[number];

/**
 * The figures a body composition analyser reports, and the ones a tape measure
 * adds, for one client at one moment.
 *
 * ## Why this table exists
 *
 * `client_nutrition_profiles.weight_kg` holds one weight and no history — its
 * own comment says a weight log "is a feature of its own and nobody has asked
 * for it yet". This is that feature, widened: a dietitian's machine reports far
 * more than weight, and BMI is the *weakest* line on its printout. BMI cannot
 * tell fat loss from muscle loss, so a client who loses 2 kg of muscle and
 * gains 1 kg of fat shows an improved BMI. Fat mass and muscle mass beside each
 * other are what make "you lost 2.6 kg, and 2.9 kg of it was fat" sayable, and
 * that sentence is the entire reason a clinic buys the machine.
 *
 * The profile's single `weight_kg` stays where it is. It is the *current*
 * weight — what plan generation and the calorie target read — and this table is
 * the history behind it. Saving the newest measurement offers to update it,
 * through a checkbox the dietitian can see; nothing here writes it silently.
 *
 * ## Null means "not reported", never zero
 *
 * The same rule as `catalog_foods` nutrition. Only `weight_kg` is NOT NULL,
 * because it is the one figure every source has — a bathroom scale, a tape and
 * a notebook, or a ₪40,000 analyser. Every other column is nullable, and a null
 * means this machine did not report that figure, or nobody measured it. A
 * zeroed body-fat percentage and an unreported one are different facts, and
 * only one of them is clinically alarming.
 *
 * ## BMI is not a column
 *
 * It is derived from `weight_kg` and a height by `bmi()` in
 * `features/weekly-plans/targets.ts`, the same function the intake screen and
 * the plan context panel already use. A stored BMI is a second source of truth
 * for something its own inputs answer, and the only way it can ever be wrong is
 * silently. The machine prints its own BMI; we compare against it rather than
 * keeping it, because a disagreement means the height typed into the machine
 * differs from the record's — which is a real error worth surfacing and not a
 * number worth storing.
 */
export const clientMeasurements = pgTable(
  'client_measurements',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * The tenant boundary, denormalised from the client for the same reason as
     * `client_nutrition_profiles.clinic_id` — reachable through `client_id`,
     * but carrying it here keeps the authorisation check off the join path.
     * It is also what the dashboard's "not measured lately" sweep filters on,
     * which would otherwise join every client in the clinic to ask.
     */
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),

    /**
     * When the body was on the machine, as a clinic-local wall clock.
     *
     * **A date plus minutes-from-midnight, exactly like `appointments`.** The
     * reasoning is that table's: this is a wall-clock fact about the clinic's
     * day, so storing the instant would let a DST transition move a measurement
     * onto the day before. Everything needed to read it already exists —
     * `toUtcInstant`, `minuteToClock`, `formatMinute` and `formatMediumDate` in
     * the booking feature — and none of it needs a time zone conversion.
     *
     * The time is kept rather than rounded away, which is where this differs
     * from `client_check_ins`. An analyser prints one (06:34), body water shifts
     * noticeably between morning and evening, and a client can be measured twice
     * in a day either side of a consultation — so the day alone is not an
     * identity for a reading.
     *
     * Neither column is `created_at`: a report can be uploaded weeks after the
     * visit it describes, and the history has to sit in the order the body was
     * measured in, not the order somebody got around to filing it.
     */
    measuredOn: date('measured_on', { mode: 'string' }).notNull(),

    /** Minutes from clinic-local midnight, 0–1439. Same units as `appointments.start_minute`. */
    measuredAtMinute: integer('measured_at_minute').notNull().default(0),

    /** See {@link MEASUREMENT_SOURCES}. */
    source: text('source').notNull().default('manual'),

    /**
     * The visit this measurement belongs to, when it is one.
     *
     * Nullable and never required: a client can be weighed at a drop-in with no
     * appointment on the books, and a report can arrive for a visit nobody
     * recorded. Making this NOT NULL would mean inventing an appointment to
     * file a measurement, which is a worse record than an unlinked one.
     *
     * `set null` rather than `cascade`: deleting a cancelled appointment must
     * not delete the measurement taken at it.
     */
    appointmentId: uuid('appointment_id').references(() => appointments.id, {
      onDelete: 'set null',
    }),

    // ── The figures ──────────────────────────────────────────────────────────

    /** The one figure every source has. Kilograms, always — see the note above. */
    weightKg: real('weight_kg').notNull(),

    /**
     * Height as recorded at this measurement, when it was recorded.
     *
     * `clients.height_cm` is the client's height and stays the authority — an
     * analyser's height is whatever the operator typed into it, and is wrong
     * often enough to be worth catching. This column is what the machine
     * reported, kept so a past visit's BMI is reproducible from the row itself
     * and so a mismatch remains visible after the fact.
     *
     * `bmiForMeasurement` in `features/measurements/compare.ts` decides which
     * of the two a BMI is computed from. The rule lives there, once.
     */
    heightCm: real('height_cm'),

    /** Percent of body mass that is fat, 0–100. */
    bodyFatPercent: real('body_fat_percent'),

    fatMassKg: real('fat_mass_kg'),

    /** Everything that is not fat: muscle, bone, water, organs. */
    fatFreeMassKg: real('fat_free_mass_kg'),

    muscleMassKg: real('muscle_mass_kg'),
    boneMassKg: real('bone_mass_kg'),

    totalBodyWaterKg: real('total_body_water_kg'),
    totalBodyWaterPercent: real('total_body_water_percent'),

    /**
     * The analyser's visceral fat scale. A rating, not a mass — Tanita reports
     * roughly 1–59, other machines report an area in cm², and the two are not
     * the same quantity. `real` because Tanita reports half steps (8.5).
     *
     * Deliberately **not** shown to clients: it is the figure most likely to
     * frighten someone who has no one beside them to interpret it.
     */
    visceralFatRating: real('visceral_fat_rating'),

    /**
     * The BMR the machine *measured*, in kcal.
     *
     * Worth a column of its own because it is better than the number the app
     * already computes. `mifflinStJeorBmr()` estimates from age, height, weight
     * and sex, so it cannot tell a muscular 78 kg from a soft one; an analyser
     * can, because it measured the fat-free mass. On a real report the two
     * differed by about 18% — around 300 kcal a day, which is a materially
     * different meal plan.
     *
     * Storing it does not make anything use it. Whether a client's target is
     * built on the measurement or the formula is a clinical decision, taken per
     * client through `client_nutrition_profiles.daily_kcal_target`.
     */
    basalMetabolicRateKcal: integer('basal_metabolic_rate_kcal'),

    /** The analyser's "your metabolism looks like a 43-year-old's" figure, in years. */
    metabolicAge: integer('metabolic_age'),

    /** Tape measurements. No machine reports these; a dietitian types them. */
    waistCm: real('waist_cm'),
    hipCm: real('hip_cm'),

    // ── Provenance ───────────────────────────────────────────────────────────

    /**
     * The machine, as the report named it — `Tanita MC-780`, `InBody 570`.
     *
     * Free text and not an enum: the point of this column is that the next
     * clinic has a machine nobody here has heard of, and a closed list would
     * turn buying a new analyser into a migration.
     */
    deviceLabel: text('device_label'),

    /**
     * The subject id printed on the report — the analyser's own numbering, not
     * ours. Kept so a second upload for the same person can be recognised, and
     * so a report dropped onto the wrong record leaves evidence.
     */
    deviceSubjectId: text('device_subject_id'),

    /**
     * Everything else the report carried, as the parser read it.
     *
     * Segmental arm and leg analysis, protein mass, physique rating, the
     * machine's own scores — figures we have no column for and no screen that
     * draws them. Kept because the alternative is discarding part of a clinical
     * record at parse time, and because it makes adding a chart for any of them
     * later a UI change rather than a request that every clinic re-upload a
     * year of PDFs.
     *
     * **Nothing reads this to make a decision.** It is a record of what arrived,
     * not an input. A figure that starts driving behaviour earns a column and a
     * migration, which is the correct amount of friction.
     */
    rawValues: jsonb('raw_values'),

    /** The dietitian's own remark about this measurement. */
    note: text('note'),

    /**
     * Who filed it. `set null` on a departed staff account, matching
     * `client_charges.recorded_by`: the measurement outlives the employment.
     */
    recordedBy: text('recorded_by').references(() => user.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /*
      One measurement per client per instant, enforced here and not only in the
      mutation. Uploading the same report twice is the ordinary mistake this
      feature invites — the file is sitting in a downloads folder and it is not
      obvious whether it went in — and a duplicated visit puts a fake zero-change
      step in every chart and delta on the screen.
    */
    uniqueIndex('client_measurements_client_id_measured_at_idx').on(
      table.clientId,
      table.measuredOn,
      table.measuredAtMinute,
    ),

    // The history read: one client, newest first. Both columns descend together
    // because the two of them are the sort key — a day index alone would leave
    // the database ordering two readings from one morning at read time.
    index('client_measurements_client_id_measured_at_desc_idx').on(
      table.clientId,
      table.measuredOn.desc(),
      table.measuredAtMinute.desc(),
    ),

    // The dashboard sweep: who in this clinic has not been measured lately.
    index('client_measurements_clinic_id_measured_on_idx').on(table.clinicId, table.measuredOn),

    /*
      Ranges the UI relies on, refused by the database rather than re-checked by
      every reader. A chart plotting a body-fat percentage has no sensible output
      for 140, and a non-positive weight would divide into a BMI of infinity.
    */
    check('client_measurements_weight_positive', sql`${table.weightKg} > 0`),
    check(
      'client_measurements_minute_range',
      sql`${table.measuredAtMinute} between 0 and 1439`,
    ),
    check(
      'client_measurements_height_positive',
      sql`${table.heightCm} is null or ${table.heightCm} > 0`,
    ),
    check(
      'client_measurements_body_fat_range',
      sql`${table.bodyFatPercent} is null or ${table.bodyFatPercent} between 0 and 100`,
    ),
    check(
      'client_measurements_body_water_range',
      sql`${table.totalBodyWaterPercent} is null or ${table.totalBodyWaterPercent} between 0 and 100`,
    ),
    check(
      'client_measurements_source_known',
      sql`${table.source} in ('manual', 'device')`,
    ),
  ],
);

export type ClientMeasurement = typeof clientMeasurements.$inferSelect;
export type NewClientMeasurement = typeof clientMeasurements.$inferInsert;

/**
 * The report a measurement was read from, kept whole.
 *
 * **A table of its own, and that is the entire point.** `clinics.logo_url`
 * already wrote this lesson down: a 40 KB string on a row that gets joined into
 * a client list is paid for on every screen that never draws it. A body
 * composition PDF is several hundred kilobytes — ten times worse — and the
 * history table above is read on every visit to the Measurements tab, to build
 * a chart made of numbers. Putting the bytes on that row would make the chart
 * expensive for no reason a reader could see.
 *
 * Why keep the file at all, rather than the numbers we extracted from it:
 *
 * - It is the source document of a clinical record. If a figure is later
 *   disputed, "here is what the machine printed" is the answer, and a parser's
 *   output is not.
 * - Parsers improve. `parser_version` plus the stored bytes mean a better field
 *   map can re-read the reports a clinic already uploaded, instead of asking
 *   them to find a year of PDFs again.
 *
 * `extracted_text` is kept beside the bytes so a re-read does not have to run
 * PDF text extraction again, and so a parsing bug can be reproduced from the
 * text the parser actually saw rather than from the file it was given.
 */
export const clientMeasurementFiles = pgTable(
  'client_measurement_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * One file per measurement. `cascade`, because a deleted measurement has no
     * business leaving its report behind — there is nothing left to interpret
     * it against.
     */
    measurementId: uuid('measurement_id')
      .notNull()
      .references(() => clientMeasurements.id, { onDelete: 'cascade' }),

    /**
     * Carried down from the measurement so the tenant check does not need a
     * join — the same reasoning as every other `clinic_id` in this file. A file
     * is reached by a staff route that must prove the clinic before it streams
     * bytes, and that check should not depend on getting a join right.
     */
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    /** As uploaded, for the download name. */
    fileName: text('file_name').notNull(),

    /** Always `application/pdf` today; stored rather than assumed. */
    contentType: text('content_type').notNull(),

    byteSize: integer('byte_size').notNull(),

    /**
     * The file itself, base64-encoded.
     *
     * It lives in a column because this stack has no object storage —
     * `DATABASE_URL` is the only backing service, exactly as `clinics.logo_url`
     * records. Base64 in `text` rather than `bytea` follows that same
     * precedent, and keeps the driver boundary a string: postgres.js returns
     * `text` as a JavaScript string with no `Buffer` handling to get right, and
     * the encoding costs about a third on a few hundred kilobytes per visit,
     * which is immaterial at one clinic's volume and is paid only by the route
     * that streams the file.
     *
     * `byte_size` below is the size of the **decoded** file, because that is
     * the number a person recognises as "how big is this PDF".
     *
     * The day a bucket exists, this column is dropped for a key and only the
     * writer and the streaming route change.
     */
    content: text('content').notNull(),

    /** What PDF text extraction saw, kept so a re-parse need not redo it. */
    extractedText: text('extracted_text'),

    /**
     * Which field map produced the figures on the measurement — `tanita/mc-780@1`.
     * Null for a file attached to a hand-typed measurement, and for a report
     * whose machine we did not recognise.
     */
    parserVersion: text('parser_version'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('client_measurement_files_measurement_id_idx').on(table.measurementId),
    check('client_measurement_files_size_positive', sql`${table.byteSize} > 0`),
  ],
);

export type ClientMeasurementFile = typeof clientMeasurementFiles.$inferSelect;
export type NewClientMeasurementFile = typeof clientMeasurementFiles.$inferInsert;
