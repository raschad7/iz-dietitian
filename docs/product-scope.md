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
<<<<<<< HEAD
- Nutrition profiles and AI-assisted weekly plans based on a controlled dish
  catalog
- A manual subscriber ledger: what each subscriber was billed, what they paid,
  and the balance between the two
- A per-clinic price list for the services on offer, set by the dietitian in
  settings. It prices a new charge and is never a key the ledger reads back: a
  recorded charge keeps the words and the amount it was entered with, so
  changing a price cannot rewrite an existing bill
- A free first consultation for every subscriber. The first one is recorded at
  zero and every one after it at the price above; the zero row is what makes
  the second chargeable, so a free visit is written down rather than skipped
- A client portal for appointments, profile details, and published plans
=======
- Nutrition profiles and AI-assisted weekly plans built from a canonical food
  catalog and an editable dish catalog
- A client portal for appointments, profile details, and published plans,
  installable as a PWA
- Clinic onboarding, clinic and account settings, and in-app notifications
- A guided in-app user tour
>>>>>>> 2fc96edfef517fccc430d17ca971bb46fc56007a
- Optional WhatsApp reminders, confirmations, replies, and portal credentials
- Arabic and English interfaces with RTL support

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
