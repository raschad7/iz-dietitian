ALTER TABLE "weekly_plan_meals" ADD COLUMN "nutrition_snapshot" jsonb;
--> statement-breakpoint
CREATE TABLE "catalog_food_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"locale" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid,
	"slug" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"normalized_name_ar" text NOT NULL,
	"normalized_name_en" text NOT NULL,
	"state" text NOT NULL,
	"category" text NOT NULL,
	"kcal" real NOT NULL,
	"protein" real NOT NULL,
	"fat" real NOT NULL,
	"carbs" real NOT NULL,
	"fiber" real,
	"sugar" real,
	"saturated_fat" real,
	"cholesterol" real,
	"sodium" real,
	"calcium" real,
	"iron" real,
	"potassium" real,
	"portion_grams" real,
	"portion_label" text,
	"verification_status" text DEFAULT 'provisional' NOT NULL,
	"source_type" text NOT NULL,
	"source_ref" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dish_ingredients" ALTER COLUMN "food_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dish_ingredients" ADD COLUMN "catalog_food_id" uuid;--> statement-breakpoint
ALTER TABLE "catalog_food_aliases" ADD CONSTRAINT "catalog_food_aliases_food_id_catalog_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."catalog_foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_foods" ADD CONSTRAINT "catalog_foods_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_food_aliases_food_name_idx" ON "catalog_food_aliases" USING btree ("food_id","normalized_name");--> statement-breakpoint
CREATE INDEX "catalog_food_aliases_normalized_idx" ON "catalog_food_aliases" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_foods_shared_slug_idx" ON "catalog_foods" USING btree ("slug") WHERE clinic_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_foods_clinic_slug_idx" ON "catalog_foods" USING btree ("clinic_id","slug") WHERE clinic_id is not null;--> statement-breakpoint
CREATE INDEX "catalog_foods_clinic_id_idx" ON "catalog_foods" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "catalog_foods_normalized_ar_idx" ON "catalog_foods" USING btree ("normalized_name_ar");--> statement-breakpoint
CREATE INDEX "catalog_foods_normalized_en_idx" ON "catalog_foods" USING btree ("normalized_name_en");--> statement-breakpoint
ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_catalog_food_id_catalog_foods_id_fk" FOREIGN KEY ("catalog_food_id") REFERENCES "public"."catalog_foods"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "catalog_food_portions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid NOT NULL,
	"label_ar" text NOT NULL,
	"label_en" text NOT NULL,
	"grams" real NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_food_portions_grams_positive" CHECK (grams > 0)
);
--> statement-breakpoint
ALTER TABLE "dish_ingredients" ADD COLUMN "portion_id" uuid;--> statement-breakpoint
ALTER TABLE "dish_ingredients" ADD COLUMN "portion_quantity" real;--> statement-breakpoint
ALTER TABLE "catalog_food_portions" ADD CONSTRAINT "catalog_food_portions_food_id_catalog_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."catalog_foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_food_portions_food_label_idx" ON "catalog_food_portions" USING btree ("food_id","label_en");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_food_portions_default_idx" ON "catalog_food_portions" USING btree ("food_id") WHERE is_default;--> statement-breakpoint
CREATE INDEX "catalog_food_portions_food_id_idx" ON "catalog_food_portions" USING btree ("food_id","sort_order");--> statement-breakpoint
ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_portion_id_catalog_food_portions_id_fk" FOREIGN KEY ("portion_id") REFERENCES "public"."catalog_food_portions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Data migration: carry the single stored household measure into a portion row.
--
-- `catalog_foods.portion_grams` / `.portion_label` held exactly one measure per
-- food and are dropped in 0030. Shared foods are rewritten from
-- data/catalog-foods.json by `db:seed:catalog`, but a clinic's own food is the
-- dietitian's record and is never in that file — so its unit has to be carried
-- across here or it is lost. A clinic food stores a bare unit key ("cup",
-- "tbsp"); anything else carried no usable unit and is left behind rather than
-- guessed at.
INSERT INTO "catalog_food_portions" ("food_id", "label_ar", "label_en", "grams", "is_default", "sort_order", "source_ref")
SELECT
  f."id",
  CASE lower(trim(f."portion_label"))
    WHEN 'loaf'  THEN 'رغيف'
    WHEN 'piece' THEN 'حبة'
    WHEN 'slice' THEN 'شريحة'
    WHEN 'cup'   THEN 'كوب'
    WHEN 'tbsp'  THEN 'ملعقة كبيرة'
    WHEN 'tsp'   THEN 'ملعقة صغيرة'
  END,
  CASE lower(trim(f."portion_label"))
    WHEN 'loaf'  THEN 'Loaf'
    WHEN 'piece' THEN 'Piece'
    WHEN 'slice' THEN 'Slice'
    WHEN 'cup'   THEN 'Cup'
    WHEN 'tbsp'  THEN 'Tablespoon'
    WHEN 'tsp'   THEN 'Teaspoon'
  END,
  f."portion_grams",
  true,
  0,
  f."source_ref"
FROM "catalog_foods" f
WHERE f."portion_label" IS NOT NULL
  AND f."portion_grams" IS NOT NULL
  AND f."portion_grams" > 0
  AND lower(trim(f."portion_label")) IN ('loaf', 'piece', 'slice', 'cup', 'tbsp', 'tsp')
