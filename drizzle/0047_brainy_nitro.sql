CREATE TABLE "client_measurement_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"measurement_id" uuid NOT NULL,
	"clinic_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"content" text NOT NULL,
	"extracted_text" text,
	"parser_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_measurement_files_size_positive" CHECK ("client_measurement_files"."byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "client_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"measured_on" date NOT NULL,
	"measured_at_minute" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"appointment_id" uuid,
	"weight_kg" real NOT NULL,
	"height_cm" real,
	"body_fat_percent" real,
	"fat_mass_kg" real,
	"fat_free_mass_kg" real,
	"muscle_mass_kg" real,
	"bone_mass_kg" real,
	"total_body_water_kg" real,
	"total_body_water_percent" real,
	"visceral_fat_rating" real,
	"basal_metabolic_rate_kcal" integer,
	"metabolic_age" integer,
	"waist_cm" real,
	"hip_cm" real,
	"device_label" text,
	"device_subject_id" text,
	"raw_values" jsonb,
	"note" text,
	"recorded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_measurements_weight_positive" CHECK ("client_measurements"."weight_kg" > 0),
	CONSTRAINT "client_measurements_minute_range" CHECK ("client_measurements"."measured_at_minute" between 0 and 1439),
	CONSTRAINT "client_measurements_height_positive" CHECK ("client_measurements"."height_cm" is null or "client_measurements"."height_cm" > 0),
	CONSTRAINT "client_measurements_body_fat_range" CHECK ("client_measurements"."body_fat_percent" is null or "client_measurements"."body_fat_percent" between 0 and 100),
	CONSTRAINT "client_measurements_body_water_range" CHECK ("client_measurements"."total_body_water_percent" is null or "client_measurements"."total_body_water_percent" between 0 and 100),
	CONSTRAINT "client_measurements_source_known" CHECK ("client_measurements"."source" in ('manual', 'device'))
);
--> statement-breakpoint
ALTER TABLE "client_measurement_files" ADD CONSTRAINT "client_measurement_files_measurement_id_client_measurements_id_fk" FOREIGN KEY ("measurement_id") REFERENCES "public"."client_measurements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_measurement_files" ADD CONSTRAINT "client_measurement_files_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_measurements" ADD CONSTRAINT "client_measurements_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_measurements" ADD CONSTRAINT "client_measurements_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_measurements" ADD CONSTRAINT "client_measurements_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_measurements" ADD CONSTRAINT "client_measurements_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_measurement_files_measurement_id_idx" ON "client_measurement_files" USING btree ("measurement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_measurements_client_id_measured_at_idx" ON "client_measurements" USING btree ("client_id","measured_on","measured_at_minute");--> statement-breakpoint
CREATE INDEX "client_measurements_client_id_measured_at_desc_idx" ON "client_measurements" USING btree ("client_id","measured_on" DESC NULLS LAST,"measured_at_minute" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "client_measurements_clinic_id_measured_on_idx" ON "client_measurements" USING btree ("clinic_id","measured_on");