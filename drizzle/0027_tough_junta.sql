ALTER TABLE "client_nutrition_profiles" ADD COLUMN "vegetables_frequency" text;--> statement-breakpoint
ALTER TABLE "client_nutrition_profiles" ADD COLUMN "fruit_frequency" text;--> statement-breakpoint
-- The old answer, copied into both columns it used to cover.
--
-- `produce_frequency` was "vegetables and fruit": one answer standing for two
-- foods. See migration 0025, which split caffeine and the three meats the same
-- way and for the same reason.
UPDATE "client_nutrition_profiles" SET "vegetables_frequency" = "produce_frequency", "fruit_frequency" = "produce_frequency" WHERE "produce_frequency" IS NOT NULL;
