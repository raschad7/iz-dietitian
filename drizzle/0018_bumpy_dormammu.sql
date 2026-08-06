-- Catch-up migration: the meta snapshot had drifted behind the real schema.
--
-- `drizzle-kit generate` diffs the code against `meta/*_snapshot.json`, not
-- against a database. The snapshot was missing several changes that had already
-- been applied to every real database by earlier work — `clinic_working_hours`,
-- the three `practitioners` columns, the two `weekly_plans` snapshot columns,
-- and the removal of the `meal_plan*` tables — so the generated diff proposed to
-- apply all of them again.
--
-- As generated, every statement in here would have ERRORED against a database
-- that is already up to date, which is all of them:
--
--   CREATE TABLE "clinic_working_hours"   -- exists, 63 rows in dev
--   DROP TABLE "meal_plan_items"          -- already gone
--   ALTER TABLE "practitioners" ADD ...   -- columns already present
--
-- Every statement is therefore guarded, exactly as `0017` is and for the same
-- reason: this must be a no-op on a database that already has these changes and
-- correct on one that does not (CI, a fresh clone). The accompanying
-- `0018_snapshot.json` is left exactly as drizzle generated it — that file is
-- what makes the NEXT diff correct, and it is accurate.
--
-- The three DROPs are guarded rather than deleted on purpose. They are real:
-- the meal-plan tables were removed from the schema deliberately (see the
-- `drop-meal-plans-and-foods` branch), and a fresh database that somehow has
-- them still needs them gone.

CREATE TABLE IF NOT EXISTS "clinic_working_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"is_working" boolean NOT NULL,
	"open_minute" integer,
	"close_minute" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinic_working_hours_weekday_range" CHECK ("clinic_working_hours"."weekday" >= 0 AND "clinic_working_hours"."weekday" <= 6),
	CONSTRAINT "clinic_working_hours_valid_state" CHECK ((
        "clinic_working_hours"."is_working"
        AND "clinic_working_hours"."open_minute" IS NOT NULL
        AND "clinic_working_hours"."close_minute" IS NOT NULL
        AND "clinic_working_hours"."open_minute" >= 0
        AND "clinic_working_hours"."close_minute" <= 1440
        AND "clinic_working_hours"."open_minute" < "clinic_working_hours"."close_minute"
        AND "clinic_working_hours"."open_minute" % 15 = 0
        AND "clinic_working_hours"."close_minute" % 15 = 0
      ) OR (
        NOT "clinic_working_hours"."is_working"
        AND "clinic_working_hours"."open_minute" IS NULL
        AND "clinic_working_hours"."close_minute" IS NULL
      ))
);
--> statement-breakpoint
DROP TABLE IF EXISTS "meal_plan_items" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "meal_plan_meals" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "meal_plans" CASCADE;--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN IF NOT EXISTS "professional_title" text;--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN IF NOT EXISTS "phone" text;--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN IF NOT EXISTS "license_number" text;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD COLUMN IF NOT EXISTS "protein_target_snapshot" integer;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD COLUMN IF NOT EXISTS "goal_snapshot" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "clinic_working_hours" ADD CONSTRAINT "clinic_working_hours_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "clinic_working_hours_clinic_id_weekday_idx" ON "clinic_working_hours" USING btree ("clinic_id","weekday");
