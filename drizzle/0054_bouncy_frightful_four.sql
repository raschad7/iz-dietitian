CREATE TABLE "clinic_nutrition_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"protein_per_kg" real DEFAULT 1.6 NOT NULL,
	"protein_basis" text DEFAULT 'adjusted' NOT NULL,
	"bmr_source" text DEFAULT 'device' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinic_nutrition_rules_protein_basis" CHECK ("clinic_nutrition_rules"."protein_basis" IN ('actual', 'adjusted', 'lean')),
	CONSTRAINT "clinic_nutrition_rules_bmr_source" CHECK ("clinic_nutrition_rules"."bmr_source" IN ('device', 'formula')),
	CONSTRAINT "clinic_nutrition_rules_protein_per_kg_range" CHECK ("clinic_nutrition_rules"."protein_per_kg" >= 0.3 AND "clinic_nutrition_rules"."protein_per_kg" <= 3.0)
);
--> statement-breakpoint
ALTER TABLE "clinic_nutrition_rules" ADD CONSTRAINT "clinic_nutrition_rules_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_nutrition_rules_clinic_id_idx" ON "clinic_nutrition_rules" USING btree ("clinic_id");