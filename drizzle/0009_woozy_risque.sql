CREATE TABLE "dish_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dish_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"quantity_grams" real NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"meal_types" text[] NOT NULL,
	"tags" text[] NOT NULL,
	"allergen_tags" text[] NOT NULL,
	"base_serving_label" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_nutrition_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"weight_kg" real,
	"daily_kcal_target" integer,
	"protein_target_grams" integer,
	"allergen_tags" text[] DEFAULT '{}' NOT NULL,
	"preferences" text,
	"dislikes" text,
	"permanent_instructions" text,
	"meal_schedule" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_plan_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid,
	"clinic_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"instruction" text,
	"model" text NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"duration_ms" integer,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_plan_meal_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_id" uuid NOT NULL,
	"dish_id" uuid NOT NULL,
	"servings" real DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_plan_meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"slot_key" text NOT NULL,
	"label" text NOT NULL,
	"time_of_day" time NOT NULL,
	"budget_kcal" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"dish_id" uuid,
	"servings" real DEFAULT 1 NOT NULL,
	"rationale_ar" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"week_start_date" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"week_instructions" text,
	"kcal_target_snapshot" integer NOT NULL,
	"generated_by" text DEFAULT 'ai' NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_nutrition_profiles" ADD CONSTRAINT "client_nutrition_profiles_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_nutrition_profiles" ADD CONSTRAINT "client_nutrition_profiles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_generations" ADD CONSTRAINT "weekly_plan_generations_plan_id_weekly_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."weekly_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_generations" ADD CONSTRAINT "weekly_plan_generations_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_meal_options" ADD CONSTRAINT "weekly_plan_meal_options_meal_id_weekly_plan_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."weekly_plan_meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_meal_options" ADD CONSTRAINT "weekly_plan_meal_options_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_meals" ADD CONSTRAINT "weekly_plan_meals_plan_id_weekly_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."weekly_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_meals" ADD CONSTRAINT "weekly_plan_meals_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dish_ingredients_dish_id_idx" ON "dish_ingredients" USING btree ("dish_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "dishes_slug_idx" ON "dishes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "dishes_is_active_idx" ON "dishes" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "client_nutrition_profiles_client_id_idx" ON "client_nutrition_profiles" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_nutrition_profiles_clinic_id_idx" ON "client_nutrition_profiles" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "weekly_plan_generations_clinic_id_idx" ON "weekly_plan_generations" USING btree ("clinic_id","created_at");--> statement-breakpoint
CREATE INDEX "weekly_plan_meal_options_meal_id_idx" ON "weekly_plan_meal_options" USING btree ("meal_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_plan_meal_options_dish_idx" ON "weekly_plan_meal_options" USING btree ("meal_id","dish_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_plan_meals_slot_idx" ON "weekly_plan_meals" USING btree ("plan_id","day_of_week","slot_key");--> statement-breakpoint
CREATE INDEX "weekly_plan_meals_plan_id_idx" ON "weekly_plan_meals" USING btree ("plan_id","day_of_week","time_of_day");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_plans_published_week_idx" ON "weekly_plans" USING btree ("client_id","week_start_date") WHERE status = 'published';--> statement-breakpoint
CREATE INDEX "weekly_plans_client_id_week_idx" ON "weekly_plans" USING btree ("client_id","week_start_date");--> statement-breakpoint
CREATE INDEX "weekly_plans_clinic_id_idx" ON "weekly_plans" USING btree ("clinic_id");