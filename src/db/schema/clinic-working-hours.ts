import { sql } from 'drizzle-orm';
import { boolean, check, integer, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { clinics } from './clinics';

/** One clinic-local weekday and its single bookable opening range. */
export const clinicWorkingHours = pgTable(
  'clinic_working_hours',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(),
    isWorking: boolean('is_working').notNull(),
    openMinute: integer('open_minute'),
    closeMinute: integer('close_minute'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('clinic_working_hours_clinic_id_weekday_idx').on(table.clinicId, table.weekday),
    check('clinic_working_hours_weekday_range', sql`${table.weekday} >= 0 AND ${table.weekday} <= 6`),
    check(
      'clinic_working_hours_valid_state',
      sql`(
        ${table.isWorking}
        AND ${table.openMinute} IS NOT NULL
        AND ${table.closeMinute} IS NOT NULL
        AND ${table.openMinute} >= 0
        AND ${table.closeMinute} <= 1440
        AND ${table.openMinute} < ${table.closeMinute}
        AND ${table.openMinute} % 15 = 0
        AND ${table.closeMinute} % 15 = 0
      ) OR (
        NOT ${table.isWorking}
        AND ${table.openMinute} IS NULL
        AND ${table.closeMinute} IS NULL
      )`,
    ),
  ],
);

export type ClinicWorkingHours = typeof clinicWorkingHours.$inferSelect;
export type NewClinicWorkingHours = typeof clinicWorkingHours.$inferInsert;
