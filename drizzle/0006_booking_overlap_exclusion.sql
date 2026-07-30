-- Custom migration (drizzle-kit generate --custom): one practitioner cannot be
-- in two places at once, enforced by PostgreSQL rather than by the application.
--
-- Drizzle's pg-core has no EXCLUDE builder, so this is written by hand. It is
-- NOT a hand-edited generated migration — drizzle-kit produced the empty file
-- and journalled it, and it diffs against the snapshots in drizzle/meta/, never
-- against the live database. A constraint it has never seen is therefore never
-- dropped by a later `db:generate`. Equally, it will never be recreated: this
-- file is the only thing that installs it, so `db:reset` needs it to stay here.
--
-- Why the database and not just `validateBooking`: the server re-runs the
-- validator inside the write transaction, but two staff members clicking the
-- same slot in the same instant both read a clean set of rows before either
-- writes. Only a constraint can arbitrate that, and the actions treat the
-- resulting 23P01 as an ordinary rejection with a translated message.

-- Required for a GiST index over uuid and date, which are btree types. Core
-- PostgreSQL ships it as a bundled extension; no download.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- `int4range(start, start + duration)` is half-open — `[start, end)` — so an
-- appointment ending at 10:00 and one starting at 10:00 do NOT conflict, which
-- is exactly rule 4's "touching edges do not overlap". `&&` is range overlap.
--
-- Scoped by practitioner_id, per the decision that overlap is per practitioner:
-- two practitioners may see two different clients at the same time. clinic_id is
-- not in the key because a practitioner belongs to exactly one clinic, so
-- practitioner_id already implies it.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_practitioner_no_overlap"
  EXCLUDE USING gist (
    "practitioner_id" WITH =,
    "date" WITH =,
    int4range("start_minute", "start_minute" + "duration_minutes") WITH &&
  );
