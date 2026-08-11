-- `DROP ... IF EXISTS`, and the second drop, make this re-runnable.
--
-- This migration was applied once, then regenerated with a later timestamp by
-- the `Resolve conflicts` merge — so on every database that ran the first form,
-- drizzle sees a newer `when` than it has recorded and runs it a second time.
-- Unguarded, `ADD CONSTRAINT "appointment_requests_note_when_no_time"` fails
-- there with 42710, taking the whole migration transaction down with it and
-- blocking 0022 behind it. Re-adding both constraints reaches the same end
-- state from either starting point: a database that has never seen this
-- migration (where `preferred_matches_kind` still holds its 0000 definition and
-- `note_when_no_time` does not exist), and one that already has both.
ALTER TABLE "appointment_requests" DROP CONSTRAINT IF EXISTS "appointment_requests_preferred_matches_kind";--> statement-breakpoint
ALTER TABLE "appointment_requests" DROP CONSTRAINT IF EXISTS "appointment_requests_note_when_no_time";--> statement-breakpoint
ALTER TABLE "appointment_requests" ADD CONSTRAINT "appointment_requests_note_when_no_time" CHECK ("appointment_requests"."kind" <> 'new' OR "appointment_requests"."preferred_date" IS NOT NULL OR "appointment_requests"."note" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "appointment_requests" ADD CONSTRAINT "appointment_requests_preferred_matches_kind" CHECK (CASE "appointment_requests"."kind"
        WHEN 'cancel' THEN "appointment_requests"."preferred_date" IS NULL AND "appointment_requests"."preferred_start_minute" IS NULL
        WHEN 'reschedule' THEN "appointment_requests"."preferred_date" IS NOT NULL AND "appointment_requests"."preferred_start_minute" IS NOT NULL
        ELSE ("appointment_requests"."preferred_date" IS NULL) = ("appointment_requests"."preferred_start_minute" IS NULL)
      END);