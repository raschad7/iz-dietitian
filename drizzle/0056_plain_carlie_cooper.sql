-- The clinic's protein rules become the practice they are actually used for.
--
-- Three changes, and only the third touches a row anybody has already saved.
--
-- The column defaults move from 1.6 g/kg on the adjusted weight to 0.8 on the
-- scale weight. 1.6 was never anyone's practice — it is an upper-band sports
-- figure that was hard-coded, and preserved as the default only so that
-- introducing the setting could not move a live target. The dietitian this app
-- is built for doses an ordinary client at `weight x 0.8`, which is why she
-- overrode the suggestion by hand on every record.
--
-- `protein_rates` is new and holds a rate for the kinds of client that are not
-- ordinary, keyed by goal or by condition. It defaults to '{}' rather than to
-- the shipped rates, because an empty map is a real answer — this clinic has no
-- special cases — and it must be reachable by clearing the boxes.

ALTER TABLE "clinic_nutrition_rules" ALTER COLUMN "protein_per_kg" SET DEFAULT 0.8;--> statement-breakpoint
ALTER TABLE "clinic_nutrition_rules" ALTER COLUMN "protein_basis" SET DEFAULT 'actual';--> statement-breakpoint
ALTER TABLE "clinic_nutrition_rules" ADD COLUMN "protein_rates" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
-- The one write against existing data, and it is deliberately narrow.
--
-- Only a row still holding *exactly* the old defaults is moved. Those are rows
-- where nobody ever opened the dialog: a clinic that chose 1.6 on the adjusted
-- weight would hold the same pair, but there is no such clinic — the setting
-- shipped days ago and the practice using it doses at 0.8. Any row that differs
-- in either field was edited by a person and is left exactly as it is.
--
-- The rates are seeded on the same rows and for the same reason: a clinic that
-- has never opened the dialog should find her table already in it, not three
-- empty boxes. Rows that were edited keep '{}' and dose every client at their
-- own chosen rate, which is what they did yesterday.
UPDATE "clinic_nutrition_rules"
SET
  "protein_per_kg" = 0.8,
  "protein_basis" = 'actual',
  "protein_rates" = '{"sports": 1.7, "kidney_disease": 0.6, "dialysis": 1.0}'::jsonb,
  "updated_at" = now()
WHERE "protein_per_kg" = 1.6
  AND "protein_basis" = 'adjusted'
  AND "protein_rates" = '{}'::jsonb;
