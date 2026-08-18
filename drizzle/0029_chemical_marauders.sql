CREATE TABLE "food_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"name_ar" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinic_hidden_dishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"dish_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "foods" ALTER COLUMN "fdc_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "clinic_id" uuid;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "name_ar" text;--> statement-breakpoint
ALTER TABLE "dish_ingredients" ADD COLUMN "display_name_ar" text;--> statement-breakpoint
ALTER TABLE "dish_ingredients" ADD COLUMN "household_label" text;--> statement-breakpoint
ALTER TABLE "dish_ingredients" ADD COLUMN "household_grams" real;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "clinic_id" uuid;--> statement-breakpoint
ALTER TABLE "food_aliases" ADD CONSTRAINT "food_aliases_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_aliases" ADD CONSTRAINT "food_aliases_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_hidden_dishes" ADD CONSTRAINT "clinic_hidden_dishes_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_hidden_dishes" ADD CONSTRAINT "clinic_hidden_dishes_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "food_aliases_clinic_name_idx" ON "food_aliases" USING btree ("clinic_id","name_ar");--> statement-breakpoint
CREATE UNIQUE INDEX "clinic_hidden_dishes_clinic_dish_idx" ON "clinic_hidden_dishes" USING btree ("clinic_id","dish_id");--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dishes_clinic_id_idx" ON "dishes" USING btree ("clinic_id");