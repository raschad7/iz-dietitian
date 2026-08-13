import { aliasedTable, and, asc, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { clientSeq } from '@/features/clients/seq';
import { appointmentRequests, appointments, clientRequests, clients } from '@/db/schema';

import {
  type ClientRequestKind,
  type ClientRequestStatus,
  type ClientRequestTopic,
  type RequestKind,
  type RequestStatus,
  type StaffAppointmentRequest,
  type StaffClientRequest,
} from './types';

/**
 * Every read behind the staff requests inbox.
 *
 * Imports nothing from Next.js, so these can be called from a test or a script
 * — the same rule `src/features/clients/queries.ts` and
 * `src/features/notifications/queries.ts` follow. `clinicId` is a required first
 * argument on everything, so forgetting the tenant scope is a type error rather
 * than a silent cross-clinic leak.
 *
 * These are the reads `src/features/notifications/queries.ts` deliberately does
 * not do: that module answers "how many things are waiting", for a bell. This
 * one answers "what exactly is being asked, and what is on the calendar now",
 * because its caller has to act on the answer.
 */

/**
 * The appointment the request is about, joined in.
 *
 * Aliased because the row is reached through `appointment_requests.appointment_id`
 * rather than through the client — the un-aliased table name is free for any
 * future join, and naming it here makes the `leftJoin` read as what it is.
 */
const requested = aliasedTable(appointments, 'requested_appointment');

/** The columns every appointment-request read projects, so the three below cannot drift. */
const APPOINTMENT_REQUEST_COLUMNS = {
  id: appointmentRequests.id,
  clientId: appointmentRequests.clientId,
  clientName: clients.fullName,
  // The client's colour, as the position it is built from — see clientSeq.
  clientSeq,
  kind: appointmentRequests.kind,
  status: appointmentRequests.status,
  preferredDate: appointmentRequests.preferredDate,
  preferredStartMinute: appointmentRequests.preferredStartMinute,
  note: appointmentRequests.note,
  createdAt: appointmentRequests.createdAt,
  updatedAt: appointmentRequests.updatedAt,
  appointmentId: requested.id,
  appointmentDate: requested.date,
  appointmentStartMinute: requested.startMinute,
  appointmentDurationMinutes: requested.durationMinutes,
} as const;

/**
 * Written out rather than derived from the projection above.
 *
 * Drizzle's column type carries the *column's* data type, not the nullability
 * the query gives it — every field of a `leftJoin`ed table is nullable however
 * the column is declared, and a mapped type over the selection silently claims
 * otherwise. Spelling it out is what makes the four appointment fields honest.
 */
type AppointmentRequestRow = {
  id: string;
  clientId: string;
  clientName: string;
  clientSeq: number;
  kind: string;
  status: string;
  preferredDate: string | null;
  preferredStartMinute: number | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  appointmentId: string | null;
  appointmentDate: string | null;
  appointmentStartMinute: number | null;
  appointmentDurationMinutes: number | null;
};

/**
 * `kind` and `status` are plain `text` guarded by check constraints, so their
 * unions are reasserted on the way out rather than trusted from the driver's
 * `string` — the same precedent as `src/features/portal/queries.ts`.
 */
function toStaffAppointmentRequest(row: AppointmentRequestRow): StaffAppointmentRequest {
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: row.clientName,
    clientSeq: row.clientSeq,
    kind: row.kind as RequestKind,
    status: row.status as RequestStatus,
    preferredDate: row.preferredDate,
    preferredStartMinute: row.preferredStartMinute,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // The four columns are written by one row or by none, so testing the id is
    // enough to know whether the join matched.
    appointment:
      row.appointmentId !== null &&
      row.appointmentDate !== null &&
      row.appointmentStartMinute !== null &&
      row.appointmentDurationMinutes !== null
        ? {
            id: row.appointmentId,
            date: row.appointmentDate,
            startMinute: row.appointmentStartMinute,
            durationMinutes: row.appointmentDurationMinutes,
          }
        : null,
  };
}

