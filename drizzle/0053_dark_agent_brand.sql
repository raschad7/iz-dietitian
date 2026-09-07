-- The price list is a column on `clinic_services` now.
--
-- Dropped in its own migration, after 0052 has copied every row onto the
-- service it priced. A price with no service to belong to was only ever
-- meaningful against a list that lived in code.
DROP TABLE "clinic_service_prices" CASCADE;