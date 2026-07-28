CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"search_name" text NOT NULL,
	"phone" text,
	"email" text,
	"user_id" text,
	"assigned_dietitian_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"preferred_locale" text DEFAULT 'ar' NOT NULL,
	"date_of_birth" date,
	"sex" text,
	"height_cm" integer,
	"goal" text,
	"activity_level" text,
	"medical_notes" text,
	"allergies" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_assigned_dietitian_id_users_id_fk" FOREIGN KEY ("assigned_dietitian_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_user_id_idx" ON "clients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "clients_status_idx" ON "clients" USING btree ("status");