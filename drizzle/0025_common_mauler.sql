ALTER TABLE "client_nutrition_profiles" ADD COLUMN "sweet_drinks_frequency" text;--> statement-breakpoint
ALTER TABLE "client_nutrition_profiles" ADD COLUMN "red_meat_frequency" text;--> statement-breakpoint
ALTER TABLE "client_nutrition_profiles" ADD COLUMN "chicken_frequency" text;--> statement-breakpoint
ALTER TABLE "client_nutrition_profiles" ADD COLUMN "fish_frequency" text;--> statement-breakpoint
-- The old answers, copied into every column they used to cover.
--
-- `caffeine_frequency` was "caffeine and sweetened drinks" and
-- `protein_food_frequency` was "meat, chicken and fish": one answer standing for
-- several foods. Splitting the columns without this leaves a record answered
-- before today reading as blank for the new ones, which is a different claim
-- from what the sheet actually says — it says the same answer for each.
UPDATE "client_nutrition_profiles" SET "sweet_drinks_frequency" = "caffeine_frequency" WHERE "caffeine_frequency" IS NOT NULL;--> statement-breakpoint
UPDATE "client_nutrition_profiles" SET "red_meat_frequency" = "protein_food_frequency", "chicken_frequency" = "protein_food_frequency", "fish_frequency" = "protein_food_frequency" WHERE "protein_food_frequency" IS NOT NULL;
