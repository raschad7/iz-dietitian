# Clinic Onboarding and Profile — Design

Date: 2026-08-02
Branch: `on-boarding`

## Purpose

Every staff sign-up already creates a tenant-scoped clinic, but the clinic is
only a shell: its name is copied from the account holder, its schedule is a
single shared time range, and there is no clinic-profile interface. A newly
verified dietitian can therefore enter an operational dashboard without having
provided the contact information or per-day availability the clinic needs.

This design adds a required, resumable first-run setup and a permanent Profile
area where the same information remains editable. The verification-email work
discussed during planning was explicitly postponed and is not part of this
branch; Google OAuth remains unchanged.

The intended outcome is deliberately narrow: after setup, the clinic has valid
identity, contact, weekly-schedule, and owner-practitioner data. This work does
not add a product tour or lead the dietitian into a first client or appointment.

## Scope

In:

- A required three-step onboarding wizard for incomplete clinics.
- Required clinic name, phone, contact email, and address.
- Seven independently editable weekdays, each working or off, with one time
  range per working day.
- A staff professional profile with required name, title, specialization, and
  professional phone, plus an optional licence/registration number.
- A Profile item in staff navigation and a sectioned profile/settings page.
- Shared forms and validation between onboarding and Profile.
- Migration of the existing clinic-wide schedule to per-day schedule rows.
- Calendar and booking support for different hours on different days.
- Warning, but no cancellation, when a schedule edit conflicts with existing
  future appointments.
- Arabic/English, RTL/LTR, mobile/desktop, accessibility, and tenant-isolation
  coverage.

Out:

- Password sign-up and verification-email changes, postponed to a later branch.
- Client-portal screen or copy changes. Existing portal availability reads must
  continue to work through the shared schedule model, but the portal UI is not
  redesigned in this branch.
- Clinic logos and practitioner photos. Initials remain the fallback identity.
- Split shifts, breaks, holidays, date-specific closures, services, pricing,
  billing, or multiple clinic branches.
- A biography or other profile fields that no current staff workflow uses.
- Appointment-type or default-duration settings.
- A welcome screen, product tour, completion celebration, or post-onboarding
  “first success” workflow.

## Product decisions

- Setup is required because the collected contact and schedule data is needed
  to operate the existing booking workflow. There is no Skip action.
- The clinic is not created by onboarding. Signup already creates it; onboarding
  completes that existing tenant record.
- Progress is saved at the end of each step. Completion is a separate, explicit
  state set only after the entire clinic passes validation.
- There is one continuous opening range per working day. Split shifts are a
  future schedule-model extension, not a hidden part of this delivery.
- Schedule changes affect future booking validation. They never silently move,
  cancel, or rewrite existing appointments.
- Profile sections save independently after onboarding.

## Data model

### Clinic

`clinics` gains:

| Column | Shape | Rule |
| --- | --- | --- |
| `phone` | nullable text | Required before onboarding can complete. |
| `contact_email` | nullable text | Normalized and required before completion. |
| `address` | nullable text | Trimmed and required before completion. |
| `onboarding_completed_at` | nullable timestamptz | Null means the clinic is gated into onboarding. |

The contact columns remain nullable at the database level because signup must
be able to create a clinic before these values exist, and existing clinics
cannot be truthfully backfilled with invented contact data. The onboarding
completion service is the integrity boundary: it refuses to set
`onboarding_completed_at` until every required value is present and valid.

Onboarding state belongs to the clinic, not the user. If a second staff account
is added later, it must not be forced to repeat setup for an already configured
clinic.

### Weekly schedule

A new `clinic_working_hours` table stores exactly seven clinic-scoped day rows:

| Column | Shape |
| --- | --- |
| `id` | database-generated UUID primary key |
| `clinic_id` | required clinic foreign key, cascade on clinic delete |
| `weekday` | integer, 0 Sunday through 6 Saturday |
| `is_working` | required boolean |
| `open_minute` | nullable integer from local midnight |
| `close_minute` | nullable integer from local midnight |
| `created_at`, `updated_at` | timestamptz |

Constraints enforce one row per `(clinic_id, weekday)`, the weekday range,
15-minute boundaries, and coherent states:

- A working day requires both times and `open_minute < close_minute`.
- An off day has null active times.
- At least one working day is enforced by the schedule-writing transaction,
  because it is a seven-row aggregate rule rather than a row-local check.

The migration creates seven rows for every existing clinic. Days in the current
`working_days` array receive the existing clinic-wide opening and closing time;
other days become off. After application reads and writes move to the new table,
the legacy `working_days`, `open_minute`, and `close_minute` columns and their
ordering constraint are removed in the same feature migration.

New clinic creation seeds Sunday–Thursday as working 08:00–18:00 and Friday–
Saturday as off, matching the current Asia/Hebron default. These are editable
defaults, not completed onboarding data.

### Professional profile

`practitioners` already owns the appointment-facing identity and `specialty`, so
it remains the professional-profile boundary. It gains:

