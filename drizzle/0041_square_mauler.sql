ALTER TABLE "dishes" ADD COLUMN "source" text DEFAULT 'home' NOT NULL;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "effort" text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "cost" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "occasion" text DEFAULT 'everyday' NOT NULL;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "is_side" boolean DEFAULT false NOT NULL;