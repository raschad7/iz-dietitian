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
export const PROFILE_TABS = ['nutrition', 'progress', 'account', 'security', 'billing'] as const;

export type ProfileTab = (typeof PROFILE_TABS)[number];
