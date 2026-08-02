DROP TABLE "meal_plan_items" CASCADE;--> statement-breakpoint
DROP TABLE "meal_plan_meals" CASCADE;--> statement-breakpoint
DROP TABLE "meal_plans" CASCADE;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD COLUMN "protein_target_snapshot" integer;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD COLUMN "goal_snapshot" text;