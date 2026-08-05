-- Catch-up migration for 0013_skinny_sandman and 0014_acoustic_doctor_strange.
--
-- Those two carry `when` timestamps in _journal.json that are *older* than
-- 0012_hard_goliath's:
--
--   0012_hard_goliath              2026-08-02T20:15:09Z
--   0013_skinny_sandman            2026-08-02T11:33:32Z  <-- 9h before 0012
--   0014_acoustic_doctor_strange   2026-08-02T13:15:22Z  <-- 7h before 0012
--
-- drizzle's migrator only applies migrations newer than the newest one already
-- recorded, so any database that had already applied 0012 skipped both — while
-- still reporting success. The visible symptom is a runtime crash on any client
-- page: `column "photo_url" does not exist`.
--
-- Correcting the timestamps does not repair those databases: they went on to
-- apply 0015 and 0016, so the newest recorded timestamp is later than any value
-- 0013/0014 could be given while staying in order. Only a *new* migration runs
-- everywhere, which is what this is.
--
-- Every statement is idempotent, so this is a no-op on databases that applied
-- 0013 and 0014 normally (a fresh database, or CI).

CREATE TABLE IF NOT EXISTS "client_check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"date" date NOT NULL,
	"score" integer NOT NULL,
	"energy" integer,
	"sleep" integer,
	"appetite" integer,
	"mood" integer,
	"water" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_check_ins_score_range" CHECK ("client_check_ins"."score" between 0 and 10),
	CONSTRAINT "client_check_ins_energy_range" CHECK ("client_check_ins"."energy" is null or "client_check_ins"."energy" between 1 and 5),
	CONSTRAINT "client_check_ins_sleep_range" CHECK ("client_check_ins"."sleep" is null or "client_check_ins"."sleep" between 1 and 5),
	CONSTRAINT "client_check_ins_appetite_range" CHECK ("client_check_ins"."appetite" is null or "client_check_ins"."appetite" between 1 and 5),
	CONSTRAINT "client_check_ins_mood_range" CHECK ("client_check_ins"."mood" is null or "client_check_ins"."mood" between 1 and 5),
	CONSTRAINT "client_check_ins_water_range" CHECK ("client_check_ins"."water" is null or "client_check_ins"."water" between 1 and 5),
	CONSTRAINT "client_check_ins_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "client_check_ins_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "client_check_ins_client_id_date_idx" ON "client_check_ins" USING btree ("client_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_check_ins_clinic_id_date_idx" ON "client_check_ins" USING btree ("clinic_id","date");--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "photo_url" text;
