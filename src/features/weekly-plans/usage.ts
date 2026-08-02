import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { weeklyPlanMeals, weeklyPlans } from '@/db/schema';

/**
 * What this client has eaten lately.
 *
 * Answers the question a dietitian is actually asking at the moment they reach for
 * a dish — "have they just had this?" — at the moment they reach for it, rather
 * than making them go and look.
 */

/** How recently a dish appeared, counted in plans rather than in calendar weeks. */
export type RecentUse = {
  /** 0 is the plan being edited, 1 the one before it, and so on. */
  weeksAgo: number;
};

/**
 * How many plans back to look.
 *
 * Plans, not calendar weeks. A client who missed a month should still see that
 * مسخن was in their last plan; subtracting dates would silently drop it just when
 * the variety question matters most.
 */
export const USAGE_WINDOW = 5;

/**
 * Turns dated dish appearances into ordinals against a list of weeks.
 *
 * Pure, so the ordinal arithmetic is testable without a database. A dish appearing
 * in several of the weeks keeps the most recent — the smallest ordinal — because
 * "she had this last week" is the fact that changes a decision, not "she also had
 * it in July".
 */
export function ordinalUse(
  weekStartDates: readonly string[],
  appearances: readonly { dishId: string; weekStartDate: string }[],
): Record<string, RecentUse> {
  const ordinalByWeek = new Map(weekStartDates.map((week, index) => [week, index]));
  const usage: Record<string, RecentUse> = {};

  for (const appearance of appearances) {
    const weeksAgo = ordinalByWeek.get(appearance.weekStartDate);
    if (weeksAgo === undefined) continue;

    const existing = usage[appearance.dishId];
    if (!existing || weeksAgo < existing.weeksAgo) usage[appearance.dishId] = { weeksAgo };
  }

  return usage;
}

/**
 * Recent dish use for one client, keyed by dish id.
 *
 * Includes the plan being edited, as ordinal 0. That is deliberate: the commonest
 * repeat to catch is the one you placed on Tuesday ten seconds ago, not the one
 * from last month.
 */
export async function recentDishUse(clinicId: string, clientId: string): Promise<Record<string, RecentUse>> {
  const weeks = await db
    .selectDistinct({ weekStartDate: weeklyPlans.weekStartDate })
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.clinicId, clinicId), eq(weeklyPlans.clientId, clientId)))
    .orderBy(desc(weeklyPlans.weekStartDate))
    .limit(USAGE_WINDOW);

  if (!weeks.length) return {};

  const weekStartDates = weeks.map((row) => row.weekStartDate);

  const appearances = await db
    .selectDistinct({
      dishId: weeklyPlanMeals.dishId,
      weekStartDate: weeklyPlans.weekStartDate,
    })
    .from(weeklyPlanMeals)
    .innerJoin(weeklyPlans, eq(weeklyPlans.id, weeklyPlanMeals.planId))
    .where(
      and(
        eq(weeklyPlans.clinicId, clinicId),
        eq(weeklyPlans.clientId, clientId),
        inArray(weeklyPlans.weekStartDate, weekStartDates),
      ),
    );

  return ordinalUse(
    weekStartDates,
    appearances.flatMap((row) => (row.dishId ? [{ dishId: row.dishId, weekStartDate: row.weekStartDate }] : [])),
  );
}
