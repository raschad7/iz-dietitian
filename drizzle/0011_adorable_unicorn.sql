CREATE TABLE "clinic_working_hours" (
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
ALTER TABLE "clinics" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "professional_title" text;--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN "license_number" text;--> statement-breakpoint
ALTER TABLE "clinic_working_hours" ADD CONSTRAINT "clinic_working_hours_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_working_hours_clinic_id_weekday_idx" ON "clinic_working_hours" USING btree ("clinic_id","weekday");--> statement-breakpoint
INSERT INTO "clinic_working_hours" ("clinic_id", "weekday", "is_working", "open_minute", "close_minute")
SELECT
	"clinics"."id",
	"day"."weekday",
	"day"."weekday" = ANY("clinics"."working_days"),
	CASE WHEN "day"."weekday" = ANY("clinics"."working_days") THEN "clinics"."open_minute" END,
	CASE WHEN "day"."weekday" = ANY("clinics"."working_days") THEN "clinics"."close_minute" END
FROM "clinics"
CROSS JOIN generate_series(0, 6) AS "day"("weekday");
