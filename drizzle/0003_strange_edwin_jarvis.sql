CREATE TABLE "practitioners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"specialty" text,
	"color" text DEFAULT '#0ea5e9' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practitioners_color_hex" CHECK ("practitioners"."color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_minute" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_start_minute_in_day" CHECK ("appointments"."start_minute" >= 0 AND "appointments"."start_minute" < 1440),
	CONSTRAINT "appointments_duration_within_day" CHECK ("appointments"."duration_minutes" >= 15 AND "appointments"."start_minute" + "appointments"."duration_minutes" <= 1440)
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "color" text DEFAULT '#64748b' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "working_days" integer[] DEFAULT '{0,1,2,3,4}' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "open_minute" integer DEFAULT 480 NOT NULL;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "close_minute" integer DEFAULT 1080 NOT NULL;--> statement-breakpoint
ALTER TABLE "practitioners" ADD CONSTRAINT "practitioners_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioners" ADD CONSTRAINT "practitioners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "practitioners_clinic_id_idx" ON "practitioners" USING btree ("clinic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "practitioners_user_id_idx" ON "practitioners" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_client_id_date_idx" ON "appointments" USING btree ("client_id","date");--> statement-breakpoint
CREATE INDEX "appointments_clinic_id_date_idx" ON "appointments" USING btree ("clinic_id","date");--> statement-breakpoint
CREATE INDEX "appointments_practitioner_id_date_idx" ON "appointments" USING btree ("practitioner_id","date");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_color_hex" CHECK ("clients"."color" ~ '^#[0-9a-fA-F]{6}$');--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_hours_ordered" CHECK ("clinics"."open_minute" >= 0 AND "clinics"."close_minute" <= 1440 AND "clinics"."open_minute" < "clinics"."close_minute");