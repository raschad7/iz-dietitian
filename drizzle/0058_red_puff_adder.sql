CREATE TABLE "platform_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"monthly_price_minor" integer DEFAULT 0 NOT NULL,
	"seats" integer,
	"ai_plans_per_month" integer,
	"trial_days" integer,
	"rank" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_plans_price" CHECK ("platform_plans"."monthly_price_minor" >= 0),
	CONSTRAINT "platform_plans_seats" CHECK ("platform_plans"."seats" is null or "platform_plans"."seats" > 0),
	CONSTRAINT "platform_plans_ai" CHECK ("platform_plans"."ai_plans_per_month" is null or "platform_plans"."ai_plans_per_month" >= 0),
	CONSTRAINT "platform_plans_trial_days" CHECK ("platform_plans"."trial_days" is null or "platform_plans"."trial_days" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "platform_plans_key_idx" ON "platform_plans" USING btree ("key");