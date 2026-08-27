CREATE TABLE "clinic_service_prices" (
	"clinic_id" uuid NOT NULL,
	"service" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinic_service_prices_clinic_id_service_pk" PRIMARY KEY("clinic_id","service"),
	CONSTRAINT "clinic_service_prices_amount_non_negative" CHECK ("clinic_service_prices"."amount_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "clinic_service_prices" ADD CONSTRAINT "clinic_service_prices_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;