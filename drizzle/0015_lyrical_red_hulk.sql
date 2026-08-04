CREATE TABLE "client_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"topic" text,
	"message" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_requests_kind" CHECK ("client_requests"."kind" IN ('data_update', 'account_deletion')),
	CONSTRAINT "client_requests_status" CHECK ("client_requests"."status" IN ('pending', 'resolved', 'declined', 'withdrawn')),
	CONSTRAINT "client_requests_topic_matches_kind" CHECK (("client_requests"."kind" = 'data_update') = ("client_requests"."topic" IS NOT NULL)),
	CONSTRAINT "client_requests_topic" CHECK ("client_requests"."topic" IS NULL OR "client_requests"."topic" IN ('basic', 'health', 'contact', 'other')),
	CONSTRAINT "client_requests_message_required" CHECK ("client_requests"."kind" <> 'data_update' OR ("client_requests"."message" IS NOT NULL AND length(btrim("client_requests"."message")) > 0))
);
--> statement-breakpoint
CREATE TABLE "client_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"notify_appointment_reminder" boolean DEFAULT true NOT NULL,
	"notify_check_in_reminder" boolean DEFAULT true NOT NULL,
	"notify_plan_update" boolean DEFAULT true NOT NULL,
	"notify_clinic_message" boolean DEFAULT true NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"preferred_contact" text DEFAULT 'whatsapp' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_settings_theme" CHECK ("client_settings"."theme" IN ('system', 'light', 'dark')),
	CONSTRAINT "client_settings_preferred_contact" CHECK ("client_settings"."preferred_contact" IN ('whatsapp', 'phone', 'email'))
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "conditions" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "medications" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "care_note" text;--> statement-breakpoint
ALTER TABLE "client_nutrition_profiles" ADD COLUMN "share_weight_with_client" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_requests" ADD CONSTRAINT "client_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_settings" ADD CONSTRAINT "client_settings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_requests_clinic_id_status_idx" ON "client_requests" USING btree ("clinic_id","status","created_at");--> statement-breakpoint
CREATE INDEX "client_requests_client_id_idx" ON "client_requests" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "client_requests_open_per_kind_idx" ON "client_requests" USING btree ("client_id","kind") WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "client_settings_client_id_idx" ON "client_settings" USING btree ("client_id");