ON CONFLICT ("food_id", "label_en") DO NOTHING;
--> statement-breakpoint
-- And the unit each saved recipe line was entered in. `quantity_grams` is
-- authoritative and is never rewritten here: only the record of how it was typed
-- is restored, and only where the saved weight per unit still agrees with the
-- portion, so no recipe can shift by a gram.
UPDATE "dish_ingredients" di
SET "portion_id" = p."id",
    "portion_quantity" = round((di."quantity_grams" / p."grams")::numeric, 3)
FROM "catalog_food_portions" p
WHERE p."food_id" = di."catalog_food_id"
  AND di."household_grams" IS NOT NULL
  AND di."household_grams" > 0
  AND abs(p."grams" - di."household_grams") < 0.05;
--> statement-breakpoint
-- Data migration: move each clinic's own foods out of the legacy `foods` table
-- and into the canonical catalog, before 0030 drops that table.
--
-- Shared USDA rows are NOT migrated here: the 91 canonical foods come from
-- data/catalog-foods.json via `db:seed:catalog`, which is the whole point of the
-- dataset being self-contained. A clinic's own food is different — it is the
-- dietitian's record, it is in no committed file, and losing it would be losing
-- data. So it is carried across here, and carried across as *theirs*: private to
-- the clinic, `clinic_entered`, and `needs_review` rather than verified. Migration
-- is not promotion.
--
-- The normalized-name expression mirrors `normalizeArabic`: strip tatweel and the
-- harakat block, fold the four alef forms to ا, collapse whitespace, lowercase.
INSERT INTO "catalog_foods" (
  "clinic_id", "slug", "name_ar", "name_en", "normalized_name_ar", "normalized_name_en",
  "state", "category",
  "kcal", "protein", "fat", "carbs",
  "fiber", "sugar", "saturated_fat", "cholesterol", "sodium", "calcium", "iron", "potassium",
  "verification_status", "source_type", "source_ref", "is_active"
)
SELECT
  f."clinic_id",
  -- The legacy row's own id: names change, this does not, so a re-run maps the
  -- same food to the same entry.
  'custom-' || f."id",
  coalesce(nullif(btrim(f."name_ar"), ''), btrim(f."description")),
  coalesce(nullif(btrim(f."description"), ''), btrim(f."name_ar")),
  lower(btrim(regexp_replace(translate(regexp_replace(coalesce(nullif(btrim(f."name_ar"), ''), btrim(f."description")), '[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭـ]', '', 'g'), 'أإآٱ', 'اااا'), '\s+', ' ', 'g'))),
  lower(btrim(regexp_replace(translate(regexp_replace(coalesce(nullif(btrim(f."description"), ''), btrim(f."name_ar")), '[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭـ]', '', 'g'), 'أإآٱ', 'اااا'), '\s+', ' ', 'g'))),
  -- The dietitian entered numbers, not a preparation. Claiming a state would be
  -- inventing a fact about their food.
  'prepared', 'other',
  f."kcal", f."protein", f."fat", f."carbs",
  f."fiber", f."sugar", f."saturated_fat", f."cholesterol", f."sodium", f."calcium", f."iron", f."potassium",
  'needs_review', 'clinic_entered', f."id"::text, true
FROM "foods" f
WHERE f."clinic_id" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Their synonyms come with them. Scope is inherited from the food, so the legacy
-- per-alias `clinic_id` is dropped rather than carried: it could only ever have
-- agreed with the food's.
INSERT INTO "catalog_food_aliases" ("food_id", "name", "normalized_name", "locale")
SELECT
  cf."id",
  btrim(a."name_ar"),
  lower(btrim(regexp_replace(translate(regexp_replace(btrim(a."name_ar"), '[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭـ]', '', 'g'), 'أإآٱ', 'اااا'), '\s+', ' ', 'g'))),
  'ar'
FROM "food_aliases" a
JOIN "foods" f ON f."id" = a."food_id"
JOIN "catalog_foods" cf ON cf."slug" = 'custom-' || f."id" AND cf."clinic_id" = f."clinic_id"
WHERE f."clinic_id" IS NOT NULL AND btrim(a."name_ar") <> ''
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- And every recipe line that used one now points at the catalog entry instead.
UPDATE "dish_ingredients" di
SET "catalog_food_id" = cf."id"
FROM "foods" f
JOIN "catalog_foods" cf ON cf."slug" = 'custom-' || f."id" AND cf."clinic_id" = f."clinic_id"
WHERE di."food_id" = f."id"
  AND di."catalog_food_id" IS NULL
  AND f."clinic_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "food_aliases" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "foods" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "food_aliases" CASCADE;--> statement-breakpoint
DROP TABLE "foods" CASCADE;--> statement-breakpoint
ALTER TABLE "dish_ingredients" DROP CONSTRAINT IF EXISTS "dish_ingredients_food_id_foods_id_fk";
--> statement-breakpoint
ALTER TABLE "dish_ingredients" ALTER COLUMN "catalog_food_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_foods" DROP COLUMN "portion_grams";--> statement-breakpoint
ALTER TABLE "catalog_foods" DROP COLUMN "portion_label";--> statement-breakpoint
ALTER TABLE "dish_ingredients" DROP COLUMN "food_id";--> statement-breakpoint
ALTER TABLE "dish_ingredients" DROP COLUMN "display_name_ar";--> statement-breakpoint
ALTER TABLE "dish_ingredients" DROP COLUMN "household_label";--> statement-breakpoint
ALTER TABLE "dish_ingredients" DROP COLUMN "household_grams";
