DROP INDEX "meal_plan_meals_plan_id_idx";--> statement-breakpoint
ALTER TABLE "meal_plan_meals" ADD COLUMN "day_of_week" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "meal_plan_meals_plan_id_idx" ON "meal_plan_meals" USING btree ("plan_id","day_of_week","time_of_day");