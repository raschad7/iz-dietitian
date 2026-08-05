CREATE TABLE "client_check_ins" (
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
	CONSTRAINT "client_check_ins_water_range" CHECK ("client_check_ins"."water" is null or "client_check_ins"."water" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "client_check_ins" ADD CONSTRAINT "client_check_ins_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_check_ins" ADD CONSTRAINT "client_check_ins_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_check_ins_client_id_date_idx" ON "client_check_ins" USING btree ("client_id","date");--> statement-breakpoint
CREATE INDEX "client_check_ins_clinic_id_date_idx" ON "client_check_ins" USING btree ("clinic_id","date");