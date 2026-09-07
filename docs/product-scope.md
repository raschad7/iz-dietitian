# MVP product scope

Enzyme is a bilingual, RTL-first clinic management application for dietitians
and their clients. “MVP” means the first useful releasable product. It does not
mean the repository has only one small feature.

## Included now

The current repository includes:

- Staff and client authentication
- A clinic client roster and client profiles
- Appointment booking and calendar views
- A staff dashboard
- Nutrition profiles and AI-assisted weekly plans built from a canonical food
  catalog and an editable dish catalog, downloadable from the plan board as a
  client handout in PDF or Word, carrying each meal's portions and its
  alternatives
- **Clinical conditions the plan is built around** — pregnancy by trimester,
  breastfeeding, kidney disease, dialysis, epilepsy, diabetes and a dozen more —
  as a closed list the dietitian ticks rather than prose nothing can act on.
  They raise the suggested calorie target where the requirement genuinely rises,
  and reach the generator as stated constraints. A prescribed eating pattern
  (low carbohydrate, ketogenic, renal, low sodium…) sits beside them and governs
  the whole week. Where the dish catalogue cannot do what was asked — a
  therapeutic ketogenic ratio is weighed to the gram and Palestinian home
  cooking does not reach it — the generate card says so before the week is
  produced rather than presenting an approximation as the real thing
- **A note the dietitian writes to the client** with each week, shown in the
  portal and printed on the handout. Distinct from what she tells the model
  before generating and from what the model reports back to her afterwards:
  three pieces of prose, three readers, and only this one is ever shown to a
  patient
- A manual subscriber ledger: what each subscriber was billed, what they paid,
  and the balance between the two
- A per-clinic **list of services**, written by the dietitian in settings: its
  own names in both languages, its own terms in months, its own prices, and its
  own "first one free" rule. A clinic that starts selling a two-month
  subscription or a year adds a row; nothing about the list is in code but the
  three every clinic starts with. A price is never a key the ledger reads back:
  a recorded charge keeps the words and the amount it was entered with, so
  renaming a service or changing its price cannot rewrite an existing bill
- A **subscription freeze**. A subscriber travels or is ill, the clinic agrees
  not to count those days, and the term end moves out by exactly that many. The
  days are recorded as a range rather than as a new end date, so the register
  can say why a renewal moved; a freeze with no agreed length stays open and is
  closed when the subscriber comes back
- A free first of any service marked as such — the consultation, by default. The
  first one is recorded at zero and every one after it at the price above; the
  zero row is what makes the second chargeable, so a free visit is written down
  rather than skipped
- A client portal for appointments, profile details, and published plans,
  installable as a PWA
- Clinic onboarding, clinic and account settings, and in-app notifications
- A guided in-app user tour
- Body composition tracking across visits: readings entered by hand or read
  from a body composition analyser's PDF report, compared against the previous
  visit and against the first, and optionally shown to the client in their own
  portal
- Optional WhatsApp reminders, confirmations, replies, and portal credentials —
  reminders both on their own the night before and on a button the dietitian
  presses when she decides the moment is right
- Arabic and English interfaces with RTL support
- A platform area for whoever runs the deployment, above every clinic: a
  registry with a health verdict per practice and the reasons behind it, the
  account register, AI spend per clinic, subscription plans and what they come
  to, shared-catalog editing, one search across all three, and an audit log of
  every privileged action with the reason it was taken

## Product boundaries

This is practice-management software, not a general hospital information
system. The current architecture is intentionally focused on one clinic's daily
dietitian workflow and the matching client experience.

The repository does not currently provide:

- Payment processing. The subscriber ledger above records money the clinic
  already collected in the room; nothing in this app takes a card, contacts a
  bank, or moves funds. There is no gateway, and adding one is a separate
  decision from recording what was paid.
- Tax invoicing. A printed bill states what this clinic recorded billing and
  receiving; it carries no VAT number and no fiscal sequence, and it is not a
  substitute for whatever the clinic's accountant issues.
- Subscription billing for the platform itself. The plans in the platform area
  record what a clinic has agreed to pay and what that comes to; nothing charges
  a card, sends a dunning email, or cuts a clinic off when a trial ends. A clinic
  over its plan's limits keeps working and is shown as over them.
- Support impersonation. Nobody can sign in as a clinic or view its screens as
  its staff see them; the tenant boundary holds for the platform operator too.
- Insurance or claims workflows
- A public third-party API
- Native mobile applications
- General-purpose electronic medical records

Do not add one of these areas simply because a placeholder or navigation idea
mentions it. Confirm product scope before creating a new feature.

## MVP development rule

Prefer completing and validating the existing workflow over adding another
large module. A new feature should have a clear user, a concrete problem, and a
way to verify that it improves the first release.

For code boundaries, see [Architecture](architecture.md). For local setup, see
[Development](development.md).
