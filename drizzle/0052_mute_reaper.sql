CREATE TABLE "client_subscription_freezes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"reason" text,
	"recorded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_subscription_freezes_range_ordered" CHECK ("client_subscription_freezes"."ends_on" IS NULL OR "client_subscription_freezes"."ends_on" >= "client_subscription_freezes"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "clinic_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"kind" text NOT NULL,
	"duration_months" integer,
	"price_minor" integer,
	"first_free" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinic_services_price_non_negative" CHECK ("clinic_services"."price_minor" >= 0),
	CONSTRAINT "clinic_services_term_matches_kind" CHECK (("clinic_services"."kind" = 'subscription' AND "clinic_services"."duration_months" >= 1) OR ("clinic_services"."kind" = 'visit' AND "clinic_services"."duration_months" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "client_nutrition_profiles" ADD COLUMN "clinical_tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_nutrition_profiles" ADD COLUMN "diet_pattern" text;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD COLUMN "client_note" text;--> statement-breakpoint
ALTER TABLE "client_subscription_freezes" ADD CONSTRAINT "client_subscription_freezes_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_freezes" ADD CONSTRAINT "client_subscription_freezes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_subscription_freezes" ADD CONSTRAINT "client_subscription_freezes_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_services" ADD CONSTRAINT "clinic_services_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_subscription_freezes_clinic_id_client_id_idx" ON "client_subscription_freezes" USING btree ("clinic_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_services_clinic_id_key_idx" ON "clinic_services" USING btree ("clinic_id","key");--> statement-breakpoint
-- Every clinic starts owning the three services that used to be in code.
--
-- `DEFAULT_SERVICES` in `src/features/billing/services.ts` is the same list and
-- is what a clinic created from now on is seeded with; this is that seed applied
-- once to the clinics that already exist. The keys are deliberately the old
-- constant's keys, because `client_charges.service` already holds them: a
-- subscriber charged for `monthly` last March keeps pointing at the row that
-- says what a month is.
--
-- The names are the message catalogue's own Arabic and English strings, copied
-- at this moment rather than translated at render time. That is the whole point
-- of the table — a service's name is now the clinic's to change, and a clinic
-- that renames "استشارة" must not have it renamed back by a deploy.
--
-- Prices come across from `clinic_service_prices`, and a service that had no row
-- there stays null: "nobody has decided yet" is a state that has to survive the
-- move, or every unpriced service would arrive priced at zero.
INSERT INTO "clinic_services"
  ("clinic_id", "key", "name_ar", "name_en", "kind", "duration_months", "price_minor", "first_free", "sort_order")
SELECT
  c."id",
  s."key",
  s."name_ar",
  s."name_en",
  s."kind",
  s."duration_months",
  (SELECT p."amount_minor" FROM "clinic_service_prices" p WHERE p."clinic_id" = c."id" AND p."service" = s."key"),
  s."first_free",
  s."sort_order"
FROM "clinics" c
CROSS JOIN (VALUES
  ('monthly',      'اشتراك شهر واحد',    'One month subscription',   'subscription', 1::integer,    false, 0),
  ('quarterly',    'اشتراك ثلاثة أشهر',  'Three month subscription', 'subscription', 3::integer,    false, 1),
  ('consultation', 'استشارة',            'Consultation',             'visit',        NULL::integer, true,  2)
) AS s("key", "name_ar", "name_en", "kind", "duration_months", "first_free", "sort_order");
