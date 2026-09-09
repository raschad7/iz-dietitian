-- The four tiers that lived in `src/features/admin/plans.ts` as a frozen array,
-- moved into the table that replaces it.
--
-- A data migration rather than a seed script, because this is not sample data:
-- every existing clinic already holds one of these keys in `clinics.plan`, and a
-- deployment that ran the DDL without this would come up with an empty price
-- list and price every one of them at nothing. The prices, seats and AI
-- allowances below are exactly the constants being retired.
--
-- `trial_days` is new. Nothing set `clinics.trial_ends_at` at sign-up, so no
-- clinic that ever signed up had a deadline; 14 days is the value sign-up now
-- counts forward from, and the operator can change it like any other field.
--
-- Idempotent on `key`, so re-running it cannot double the price list, and
-- `DO NOTHING` rather than an upsert so it can never overwrite a price the
-- operator has since edited.

INSERT INTO "platform_plans"
  ("key", "name_en", "name_ar", "monthly_price_minor", "seats", "ai_plans_per_month", "trial_days", "rank")
VALUES
  ('trial',   'Trial',   'تجريبي', 0,     2,    20,   14,   0),
  ('starter', 'Starter', 'مبتدئ',  12000, 2,    60,   NULL, 1),
  ('pro',     'Pro',     'احترافي', 24000, 5,    200,  NULL, 2),
  ('clinic',  'Clinic',  'عيادة',   48000, NULL, NULL, NULL, 3)
ON CONFLICT ("key") DO NOTHING;
