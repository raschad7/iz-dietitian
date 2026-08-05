# Linking the client portal to the dietitian's dashboard

Date: 2026-08-05

## The problem

Neither end worked. The portal could not ask, and the dashboard could not
answer.

**Correction to an earlier draft of this document,** which claimed clients could
already file requests. They could not. The portal redesign (commit `9e36490`)
made appointments read-only on the reasoning that the dietitian books them:
`requestAppointmentAction` was replaced by a stub returning `errors.invalid` for
every input, `/portal/appointments/request` redirected to the appointments list,
and no screen linked to it. `RequestForm`, `loadRequestPage` and
`createAppointmentRequest` were left intact beneath — the capability was
switched off, not dismantled — so the rows in `appointment_requests` were all
from before the change. This design turns it back on; see *Restoring the ask*
below.

The staff half was the other failure. A row in `appointment_requests` is read
exactly once, by `listPendingRequestsPreview`, and rendered as a read-only line
in the notifications feed that links to the calendar day it asks about.
`notifications-list.tsx` says so outright:

> There is no staff-side requests inbox yet, so a request lands on the day it
> asks about.

So the dietitian sees "Hiba asked for Tuesday 10:00", is dropped onto Tuesday,
and has to book it by hand — with nothing tying that booking back to the
request, which stays `pending` for ever. `client_requests` (a correction to the
record, or an account closure) is worse off still: nothing on the staff side
reads that table at all.

Two of the asks in the brief turn out to be already true, and the audit that
establishes this is part of the work:

| Ask | State |
| --- | --- |
| Client can ask for an appointment | **Switched off** — stub action, redirected route, no link |
| Only the dietitian sets the time | Portal offered a slot picker; removed |
| Requests appear to the doctor | Read-only preview; no way to act |
| Doctor accepts/declines, sets the time | **Missing entirely** |
| Approved booking shows on the calendar | Follows from approving through the booking path |
| Patient info shows in the portal | Already correct — see below |
| Doctor sees all weekly plans, patient only their own | Already correct — see below |

**Patient information.** `getPortalClient` projects the same `clients` row staff
edit — name, phone, date of birth, height, goal, activity level, allergies,
conditions, medications, care note — onto `PortalProfile`, and `loadProfilePage`
renders it. There is one row, so the two areas cannot disagree. The client
cannot write to it, by design: a correction is a `client_requests` row, because
a client who silently edits their own height invalidates the calorie target
computed from it. That half is built. The half that is missing is the clinic
being able to *see* the correction — which this design adds.

**Weekly plans.** `getPublishedBoard(context.id)` is scoped to the caller's own
`clients.id` and to `status = 'published'`, so a client sees their own plan and
only after it is published; a draft is the dietitian's working copy. Staff read
through `/app/weekly-plans`, which is clinic-scoped, not client-scoped. Nothing
to change. This design does not touch it.

So the work is two things: **let the client ask again, and give the dietitian an
inbox that can act.**

## Restoring the ask

Three edits, and no new machinery — the switched-off comment in `actions.ts`
predicted exactly this: "if clients are ever given the ability back, it is the
guard below that lifts, not this whole path that gets rebuilt."

1. `requestAppointmentAction` regains a body: parse with the existing
   `appointmentRequestSchema` discriminated union, re-resolve the client from
   the session (never from the form), call `createAppointmentRequest`, then
   redirect to the appointments list where the new request is listed as pending.
   That listing is the confirmation, and a truer one than a message.
2. `/portal/appointments/request` renders `RequestForm` from `loadRequestPage`
   again instead of redirecting. Which days have room stays server-computed by
   `src/features/portal/slots.ts`, so availability has one implementation and no
   client learns when other clients are booked.
3. The appointments page gains one control — "Request an appointment" — which is
   replaced by a "waiting for your dietitian" line while a `new` request is
   already open, since the mutation refuses a second one for the same day and a
   button leading to a rejection is worse than a sentence.

Rescheduling and cancelling stay off at the UI level. The action and the inbox
both handle all three kinds, so restoring their entry points later is a link,
not a feature — but the brief asked for booking, and adding controls to the
redesigned read-only appointment card is a change to that redesign rather than
to this feature.

**Nothing on the client's side books anything.** The row carries no authority
over the calendar until the dietitian approves it, which is the whole point of
the table and is why the form's copy says the dietitian confirms.

### The client names a day; the dietitian names the hour

The form offers no time picker, and `appointmentRequestSchema` has no field for
one — the absence is the enforcement, so a crafted post cannot smuggle a time
in.

The reasoning is that the client cannot see what the choice depends on: how long
the consultation needs, what else is on that day, and who else is waiting. The
dietitian can see all three. A client who wants a particular hour says so in the
note, which is a preference the dietitian reads rather than a slot they are
handed.

This makes the approve dialog the only place an appointment time is ever chosen,
which is what the whole design was already shaped around — it opens on the
requested day, at the clinic's opening hour, and the dietitian moves it.

Two consequences worth stating:

- **`preferred_start_minute` is written null** by every request filed under this
  rule. The column stays, because rows filed before it still carry an hour and
  the inbox renders those, so every screen showing a requested time handles both
  shapes.
