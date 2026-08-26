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
  catalog and an editable dish catalog
- A client portal for appointments, profile details, and published plans,
  installable as a PWA
- Clinic onboarding, clinic and account settings, and in-app notifications
- A guided in-app user tour
- Optional WhatsApp reminders, confirmations, replies, and portal credentials
- Arabic and English interfaces with RTL support

## Product boundaries

This is practice-management software, not a general hospital information
system. The current architecture is intentionally focused on one clinic's daily
dietitian workflow and the matching client experience.

The repository does not currently provide:

- Billing or payment processing
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
