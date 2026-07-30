# Features

One folder per feature. Currently holds `auth/` (sign-in, sign-up, passkeys,
password policy, rate limiting), `clients/` (the clinic's patient roster,
including portal credential issuing and username transliteration), `booking/`
(the calendar), `meal-plans/` and `whatsapp/` (appointment reminders and
confirmations through a self-hosted gateway). `payments/` and the rest get added
here as they are built.

Each feature owns its slice end to end:

    src/features/<feature>/
      actions.ts      # "use server" — every mutation for this feature
      queries.ts      # read paths (server-only)
      schema.ts       # Zod input schemas, drizzle-zod derived where possible
      components/     # UI, composed by route files under src/app/[locale]/

Rules:

- Business logic lives here, never in `src/app/**` route files. Route files
  resolve params, call a guard, and render feature components.
- Database tables for a feature go in `src/db/schema/<feature>.ts` and are
  re-exported from `src/db/schema/index.ts`.
- Server actions only. There is no REST or tRPC layer to add an endpoint to.
  The one exception is a caller that is not a browser: the WhatsApp gateway's
  webhook and the reminder tick are HTTP routes under `src/app/api/whatsapp/`,
  each authenticated by a shared secret. A new endpoint needs that kind of
  justification, not just convenience.
