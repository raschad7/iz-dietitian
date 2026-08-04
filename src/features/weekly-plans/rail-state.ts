export const RAIL_TAB_IDS = ['client', 'dishes', 'meal', 'past'] as const;

export type RailTab = (typeof RAIL_TAB_IDS)[number];

/** Tabs exposed by the planner for the current plan state. */
export function railTabsForPlan(_hasPlan: boolean): readonly RailTab[] {
  return RAIL_TAB_IDS;
}
