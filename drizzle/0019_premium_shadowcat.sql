-- Adherence becomes a fraction rather than a bucket.
--
-- `level` alone could only ever say missed / partial / full, so every screen
-- that drew a quantity from it drew 0%, 50% or 100% — one meal of four and
-- three of four were both "partial", and both read as half a day. The counts
-- these columns hold are what the portal now divides, so 1 of 4 is 25% and
-- 2 of 3 is 67%.
--
-- Added nullable, backfilled, then made NOT NULL: the columns have no sensible
-- default, and every existing row's true numbers are still recoverable from
-- the meals and completions they were derived from in the first place.
ALTER TABLE "client_plan_adherence" ADD COLUMN "completed_meals" integer;--> statement-breakpoint
ALTER TABLE "client_plan_adherence" ADD COLUMN "total_meals" integer;--> statement-breakpoint

-- Recount each historical day against the plan it belongs to.
--
-- The day is matched by date rather than stored: a plan covers seven dates
-- from its `week_start_date`, and `date - week_start_date` is the `day_of_week`
-- its meals are filed under. Where more than one plan covers the same date for
-- one client — a draft written beside a published week — the newest wins, which
-- is the one `recomputeDayAdherence` would itself have counted last.
-- The counting reads `client_plan_adherence` a second time, as `a2`, rather
-- than laterally off the UPDATE target: Postgres does not expose the target of
-- an UPDATE as a FROM item, so a LATERAL that names it fails with "invalid
-- reference to FROM-clause entry".
UPDATE "client_plan_adherence" AS a
SET "completed_meals" = counted.completed,
    "total_meals" = counted.total
FROM (
  SELECT
    a2."id" AS adherence_id,
    (SELECT count(*) FROM "weekly_plan_meals" m
      WHERE m."plan_id" = p."id"
        AND m."day_of_week" = (a2."date" - p."week_start_date")) AS total,
    (SELECT count(*) FROM "weekly_plan_meals" m
      JOIN "weekly_plan_meal_completions" c
        ON c."meal_id" = m."id" AND c."client_id" = a2."client_id"
      WHERE m."plan_id" = p."id"
        AND m."day_of_week" = (a2."date" - p."week_start_date")) AS completed
  FROM "client_plan_adherence" a2
  JOIN LATERAL (
    SELECT p."id", p."week_start_date"
    FROM "weekly_plans" p
    WHERE p."client_id" = a2."client_id"
      AND a2."date" >= p."week_start_date"
      AND a2."date" < p."week_start_date" + 7
    ORDER BY p."created_at" DESC
    LIMIT 1
  ) AS p ON true
) AS counted
WHERE a."id" = counted.adherence_id AND counted.total > 0;--> statement-breakpoint

-- Anything still unbackfilled has no meals left behind it — the plan it
-- reported on was deleted or rewritten empty. Deleted rather than given
-- invented counts: a fabricated percentage is exactly what this migration
-- exists to remove, and this is the same thing `recomputeDayAdherence` does
-- when a day loses its last meal. The day falls back to "nothing recorded",
-- which is what it now is.
DELETE FROM "client_plan_adherence" WHERE "completed_meals" IS NULL OR "total_meals" IS NULL;--> statement-breakpoint

-- `level` is derived from the same pair, so a row whose meals moved under it
-- since it was last written is realigned here rather than left disagreeing
-- with its own counts.
UPDATE "client_plan_adherence"
SET "level" = CASE
    WHEN "completed_meals" <= 0 THEN 'missed'
    WHEN "completed_meals" >= "total_meals" THEN 'full'
    ELSE 'partial'
  END
WHERE "level" <> CASE
    WHEN "completed_meals" <= 0 THEN 'missed'
    WHEN "completed_meals" >= "total_meals" THEN 'full'
    ELSE 'partial'
  END;--> statement-breakpoint

ALTER TABLE "client_plan_adherence" ALTER COLUMN "completed_meals" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "client_plan_adherence" ALTER COLUMN "total_meals" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "client_plan_adherence" ADD CONSTRAINT "client_plan_adherence_total_meals_check" CHECK ("client_plan_adherence"."total_meals" > 0);--> statement-breakpoint
ALTER TABLE "client_plan_adherence" ADD CONSTRAINT "client_plan_adherence_completed_meals_check" CHECK ("client_plan_adherence"."completed_meals" >= 0 AND "client_plan_adherence"."completed_meals" <= "client_plan_adherence"."total_meals");
