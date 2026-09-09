-- The athlete rate moves from the goal to the activity level.
--
-- `0056` seeded the rate under `sports` — `clients.goal`. That is what a client
-- *wants*, and the higher protein rate is about what they *do*: a woman lifting
-- four times a week whose goal is `weight_loss` was being dosed at 0.8 like
-- somebody sedentary, and she is precisely who the rate exists for.
--
-- It is keyed on `clients.activity_level` now — a required field, and already
-- what the calorie target reads. `active` and `very_active` both take whatever
-- figure was under `sports`, so no clinic's athlete moves: two rows exist so the
-- range she described ("١ ل٢٫٥ حسب اللعب والأيام والوقت") can be split later by
-- editing rather than by another migration.
--
-- ⚠ **This is not optional cleanup.** `nutritionRulesSchema` validates the map
-- against the case list and strips what it does not recognise, so a row left
-- holding `sports` has no athlete rate at all — every athlete would quietly
-- drop to the ordinary 0.8 with nothing on screen to say so.
--
-- A rename of the stored value rather than a reset to 1.7, because a clinic that
-- had already edited its athlete rate must keep the number it chose. The `?`
-- guard keeps the write off every row that never had the key.
UPDATE "clinic_nutrition_rules"
SET
  "protein_rates" = ("protein_rates" - 'sports')
    || jsonb_build_object(
         'active', "protein_rates" -> 'sports',
         'very_active', "protein_rates" -> 'sports'
       ),
  "updated_at" = now()
WHERE "protein_rates" ? 'sports';
