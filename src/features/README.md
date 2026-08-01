# Features

One folder per feature. The current areas are `auth`, `booking`, `clients`,
`dashboard`, `meal-plans`, `portal`, `weekly-plans`, and `whatsapp`. See
[`docs/architecture.md`](../../docs/architecture.md#major-feature-areas) for
their responsibilities and [`docs/product-scope.md`](../../docs/product-scope.md)
before adding another product area.

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
