ALTER TABLE "appointment_requests" DROP CONSTRAINT "appointment_requests_preferred_matches_kind";--> statement-breakpoint
ALTER TABLE "appointment_requests" ADD CONSTRAINT "appointment_requests_note_when_no_time" CHECK ("appointment_requests"."kind" <> 'new' OR "appointment_requests"."preferred_date" IS NOT NULL OR "appointment_requests"."note" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "appointment_requests" ADD CONSTRAINT "appointment_requests_preferred_matches_kind" CHECK (CASE "appointment_requests"."kind"
        WHEN 'cancel' THEN "appointment_requests"."preferred_date" IS NULL AND "appointment_requests"."preferred_start_minute" IS NULL
        WHEN 'reschedule' THEN "appointment_requests"."preferred_date" IS NOT NULL AND "appointment_requests"."preferred_start_minute" IS NOT NULL
        ELSE ("appointment_requests"."preferred_date" IS NULL) = ("appointment_requests"."preferred_start_minute" IS NULL)
      END);