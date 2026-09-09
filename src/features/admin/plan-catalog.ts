import 'server-only';

import { cache } from 'react';
import { asc } from 'drizzle-orm';

import { db } from '@/db';
import { platformPlans } from '@/db/schema/platform-plans';

import { makePlanCatalog, type PlanCatalog, type PlatformPlan } from './plans';

/**
 * The one read of `platform_plans`, and the only place the rest of the app gets
 * a {@link PlanCatalog}.
 *
 * ## Why it is `cache`d
 *
 * The price list is read by nearly every admin screen and by the clinic
 * registry's own row builder, several times over in a single render — the
 * overview alone would issue it for the standing figures, for the queue's
 * health verdicts and for each clinic's price. React's `cache` makes it one
 * query per request and, more importantly, one *answer*: two figures on the
 * same page cannot disagree because they read the table a moment apart.
 *
 * It is deliberately **not** a module-level variable. That would cache across
 * requests, and the whole point of this change is that the operator edits the
 * price list at runtime — a package renamed at 10:00 must be renamed on the
 * next page load, not on the next deploy.
 *
 * ## `server-only`
 *
 * This module pulls in the postgres driver, and a client component importing it
 * would drag that into the browser bundle. That has happened once in this
 * feature already — see the note in `audit-rules.ts` — and neither `tsc` nor
 * eslint catches it. Components that need package data take it as a prop.
 */
export const loadPlanCatalog = cache(async (): Promise<PlanCatalog> => {
  const rows = await db
    .select()
    .from(platformPlans)
    .orderBy(asc(platformPlans.rank), asc(platformPlans.key));

  return makePlanCatalog(rows satisfies readonly PlatformPlan[]);
});
