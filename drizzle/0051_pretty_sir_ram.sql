CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"target_label" text NOT NULL,
	"outcome" text DEFAULT 'ok' NOT NULL,
	"reason" text,
	"before" jsonb,
	"after" jsonb,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "plan" text DEFAULT 'trial' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "plan_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "plan_price_minor" integer;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_log_created_at_idx" ON "admin_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_log_target_idx" ON "admin_audit_log" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_log_action_idx" ON "admin_audit_log" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_log_actor_idx" ON "admin_audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_plan_price_non_negative" CHECK ("clinics"."plan_price_minor" >= 0);