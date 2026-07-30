CREATE TABLE "appointment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"appointment_id" uuid,
	"kind" text NOT NULL,
	"preferred_date" date,
	"preferred_start_minute" integer,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_requests_kind" CHECK ("appointment_requests"."kind" IN ('new', 'reschedule', 'cancel')),
	CONSTRAINT "appointment_requests_status" CHECK ("appointment_requests"."status" IN ('pending', 'approved', 'declined', 'withdrawn')),
	CONSTRAINT "appointment_requests_appointment_matches_kind" CHECK (("appointment_requests"."kind" = 'new') = ("appointment_requests"."appointment_id" IS NULL)),
	CONSTRAINT "appointment_requests_preferred_matches_kind" CHECK (("appointment_requests"."kind" = 'cancel') = ("appointment_requests"."preferred_date" IS NULL AND "appointment_requests"."preferred_start_minute" IS NULL)),
	CONSTRAINT "appointment_requests_start_minute_in_day" CHECK ("appointment_requests"."preferred_start_minute" IS NULL OR ("appointment_requests"."preferred_start_minute" >= 0 AND "appointment_requests"."preferred_start_minute" < 1440))
);
--> statement-breakpoint
ALTER TABLE "appointment_requests" ADD CONSTRAINT "appointment_requests_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_requests" ADD CONSTRAINT "appointment_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_requests" ADD CONSTRAINT "appointment_requests_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_requests_clinic_id_status_idx" ON "appointment_requests" USING btree ("clinic_id","status","created_at");--> statement-breakpoint
CREATE INDEX "appointment_requests_client_id_idx" ON "appointment_requests" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_requests_open_per_appointment_idx" ON "appointment_requests" USING btree ("appointment_id") WHERE status = 'pending' AND appointment_id IS NOT NULL;