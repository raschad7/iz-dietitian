ALTER TABLE "weekly_plan_generations" ADD COLUMN "pass" text DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_plan_meal_ingredients" ADD COLUMN "is_free" boolean DEFAULT false NOT NULL;--> statement-breakpoint

DROP INDEX "catalog_food_portions_food_label_idx";--> statement-breakpoint
ALTER TABLE "catalog_food_portions" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "catalog_food_portions" ADD COLUMN "step" real;--> statement-breakpoint
ALTER TABLE "catalog_food_portions" ADD COLUMN "max_per_meal" real;--> statement-breakpoint
ALTER TABLE "catalog_food_portions" ADD COLUMN "evidence_kind" text;--> statement-breakpoint
ALTER TABLE "catalog_food_portions" ADD COLUMN "evidence_source" text;--> statement-breakpoint
ALTER TABLE "catalog_food_portions" ADD COLUMN "evidence_date" text;--> statement-breakpoint
ALTER TABLE "catalog_food_portions" ADD COLUMN "evidence_samples" integer;--> statement-breakpoint
ALTER TABLE "catalog_food_portions" ADD COLUMN "evidence_min_grams" real;--> statement-breakpoint
ALTER TABLE "catalog_food_portions" ADD COLUMN "evidence_max_grams" real;--> statement-breakpoint
ALTER TABLE "catalog_food_portions" ADD COLUMN "review_status" text DEFAULT 'needs_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_food_portions" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "catalog_food_portions" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint

-- The key is added nullable, backfilled, and only then made NOT NULL: the column
-- is the new identity of rows that already exist, so it cannot arrive with one.
-- `label_en` is a closed vocabulary written only by `FAMILY_ROWS` and
-- `CUSTOM_UNIT_LABELS`, which is what makes this mapping total.
UPDATE "catalog_food_portions" SET "key" = CASE "label_en"
  WHEN 'Cup' THEN 'cup'
  WHEN 'Half cup' THEN 'half-cup'
  WHEN 'Quarter cup' THEN 'quarter-cup'
  WHEN 'Tablespoon' THEN 'level-tablespoon'
  WHEN 'Teaspoon' THEN 'teaspoon'
  WHEN 'Loaf' THEN 'loaf'
  WHEN 'Half loaf' THEN 'half-loaf'
  WHEN 'Slice' THEN 'slice'
  WHEN 'Piece' THEN 'piece'
  WHEN 'Container' THEN 'container'
  WHEN 'Leaf' THEN 'leaf'
  ELSE 'piece'
END;--> statement-breakpoint

-- The one spoon in the catalog a person wrote. It is labelled `Tablespoon` like
-- the twenty-one USDA level spoons, but its `source_ref` says what it actually
-- is: "one heaped eating spoon of cooked rice. Not a level measuring tablespoon."
-- Re-pointing it here rather than letting the seed delete and re-create it keeps
-- the row identity, and with it every recipe line that already references it.
UPDATE "catalog_food_portions" SET "key" = 'heaped-spoon'
  WHERE "label_en" = 'Tablespoon' AND "source_ref" IS NOT NULL;--> statement-breakpoint

-- Every derived row is a real measurement of a real object -- USDA's levelled
-- 15 ml spoon, its cup, its medium apple. Saying so is what lets them keep
-- working while being visibly unreviewed, rather than being trusted by silence.
UPDATE "catalog_food_portions"
  SET "evidence_kind" = CASE WHEN "source_ref" IS NULL THEN 'usda_measure' ELSE 'local_measurement' END,
      "evidence_source" = COALESCE("source_ref", 'USDA FoodData Central, SR Legacy');--> statement-breakpoint

ALTER TABLE "catalog_food_portions" ALTER COLUMN "key" SET NOT NULL;--> statement-breakpoint

-- `counted_as` pointed at a `label_en`. Joined rather than re-mapped so it lands
-- on exactly the key its own portion row just took -- including rice's heaped
-- spoon, which the CASE above would have called a level tablespoon.
UPDATE "catalog_foods" f SET "counted_as" = p."key"
  FROM "catalog_food_portions" p
  WHERE p."food_id" = f."id" AND p."label_en" = f."counted_as" AND f."counted_as" IS NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX "catalog_food_portions_food_key_idx" ON "catalog_food_portions" USING btree ("food_id","key");--> statement-breakpoint

ALTER TABLE "dish_ingredients" ADD COLUMN "component_key" text;--> statement-breakpoint
ALTER TABLE "dish_ingredients" ADD COLUMN "component_name_ar" text;--> statement-breakpoint
ALTER TABLE "dish_ingredients" ADD COLUMN "component_name_en" text;--> statement-breakpoint
ALTER TABLE "weekly_plan_meal_ingredients" ADD COLUMN "component_key" text;--> statement-breakpoint
ALTER TABLE "weekly_plan_meal_ingredients" ADD COLUMN "component_name_ar" text;--> statement-breakpoint
ALTER TABLE "weekly_plan_meal_ingredients" ADD COLUMN "component_name_en" text;
