CREATE TABLE "weekly_plan_meal_sides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_id" uuid NOT NULL,
	"dish_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weekly_plan_meal_sides" ADD CONSTRAINT "weekly_plan_meal_sides_meal_id_weekly_plan_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."weekly_plan_meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_meal_sides" ADD CONSTRAINT "weekly_plan_meal_sides_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "weekly_plan_meal_sides_meal_id_idx" ON "weekly_plan_meal_sides" USING btree ("meal_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_plan_meal_sides_dish_idx" ON "weekly_plan_meal_sides" USING btree ("meal_id","dish_id");