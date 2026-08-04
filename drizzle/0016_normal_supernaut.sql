CREATE TABLE "client_plan_adherence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"date" date NOT NULL,
	"level" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_plan_adherence_level_check" CHECK ("client_plan_adherence"."level" IN ('missed', 'partial', 'full'))
);
--> statement-breakpoint
ALTER TABLE "client_plan_adherence" ADD CONSTRAINT "client_plan_adherence_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_plan_adherence" ADD CONSTRAINT "client_plan_adherence_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_plan_adherence_client_id_date_idx" ON "client_plan_adherence" USING btree ("client_id","date");--> statement-breakpoint
CREATE INDEX "client_plan_adherence_clinic_id_date_idx" ON "client_plan_adherence" USING btree ("clinic_id","date");