- `professional_title`
- `phone`
- `license_number`, nullable

The owner's row uses the existing `user_id` link. On first profile save, the
service finds a practitioner already linked to the staff user. For clinics
created before this feature, it may claim and link the earliest unlinked
practitioner—the row the current single-practitioner booking flow creates
lazily—so existing appointments remain attached to the same practitioner. If no
such row exists, it creates one.

Changing the professional name updates both `users.name` and
`practitioners.name` in one transaction so the header, profile, and appointment
identity cannot drift.

## Route and guard flow

The focused page lives at `/{locale}/onboarding`, outside the staff application
shell. It applies `requireStaffClinic()` directly but does not render the
sidebar.

The staff app layout loads the clinic's completion state after its authoritative
session guard:

- Incomplete clinic requesting `/{locale}/app/**` → redirect to
  `/{locale}/onboarding`.
- Completed clinic requesting onboarding → redirect to `/{locale}/app`.
- Anonymous or wrong-role access continues to use the existing role guards.

Email verification and Google OAuth may both land on `/app`; the app guard is
the single path that decides whether the session continues to onboarding or the
dashboard. No client-supplied redirect or clinic ID participates in this
decision.

Business logic lives in `src/features/clinic-profile/`. Route files only resolve
locale, apply guards, load data, and compose feature components.

## Onboarding UX

The flow starts immediately with real data entry. There is no welcome ceremony.
A compact labelled progress indicator always shows all three step names as well
as the current position.

### Step 1 — Clinic information

Required fields:

- Clinic name
- Phone
- Contact email
- Address

The action trims values, normalizes the email, and saves the clinic-scoped
record. A failed save preserves all entered values and leaves the user on this
step.

### Step 2 — Working hours

The page renders all seven days in locale order. Each day has a large,
keyboard-operable Working control. Working days reveal labelled opening and
closing selectors in 15-minute increments; off days show a calm “Off day” state
instead of disabled time fields.

Turning a day off and back on during the same edit session restores its previous
times. “Apply these hours to other working days” is a secondary, reversible
shortcut rather than an automatic overwrite.

On desktop, a day is one compact row. On small screens, each day becomes a
stacked card with full-width time controls and touch targets of at least 44px.

### Step 3 — Professional profile

Required fields:

- Full name, prefilled from signup
- Professional title
- Specialization
- Professional phone

Licence/registration number is optional. The primary action is “Complete setup
and open dashboard.” The completion action re-reads all three persisted sections
inside a transaction, validates the whole aggregate, and only then writes
`onboarding_completed_at`.

### Interaction and error behavior

- Back navigation never erases persisted progress or current client-side input.
- Continue explains that the current step will be saved.
- Server errors appear beside the responsible field where possible and in a
  concise form-level region otherwise.
- After a failed submission, focus moves to the first invalid field. The error
  summary uses `aria-live`; color is never the only signal.
- Submission controls disable while pending to prevent accidental double saves.
- Arabic and English use one logical-property layout. Directional icons mirror;
  phone numbers, email addresses, and time values retain LTR internal order.
- Motion is limited to the design system's short Q-arc transitions and respects
  reduced-motion preferences.

## Profile page

Staff navigation gains a direct Profile item at `/app/profile`. The page has
three focused sections:

1. Clinic information
2. Working hours
3. Professional profile

Desktop uses a local section rail beside the active form. Mobile uses a
horizontally scrollable tab list with an obvious active state. Each section has
its own heading, concise description, form, save state, and primary action. The
onboarding and Profile surfaces reuse the same field groups and Zod schemas;
they do not duplicate validation or markup.

The existing staff sidebar disappears below `md` and currently has no mobile
replacement. Because a sidebar-only Profile link would be unreachable on
mobile, this work adds a compact staff navigation menu to the existing header,
fed by the same navigation item list. This is a targeted accessibility fix for
the requested profile surface, not a redesign of the app shell.

Success feedback stays inline near the section action. The repository has no
toast primitive, and this feature does not introduce an unrelated notification
system.

## Schedule changes and the calendar

The schedule query returns a complete seven-day structure. Booking validation
selects the row matching the appointment date's clinic-local weekday and rejects
off days or ranges outside that day's hours.

Per-day hours change calendar geometry:

- Day view uses that day's opening and closing range and renders a clear closed
  state for an off day.
- Week view uses the visible week's earliest opening and latest closing as a
  shared vertical envelope so appointment blocks remain aligned. Each day
  visually marks time outside its own range as unavailable.
- Month view keeps its current compact presentation.

The internal client-request availability reader is adapted to the shared
schedule model so it does not regress, but no client-portal screen is changed.

Before Profile saves a new schedule, the server counts future appointments that
would sit on a newly off day or outside the proposed range. If the count is
non-zero, the form returns a warning and requires explicit confirmation. The
confirmed save changes only schedule rows. Existing appointments remain exactly
where they were; all later booking attempts use the new schedule.

