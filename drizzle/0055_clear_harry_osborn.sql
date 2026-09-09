-- The current weight stops being a column and becomes the newest measurement.
--
-- `client_nutrition_profiles.weight_kg` was a second copy of something
-- `client_measurements` already held, and the two drifted: a record could read
-- 70 kg from an intake typed months earlier while the analyser's own history
-- said 72.2, with every figure built on the weight — BMI, the calorie target,
-- the protein suggestion, the generated week — built on the stale one.
--
-- Dropping the column without this backfill would take the weight away from
-- every client whose figure was only ever typed into the intake dialog, so the
-- weight is filed as the weigh-in it always was, first.
--
-- Three guards, and each one protects a real row:
--
--   * `NOT EXISTS` skips any client who already has a reading on or after the
--     profile's own `updated_at`. Their newest measurement is by definition the
--     better record of the current weight, and inserting behind it would file a
--     weigh-in that never happened.
--   * `ON CONFLICT DO NOTHING` yields to a row already sitting on that day and
--     minute — an analyser report stored at minute 0 keeps its own figure,
--     which is the same rule `recordIntakeWeight` ran before this change.
--   * `> 0` matches the table's own check constraint, so a zeroed profile
--     cannot fail the insert and take the migration down with it.
--
-- `updated_at` is a proxy for when the weight was typed, not a record of it —
-- the column never carried a date. It is the closest honest answer available,
-- and it keeps the backfilled row behind anything measured since.
INSERT INTO "client_measurements" (
  "clinic_id", "client_id", "measured_on", "measured_at_minute", "source", "weight_kg"
)
SELECT
  p."clinic_id",
  p."client_id",
  (p."updated_at" AT TIME ZONE 'UTC')::date,
  0,
  'manual',
  p."weight_kg"
FROM "client_nutrition_profiles" p
WHERE p."weight_kg" IS NOT NULL
  AND p."weight_kg" > 0
  AND NOT EXISTS (
    SELECT 1
    FROM "client_measurements" m
    WHERE m."client_id" = p."client_id"
      AND m."measured_on" >= (p."updated_at" AT TIME ZONE 'UTC')::date
  )
ON CONFLICT ("client_id", "measured_on", "measured_at_minute") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "client_nutrition_profiles" DROP COLUMN "weight_kg";