- **The check constraint needed no migration.** It reads
  `(kind = 'cancel') = (preferred_date IS NULL AND preferred_start_minute IS NULL)`,
  so a `new` request satisfies it on the strength of its date alone.
- **Availability is now a day-level question.** `createAppointmentRequest` asks
  "does this day have any start time this client could be given?" rather than
  "is 10:00 free?" — a closed day, a full one, or one they already have an
  appointment on is refused, because each would be an inbox item the dietitian
  could only decline.

## Design

A new staff-side feature, `src/features/requests/`, following the layering the
repository already uses (`queries` → `mutations` → `actions` → `components`,
with nothing from Next.js below `actions.ts` so the logic stays callable from a
script or a test).

### Approving is a booking, not a status change

This is the load-bearing decision, and the schema header for
`appointment_requests` already prescribes it:

> Approving one is a booking written through the ordinary path in
> `src/features/booking/`, where every rule is applied against the calendar as
> it stands at that moment — not as it stood when the client asked.

So approval calls the existing booking mutations rather than reimplementing any
of their rules:

| Request kind | Approval does |
| --- | --- |
| `new` | `createAppointment` at the time the dietitian confirms |
| `reschedule` | `updateAppointment` moving the named appointment |
| `cancel` | `deleteAppointment` |

Every constraint the calendar enforces — opening hours, overlap, one
appointment per client per day, the `EXCLUDE USING gist` guard — therefore
applies to an approval automatically, and cannot drift, because there is only
one copy of them. A request for a slot that was taken while it sat in the inbox
is rejected with the specific reason the calendar would have given.

It is also what puts the booking on the calendar: `createAppointment` writes the
`appointments` row that `listAppointments` reads, so an approved request appears
in the day, week and month views with no second write and no syncing step. The
action revalidates `/app/calendar` as a layout for that reason.

**The dietitian sets the time.** The approve dialog opens pre-filled with what
the client asked for and lets it be changed before confirming — that is what
makes this an answer rather than a rubber stamp. A client asking for 10:00 and
being given 10:30 is the ordinary case, not an exception.

### Ordering, and which way a failure falls

The booking is written first; the request is marked `approved` second. The two
cannot share a transaction because the booking mutations open their own, and
that is worth keeping — they are the code path the calendar itself uses.

The consequence is a window where the appointment exists and the request is
still `pending`. That is the correct direction to fail: the dietitian sees the
request again and can dismiss it, and the client has their booking. The reverse
— a request marked answered with no appointment behind it — would be a client
told they are booked when they are not, so the ordering is deliberate rather
than incidental.

### Client requests

The same inbox carries `client_requests`, which no staff screen reads today. A
correction is `resolved` or `declined`; nothing about the client's record is
written by resolving one. The row is the message; a person at the clinic acts on
it and marks it answered. Deletion requests are surfaced but never execute a
deletion — that stays a deliberate act elsewhere.

### Where it lives

- **`/app/requests`** — the inbox proper, with room for the approve dialog, the
  client's note, and answered history.
- **The dashboard** — a panel at the top of the working column listing pending
  requests with accept and decline inline. It renders **only when something is
  pending**, so on a quiet morning the dashboard is exactly the page it is
  today. That matters: the dashboard's stated constraint is that it fits one
  screen at `xl` and does not scroll, and a permanently-present empty card would
  spend the page's most valuable row on the word "nothing".
- **The rail** — a Requests entry, since this is now a screen a working day is
  spent on.
- **The notifications feed** — its rows and its "Review N requests" button point
  at the inbox instead of the calendar day, and the comment quoted above is
  removed because it stops being true.

### Telling the client

Approving books, and a booked appointment already has a WhatsApp path
(`notifyAppointmentBooked` / `Rescheduled` / `Cancelled`), sent from the action
layer inside `after()` so the response never waits on the gateway. The inbox
reuses those directly, so an approval reaches the client the same way a booking
made in the calendar does. A decline sends nothing today; the client sees the
status change in their own portal, which already renders request status.

## The chain, end to end

1. Client taps **Request an appointment** in the portal, picks a **day** — no
   time — and sends it, with an optional note.
2. `createAppointmentRequest` writes a `pending` row with a null start minute.
   Nothing is held.
3. It appears for the dietitian in three places: the dashboard panel, the
   `/app/requests` inbox, and the notifications feed.
4. **Accept** opens a dialog on the requested day at the clinic's opening hour.
   **This is where the appointment's time is chosen**, and the dietitian sets it
   before confirming.
5. Confirming books through `createAppointment`, so the appointment lands on the
   calendar and the request is marked approved.
6. The client is told over WhatsApp, and sees the request as approved in their
   own portal.

**Decline** stops at step 4 and writes nothing to the calendar.

## Out of scope

- Tests. The user is writing them.
- Reschedule and cancel entry points in the portal UI — see *Restoring the ask*.
- Any change to weekly-plan scoping or to the portal's profile screen — both
  audited above and already correct.
- Executing account deletions.
- Notifying a client of a decline over WhatsApp.