## Verification-email diagnosis

Google OAuth proves the email with Google and therefore does not exercise the
password-sign-up verification mail path. Its success narrows, but does not solve,
the reported issue.

The implementation begins with evidence gathering under both supported mail
transports:

- `MAIL_TRANSPORT=console` must render a localized verification message and
  print its callback URL to the server terminal. It is not expected to deliver a
  real email.
- `MAIL_TRANSPORT=resend` must require `RESEND_API_KEY` and `EMAIL_FROM`, call
  Resend, and treat a returned Resend error as a failed send.

The investigation verifies signup, resend-verification, callback URL, locale,
and error behavior. Any code defect found is fixed with a regression test. If
the only issue is local console transport or missing deployment credentials,
the implementation reports the exact configuration requirement; it never
creates, guesses, prints, or commits a secret.

The UI must not claim that a real message was delivered when the configured
mailer failed. Production-facing errors remain safe and do not disclose whether
an arbitrary address is registered.

## Server actions and tenant safety

Feature actions follow one boundary:

```text
route/component → clinic-profile action → validation → scoped mutation → PostgreSQL
```

Every action obtains `clinicId` through `requireStaffClinic()` and obtains the
staff user ID from the validated session. Posted clinic or user IDs are never
trusted. Queries and updates include the clinic predicate even when a child row
ID is globally unique.

Step writes use upsert semantics for their one logical record. The seven
schedule rows are written in one transaction and duplicate submissions converge
on the same state. Timestamps update on successful mutation only.

## File boundaries

Expected ownership:

```text
src/features/clinic-profile/
  actions.ts
  mutations.ts
  queries.ts
  schema.ts
  types.ts
  components/
    onboarding-wizard.tsx
    clinic-information-fields.tsx
    weekly-hours-fields.tsx
    professional-profile-fields.tsx
    profile-page.tsx
    profile-section-nav.tsx

src/app/[locale]/onboarding/page.tsx
src/app/[locale]/app/profile/page.tsx
```

Reusable controls such as a switch or checkbox belong in `src/components/ui/`
only if the existing primitives cannot supply the required semantics. The forms
reuse Qiwam cards, buttons, inputs, labels, select fields, semantic tokens, and
logical direction properties.

## Testing and verification

Pure/schema tests:

- Required clinic and professional fields.
- Email normalization and phone acceptance.
- Seven-day completeness, at least one working day, 15-minute increments, and
  closing-after-opening validation.
- Arabic and English error-message keys.

Database/action tests:

- Existing clinic schedule migration produces seven correct rows.
- Step saves and final completion are clinic-scoped.
- Another clinic's practitioner or schedule row cannot be read or changed.
- Duplicate submissions do not create duplicate day or practitioner rows.
- A legacy lazy practitioner is linked without detaching its appointments.
- Incomplete clinics are redirected to onboarding; completed clinics cannot
  reopen it as a setup gate.
- Completion is refused if any required section is missing.
- Future-conflict warnings are accurate, confirmation saves the schedule, and
  existing appointments remain unchanged.
- New bookings obey the selected date's hours and reject off days.
- Verification signup and resend flows exercise console and mocked Resend
  success/failure paths without making a real network call.

UI verification:

- Complete and edit the flow in Arabic RTL and English LTR.
- Verify onboarding and Profile on mobile and desktop.
- Keyboard-only completion, visible focus, error focus, accessible labels, and
  reduced motion.
- Week calendar alignment when days have different ranges and its closed-day
  presentation.
- Run the Impeccable mechanical detector once over changed UI targets after the
  UI is complete.

Before handoff:

```bash
bun run lint
bun run typecheck
bun run test
```

## Delivery order

1. Diagnose the verification-email path and add the regression test or exact
   configuration finding.
2. Add and migrate clinic contact, per-day schedule, practitioner profile, and
   completion data.
3. Add clinic-profile queries, validation, mutations, and tenant tests.
4. Adapt booking and calendar consumers to the per-day schedule.
5. Build the shared field groups and required onboarding wizard.
6. Add the guard flow, Profile route, sidebar item, and mobile staff navigation.
7. Verify bilingual responsive rendering, accessibility, Impeccable checks, and
   the full repository suite.

## Known risks

**Variable day ranges affect the calendar more deeply than the old schema.** A
shared week envelope prevents columns from losing vertical alignment, while
per-day unavailable regions preserve the truth of each schedule.

**Contact columns are nullable before completion.** This is intentional for
signup and legacy migration. All business paths that require an operational
clinic must use the completed-clinic guard rather than assuming database
non-nullability.

**A real email provider requires external configuration.** Code can validate and
exercise the Resend integration, but it cannot deliver real mail without valid
credentials and a permitted sender domain. That boundary will be reported
plainly if it is the cause.

**Current product behavior assumes one practitioner per clinic.** Linking the
owner's existing lazy practitioner preserves that model and its appointments.
Adding multiple staff practitioners remains a separate feature.
