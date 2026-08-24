CREATE TABLE "weekly_plan_meal_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_id" uuid NOT NULL,
	"catalog_food_id" uuid NOT NULL,
	"quantity_grams" real NOT NULL,
	"portion_id" uuid,
	"portion_quantity" real,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dish_ingredients" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_plan_meal_ingredients" ADD CONSTRAINT "weekly_plan_meal_ingredients_meal_id_weekly_plan_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."weekly_plan_meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_meal_ingredients" ADD CONSTRAINT "weekly_plan_meal_ingredients_catalog_food_id_catalog_foods_id_fk" FOREIGN KEY ("catalog_food_id") REFERENCES "public"."catalog_foods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_meal_ingredients" ADD CONSTRAINT "weekly_plan_meal_ingredients_portion_id_catalog_food_portions_id_fk" FOREIGN KEY ("portion_id") REFERENCES "public"."catalog_food_portions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "weekly_plan_meal_ingredients_meal_id_idx" ON "weekly_plan_meal_ingredients" USING btree ("meal_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_plan_meal_ingredients_food_idx" ON "weekly_plan_meal_ingredients" USING btree ("meal_id","catalog_food_id");