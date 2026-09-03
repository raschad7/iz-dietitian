CREATE TABLE "weekly_plan_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"clinic_id" uuid NOT NULL,
	"model" text NOT NULL,
	"verdict" text NOT NULL,
	"summary_ar" text NOT NULL,
	"findings" jsonb NOT NULL,
	"checks" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weekly_plan_reviews" ADD CONSTRAINT "weekly_plan_reviews_plan_id_weekly_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."weekly_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_reviews" ADD CONSTRAINT "weekly_plan_reviews_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "weekly_plan_reviews_plan_id_idx" ON "weekly_plan_reviews" USING btree ("plan_id","created_at");