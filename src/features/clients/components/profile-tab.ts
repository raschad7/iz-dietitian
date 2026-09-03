/**
 * The views of a client's record — the plain constant `ClientProfileTabs`
 * switches between, split into its own non-`'use client'` module.
 *
 * It used to live inside `client-profile-tabs.tsx`, which is a Client
 * Component. That worked as a *type* import everywhere (`ClientProfileProps`
 * only ever needed `type ProfileTab`), but `page.tsx` also needs the runtime
 * array itself, to validate `?tab=` with `isMember(PROFILE_TABS, ...)` — and a
 * Server Component importing a plain value export from a `'use client'`
 * module gets whichever client-reference stub the bundler replaced that
 * export with, not the actual array. `isMember` then calls `.includes` on a
 * stub and throws. Turbopack surfaced this the moment this file's array
 * changed shape; nothing about the bug was new, only which edit finally
 * reformed the module boundary that exposed it.
 *
 * A page or a query importing a runtime constant should never have to reach
 * into a `'use client'` file to get it — this module is what both sides
 * import from instead.
 */
export const PROFILE_TABS = [
  'nutrition',
  /*
    Second, because it is the second thing a record is opened for: what the
    numbers were last time. It is deliberately *not* merged into `progress` —
    that view is week-scoped and asks "did they follow the plan?", this one is
    visit-scoped across months and asks "did it work?". Two different time axes
    fighting over one screen is what keeping them apart avoids.
  */
  'measurements',
  'progress',
  'account',
  'security',
  'billing',
  /*
    The money. Last, because it is the view a record is opened for least often —
    and separate from `billing`, which is this template's key for the *plans*
    view and has nothing to do with what a subscriber owes. Renaming that one
    would break the `?tab=billing` links that already point at it.
  */
  'expenses',
] as const;

export type ProfileTab = (typeof PROFILE_TABS)[number];
