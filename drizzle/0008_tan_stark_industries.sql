CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"client_id" uuid,
	"appointment_id" uuid,
	"direction" text NOT NULL,
	"kind" text NOT NULL,
	"chat_id" text NOT NULL,
	"phone" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"gateway_message_id" text,
	"error" text,
	"dedupe_key" text NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"session_name" text NOT NULL,
	"session_id" text,
	"webhook_id" text,
	"status" text DEFAULT 'not_connected' NOT NULL,
	"phone" text,
	"last_error" text,
	"reminders_enabled" boolean DEFAULT true NOT NULL,
	"reminder_lead_minutes" integer DEFAULT 1440 NOT NULL,
	"confirmations_enabled" boolean DEFAULT true NOT NULL,
	"connected_at" timestamp with time zone,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_settings_reminder_lead_minutes_range" CHECK ("whatsapp_settings"."reminder_lead_minutes" >= 15 AND "whatsapp_settings"."reminder_lead_minutes" <= 10080)
);
--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_settings" ADD CONSTRAINT "whatsapp_settings_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_messages_clinic_id_dedupe_key_idx" ON "whatsapp_messages" USING btree ("clinic_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_clinic_id_created_at_idx" ON "whatsapp_messages" USING btree ("clinic_id","created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_client_id_created_at_idx" ON "whatsapp_messages" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_gateway_message_id_idx" ON "whatsapp_messages" USING btree ("gateway_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_settings_clinic_id_idx" ON "whatsapp_settings" USING btree ("clinic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_settings_session_name_idx" ON "whatsapp_settings" USING btree ("session_name");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_settings_session_id_idx" ON "whatsapp_settings" USING btree ("session_id");