/**
 * The inbox itself: everything still waiting on the dietitian, oldest first.
 *
 * Oldest first rather than newest, unlike the bell's preview — the person who
 * has been waiting longest is the one to answer next. Backed by
 * `appointment_requests_clinic_id_status_idx`, which is `(clinic, status, created_at)`.
 *
 * `leftJoin` on the appointment, not `innerJoin`: a `new` request names none,
 * and an inner join would silently drop exactly the kind the inbox most needs
 * to show.
 */
export async function listPendingAppointmentRequests(clinicId: string): Promise<StaffAppointmentRequest[]> {
  const rows = await db
    .select(APPOINTMENT_REQUEST_COLUMNS)
    .from(appointmentRequests)
    .innerJoin(clients, eq(clients.id, appointmentRequests.clientId))
    .leftJoin(requested, eq(requested.id, appointmentRequests.appointmentId))
    .where(and(eq(appointmentRequests.clinicId, clinicId), eq(appointmentRequests.status, 'pending')))
    .orderBy(asc(appointmentRequests.createdAt));

  return rows.map(toStaffAppointmentRequest);
}

/**
 * What has already been answered, newest first.
 *
 * `withdrawn` is included: a client taking a request back is part of the story
 * of that request, and hiding it would leave the dietitian wondering where an
 * item they saw this morning went.
 */
export async function listAnsweredAppointmentRequests(
  clinicId: string,
  limit: number,
): Promise<StaffAppointmentRequest[]> {
  const rows = await db
    .select(APPOINTMENT_REQUEST_COLUMNS)
    .from(appointmentRequests)
    .innerJoin(clients, eq(clients.id, appointmentRequests.clientId))
    .leftJoin(requested, eq(requested.id, appointmentRequests.appointmentId))
    .where(
      and(
        eq(appointmentRequests.clinicId, clinicId),
        inArray(appointmentRequests.status, ['approved', 'declined', 'withdrawn']),
      ),
    )
    .orderBy(desc(appointmentRequests.updatedAt))
    .limit(limit);

  return rows.map(toStaffAppointmentRequest);
}

/**
 * One request, with the appointment it concerns and the clinic it belongs to.
 *
 * Scoped by clinic in the `WHERE`, so a request id from another tenant matches
 * no row rather than being caught by a check after the fact. This is what an
 * approval reads before it books, since the id arrives from the browser.
 */
export async function getAppointmentRequest(
  clinicId: string,
  requestId: string,
): Promise<StaffAppointmentRequest | null> {
  const [row] = await db
    .select(APPOINTMENT_REQUEST_COLUMNS)
    .from(appointmentRequests)
    .innerJoin(clients, eq(clients.id, appointmentRequests.clientId))
    .leftJoin(requested, eq(requested.id, appointmentRequests.appointmentId))
    .where(and(eq(appointmentRequests.id, requestId), eq(appointmentRequests.clinicId, clinicId)))
    .limit(1);

  return row ? toStaffAppointmentRequest(row) : null;
}

/**
 * Requests about the client's own record, oldest first.
 *
 * Nothing read this table on the staff side before — the portal wrote to it and
 * the rows sat there. Backed by `client_requests_clinic_id_status_idx`.
 */
export async function listPendingClientRequests(clinicId: string): Promise<StaffClientRequest[]> {
  const rows = await db
    .select({
      id: clientRequests.id,
      clientId: clientRequests.clientId,
      clientName: clients.fullName,
      clientSeq,
      kind: clientRequests.kind,
      topic: clientRequests.topic,
      message: clientRequests.message,
      status: clientRequests.status,
      createdAt: clientRequests.createdAt,
      updatedAt: clientRequests.updatedAt,
    })
    .from(clientRequests)
    .innerJoin(clients, eq(clients.id, clientRequests.clientId))
    .where(and(eq(clientRequests.clinicId, clinicId), eq(clientRequests.status, 'pending')))
    .orderBy(asc(clientRequests.createdAt));

  return rows.map((row) => ({
    ...row,
    kind: row.kind as ClientRequestKind,
    topic: row.topic as ClientRequestTopic | null,
    status: row.status as ClientRequestStatus,
  }));
}
