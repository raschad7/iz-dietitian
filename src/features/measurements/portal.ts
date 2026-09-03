import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { clientMeasurements, clientNutritionProfiles, clients } from '@/db/schema';

import {
  changeFor,
  progressNarrative,
  summariseProgress,
  trendSeries,
  type ComparableMeasurement,
  type MeasurementSubject,
  type ProgressNarrative,
} from './compare';

/**
 * What a client may see of their own measurements.
 *
 * ## This is a different view of the same data, on purpose
 *
 * The staff panel shows everything the machine reported. This shows four
 * figures and a sentence, and the gap between the two is a clinical decision
 * rather than an oversight:
 *
 * - **Visceral fat rating, metabolic age and the machine's own scores are never
 *   selected.** They are the figures most likely to frighten someone who has no
 *   one beside them to interpret them, and a client reading "metabolic age 33"
 *   at eleven at night cannot ask what it means.
 * - **The original PDF is never reachable from the portal.** It carries all of
 *   the above on one page.
 * - **BMI is not shown either.** It is the figure a client is most likely to
 *   already have a number in their head about, and it cannot tell the fat loss
 *   this card exists to show from the muscle loss it exists to rule out.
 *
 * What is left is the answer to "is this working": weight, how much of the
 * change was fat, how much muscle was kept, and one sentence saying so.
 *
 * ## And it is off unless the dietitian turned it on
 *
 * `share_measurements_with_client` defaults to false and gates this whole read —
 * not the render, the *read*. Nothing about a client's body composition leaves
 * the database for a portal session that has not been granted it, so a mistake
 * in a component cannot become a disclosure.
 */

export type PortalMeasurements = {
  /** Oldest first — the shape a chart is drawn from. */
  trend: { measuredOn: string; weightKg: number }[];
  latestOn: string;
  weightKg: number;
  /** Since the first measurement on record. Null when there is only one. */
  sinceStart: {
    weightKg: number | null;
    fatMassKg: number | null;
    muscleMassKg: number | null;
    narrative: ProgressNarrative;
  } | null;
  count: number;
};

/**
 * One client's measurements, for their own portal.
 *
 * Returns null — the card is absent, not empty — when sharing is off, when the
 * client has no measurements, or when there is no nutrition profile at all.
 * §9.8: "the card is absent, not blanked", because a visible panel reading
 * "hidden" tells a client there is a number being kept from them.
 */
export async function getPortalMeasurements(
  clientId: string,
): Promise<PortalMeasurements | null> {
  const [profile] = await db
    .select({
      shared: clientNutritionProfiles.shareMeasurementsWithClient,
      goal: clients.goal,
      heightCm: clients.heightCm,
    })
    .from(clientNutritionProfiles)
    .innerJoin(clients, eq(clients.id, clientNutritionProfiles.clientId))
    .where(eq(clientNutritionProfiles.clientId, clientId))
    .limit(1);

  // The gate is here, before the figures are read at all.
  if (!profile?.shared) return null;

  /*
    Only the columns this card draws. Selecting the row and picking fields in a
    component would mean the visceral fat rating and the metabolic age had
    already crossed into a client-facing render — the kind of thing that is fine
    until someone adds a debug dump. They are not selected.
  */
  const rows = await db
    .select({
      id: clientMeasurements.id,
      measuredOn: clientMeasurements.measuredOn,
      measuredAtMinute: clientMeasurements.measuredAtMinute,
      weightKg: clientMeasurements.weightKg,
      heightCm: clientMeasurements.heightCm,
      bodyFatPercent: clientMeasurements.bodyFatPercent,
      fatMassKg: clientMeasurements.fatMassKg,
      fatFreeMassKg: clientMeasurements.fatFreeMassKg,
      muscleMassKg: clientMeasurements.muscleMassKg,
    })
    .from(clientMeasurements)
    .where(eq(clientMeasurements.clientId, clientId))
    .orderBy(desc(clientMeasurements.measuredOn), desc(clientMeasurements.measuredAtMinute));

  if (rows.length === 0) return null;

  /*
    The columns the comparison needs but this card never shows, filled with
    null. `summariseProgress` skips a null figure rather than treating it as
    zero, so the arithmetic is the same arithmetic the staff panel runs — the
    two can never tell a client and a dietitian different stories about the same
    week.
  */
  const measurements: ComparableMeasurement[] = rows.map((row) => ({
    ...row,
    visceralFatRating: null,
    waistCm: null,
    hipCm: null,
    basalMetabolicRateKcal: null,
  }));

  const subject: MeasurementSubject = { goal: profile.goal, heightCm: profile.heightCm };
  const progress = summariseProgress(measurements, subject);
  const latest = progress.latest!;

  return {
    trend: trendSeries(measurements, 'weightKg', subject).map((point) => ({
      measuredOn: point.measuredOn,
      weightKg: point.value,
    })),
    latestOn: latest.measuredOn,
    weightKg: latest.weightKg,
    sinceStart:
      progress.sinceStart.length > 0
        ? {
            weightKg: changeFor(progress.sinceStart, 'weightKg')?.delta ?? null,
            fatMassKg: changeFor(progress.sinceStart, 'fatMassKg')?.delta ?? null,
            muscleMassKg: changeFor(progress.sinceStart, 'muscleMassKg')?.delta ?? null,
            narrative: progressNarrative(progress.sinceStart),
          }
        : null,
    count: measurements.length,
  };
}

/**
 * The state of the staff-side disclosure switch.
 *
 * Read here rather than off the intake, because whether a client may see their
 * measurements is this feature's business and `ClientIntakeValues` is the
 * clients feature's shape — widening that to carry a measurements column would
 * put a disclosure rule in a type that has nothing to do with one.
 *
 * `hasProfile` is what disables the control: `client_nutrition_profiles` rows
 * are created lazily by the intake form, so a client whose intake has never been
 * saved has nothing for the switch to write to.
 *
 * Scoped by clinic, unlike the reader above — that one is called from a portal
 * session which is already the client themselves.
 */
export async function measurementSharing(
  clinicId: string,
  clientId: string,
): Promise<{ shared: boolean; hasProfile: boolean }> {
  const [row] = await db
    .select({ shared: clientNutritionProfiles.shareMeasurementsWithClient })
    .from(clientNutritionProfiles)
    .where(
      and(
        eq(clientNutritionProfiles.clinicId, clinicId),
        eq(clientNutritionProfiles.clientId, clientId),
      ),
    )
    .limit(1);

  return { shared: row?.shared ?? false, hasProfile: row !== undefined };
}
