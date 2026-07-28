CREATE TABLE "clinics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "clients_status_idx";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "clinic_id" uuid;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "clinic_id" uuid;--> statement-breakpoint
DO $$
DECLARE
  staff RECORD;
  new_clinic uuid;
  fallback_clinic uuid;
BEGIN
  -- Every existing staff account becomes its own clinic, matching the rule
  -- applied to sign-ups from here on.
  FOR staff IN SELECT "id", "name", "email" FROM "users" WHERE "role" = 'staff' ORDER BY "created_at" LOOP
    INSERT INTO "clinics" ("name")
    VALUES (COALESCE(NULLIF(staff."name", ''), staff."email"))
    RETURNING "id" INTO new_clinic;

    UPDATE "users" SET "clinic_id" = new_clinic WHERE "id" = staff."id";

    IF fallback_clinic IS NULL THEN
      fallback_clinic := new_clinic;
    END IF;
  END LOOP;

  -- Clients created before this migration have no recorded owner — the column
  -- did not exist, so there is no correct per-account split to recover. They all
  -- go to the oldest staff account's clinic, the only deterministic choice.
  -- Reassign by hand afterwards if that is wrong.
  IF EXISTS (SELECT 1 FROM "clients" WHERE "clinic_id" IS NULL) THEN
    IF fallback_clinic IS NULL THEN
      INSERT INTO "clinics" ("name") VALUES ('Legacy clinic') RETURNING "id" INTO fallback_clinic;
    END IF;

    UPDATE "clients" SET "clinic_id" = fallback_clinic WHERE "clinic_id" IS NULL;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "clinic_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_clinic_id_status_idx" ON "clients" USING btree ("clinic_id","status");
