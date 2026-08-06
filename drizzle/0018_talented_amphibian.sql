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
CREATE TABLE "weekly_plan_meal_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"meal_id" uuid NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "weekly_plan_meal_completions" ADD CONSTRAINT "weekly_plan_meal_completions_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_meal_completions" ADD CONSTRAINT "weekly_plan_meal_completions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_meal_completions" ADD CONSTRAINT "weekly_plan_meal_completions_meal_id_weekly_plan_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."weekly_plan_meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "clinic_working_hours_clinic_id_weekday_idx" ON "clinic_working_hours" USING btree ("clinic_id","weekday");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_plan_meal_completions_client_meal_idx" ON "weekly_plan_meal_completions" USING btree ("client_id","meal_id");--> statement-breakpoint
CREATE INDEX "weekly_plan_meal_completions_clinic_id_idx" ON "weekly_plan_meal_completions" USING btree ("clinic_id");