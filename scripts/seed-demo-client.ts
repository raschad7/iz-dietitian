/**
 * Demo data for ONE existing client — run with `bun run db:seed:demo`.
 *
 * Executed directly by Bun; there is no tsx/ts-node in this project.
 *
 * What it is for: a client whose record exists but whose portal is empty shows
 * nothing on Home and nothing under "خطتي", which makes the two screens
 * impossible to review. This gives exactly one named client a published week of
 * real food and a short history of plan adherence, so those screens can be read
 * as a client reads them.
 *
 * What it deliberately is NOT:
 *
 * - **Not `db:seed`.** That script owns the fixture clinic and replaces its
 *   clients wholesale. This one creates no client, deletes no client, and never
 *   touches the two shared reference tables. It fails if the named client is
 *   missing rather than inventing them, because the whole point is to decorate a
 *   record someone already made.
 * - **Not a reset.** Nothing is truncated. The only rows it will ever delete are
 *   plans it can prove it wrote itself — see {@link DEMO_WEEK_NOTE}.
 * - **Not a fixture for everyone.** Every write below is scoped to the one
 *   resolved `clientId`. No other client gains a plan, a streak, or a percentage
 *   they did not earn.
 *
 * Idempotent: running it twice leaves the same one plan, the same adherence
 * reports and the same check-ins. Re-running is how you pick up an edit to
 * `demo-menu.ts`.
 *
 * Everything goes through the feature's own writes — `saveNutritionProfile`,
 * `createPlanFromSkeleton`, `saveWeekInstructions`, `publishPlan`,
 * `logPlanAdherence` — so the demo cannot drift from what the app itself would
 * produce, and a plan that would not publish from the board does not publish
 * from here either.
 */
import { and, eq, isNotNull } from 'drizzle-orm';

import { db } from '@/db';
import {
  clientCheckIns,
  clientNutritionProfiles,
  clients,
  practitioners,
  weeklyPlanMealOptions,
  weeklyPlanMeals,
  weeklyPlans,
  type MealSlot,
} from '@/db/schema';
import { addDays, startOfWeek, type IsoDate } from '@/features/booking/date';
import { wallClockIn } from '@/features/booking/completed';
import { logPlanAdherence } from '@/features/portal/mutations';
import { createPlanFromSkeleton } from '@/features/weekly-plans/editor-mutations';
import {
  deletePlan,
  publishPlan,
  saveNutritionProfile,
  saveWeekInstructions,
} from '@/features/weekly-plans/mutations';
import { baseServingKcal, type DishDetail } from '@/features/weekly-plans/nutrition';
import { loadCatalog } from '@/features/weekly-plans/queries';
import { DEFAULT_MEAL_SCHEDULE, mealScheduleSchema, type Allergen } from '@/features/weekly-plans/schema';
import { planSkeleton, slotFillKey, type SlotFill } from '@/features/weekly-plans/skeleton';
import { bestServings } from '@/features/weekly-plans/similar';
import { slotBudgets } from '@/features/weekly-plans/targets';
import { DISPLAY_TIME_ZONE } from '@/lib/format';

import { DEMO_WEEK, DEMO_WEEK_NOTE, type DemoDay } from './demo-menu';

/**
 * Who this script is about.
 *
 * A name and not an id: ids differ between machines, and the person asking for
 * demo data knows the client by name. `process.argv[2]` overrides it, so the same
 * script can decorate a different client without being edited — but it still has
 * to name one, because "every client" is not a thing this script will do.
 */
const DEMO_CLIENT_NAME = process.argv[2]?.trim() || 'سعيد سالم';

/**
 * The daily target this client's demo week is built against, used ONLY when they
 * have no nutrition profile yet.
 *
 * Set explicitly rather than left to the Mifflin-St Jeor suggestion: the
 * suggestion needs a date of birth, and a demo record's is not a fact anyone
 * measured. A dietitian who later sets a real target keeps it — see
 * `ensureNutritionProfile`.
 */
const DEMO_KCAL_TARGET = 2600;
const DEMO_PROTEIN_TARGET = 130;
const DEMO_WEIGHT_KG = 72;

/**
 * The structured allergen this client's free-text record already names
 * ("فول سوداني").
 *
 * `clients.allergies` is prose and is never keyword-matched — see the column
 * comment on `client_nutrition_profiles.allergen_tags` — so the tag is stated
 * here, and `loadCatalog` then filters the catalog in SQL before a single dish
 * reaches the menu.
 */
const DEMO_ALLERGEN_TAGS: Allergen[] = ['nuts'];

/**
 * The days of adherence this script writes, most recent first.
 *
 * **The gap at four days ago is the point of this list.** The progress tab's
 * continuity card draws the streak as it stood on each of the last six days, so
 * a run of consecutive days would review as a straight ramp and show nothing
 * about what the card does when a streak breaks. Two days, then a missed one,
 * then three — the curve rises, returns to the floor, and climbs back to the
 * three days the card prints as its headline.
 *
 * Still stops short of today, for the reason {@link seedAdherence} documents.
 */
const DEMO_ADHERENCE = [
  {
    /** Yesterday: followed in full — 10/10 on the scale the week strip draws. */
    daysAgo: 1,
    level: 'full' as const,
    /**
     * The wellness check-in for the same day.
     *
     * A second row in a different table on purpose: `client_plan_adherence`
     * answers "did you follow the plan" on three levels, and
     * `client_check_ins.score` is the client's own 0–10 read of the day. The
     * schema headers are explicit that the two must not be averaged together,
     * so the demo writes both rather than making one stand in for the other.
     */
    score: 10,
    metrics: { energy: 5, sleep: 4, appetite: 5, mood: 5, water: 5 },
  },
  {
    daysAgo: 2,
    level: 'full' as const,
    score: 9,
    metrics: { energy: 5, sleep: 4, appetite: 4, mood: 4, water: 4 },
  },
  {
    /** Where the current run starts: partly followed — 5/10 on the adherence scale, 7/10 on the day. */
    daysAgo: 3,
    level: 'partial' as const,
    score: 7,
    metrics: { energy: 4, sleep: 3, appetite: 4, mood: 4, water: 3 },
  },
  // Four days ago is deliberately absent — the day the earlier run broke on.
  {
    daysAgo: 5,
    level: 'full' as const,
    score: 8,
    metrics: { energy: 4, sleep: 4, appetite: 4, mood: 4, water: 4 },
  },
  {
    daysAgo: 6,
    level: 'partial' as const,
    score: 6,
    metrics: { energy: 3, sleep: 3, appetite: 3, mood: 3, water: 3 },
  },
];

async function seedDemoClient(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('refusing to seed demo data into a production database');
  }

  const client = await resolveClient(DEMO_CLIENT_NAME);
  const practitionerUserId = await ensureAssignedPractitioner(client);
  const profile = await ensureNutritionProfile(client);

  // The clinic's own wall clock, not the server's: the portal decides which week
  // is current and which day is "today" in Asia/Hebron, and a demo built against
  // a machine in another zone would land a day out for half of every day.
  const today = wallClockIn(DISPLAY_TIME_ZONE).date;

  await seedPublishedPlan({ client, profile, today });
  await seedAdherence(client, today);

  console.info(
    `\ndone. sign in to the portal as ${client.fullName} — Home shows "خطتك الحالية", "خطتي" shows the week, ` +
      `and the progress strip reads ${DEMO_ADHERENCE.length} logged days.` +
      (practitionerUserId ? '' : ' (no practitioner row in this clinic, so nobody was assigned.)'),
  );
}

type DemoClient = { id: string; clinicId: string; fullName: string; assignedDietitianId: string | null };

/**
 * The one client this run is about.
 *
 * Refuses on both zero matches and more than one. Creating the client would defeat
 * the point — the instruction is to decorate an existing record, not to add
 * another person with the same name — and picking the first of two would be the
 * script quietly guessing which real person gets a plan.
 */
async function resolveClient(fullName: string): Promise<DemoClient> {
  const matches = await db
    .select({
      id: clients.id,
      clinicId: clients.clinicId,
      fullName: clients.fullName,
      assignedDietitianId: clients.assignedDietitianId,
    })
    .from(clients)
    .where(eq(clients.fullName, fullName));

  const [client, ...rest] = matches;

  if (!client) {
    throw new Error(
      `no client named "${fullName}". This script never creates one — add them in the app first, or pass a different name: bun run db:seed:demo "<name>"`,
    );
  }

  if (rest.length > 0) {
    throw new Error(
      `${matches.length} clients are named "${fullName}"; refusing to guess which one the demo is for.`,
    );
  }

  console.info(`client: ${client.fullName} (${client.id})`);
  return client;
}

/**
 * Makes sure the client has a dietitian, so the plan is one their own
 * practitioner gave them and the portal's profile screen can name a person.
 *
 * `clients.assigned_dietitian_id` is a `users.id`, and the name behind it lives on
 * `practitioners.user_id` — `getAssignedPractitioner` joins the two and returns
 * nobody unless both agree, so the value written here is the clinic's own
 * practitioner account and nothing else.
 *
 * An assignment already in place is left alone: who looks after a client is a
 * clinical decision, and a demo script has no business overruling it.
 */
async function ensureAssignedPractitioner(client: DemoClient): Promise<string | null> {
  if (client.assignedDietitianId) {
    console.info('practitioner: already assigned, left as is');
    return client.assignedDietitianId;
  }

  const [practitioner] = await db
    .select({ name: practitioners.name, userId: practitioners.userId })
    .from(practitioners)
    .where(and(eq(practitioners.clinicId, client.clinicId), isNotNull(practitioners.userId)))
    .limit(1);

  if (!practitioner?.userId) {
    console.warn('practitioner: this clinic has no practitioner with an account; leaving unassigned');
    return null;
  }

  await db
    .update(clients)
    .set({ assignedDietitianId: practitioner.userId, updatedAt: new Date() })
    .where(eq(clients.id, client.id));

  client.assignedDietitianId = practitioner.userId;
  console.info(`practitioner: assigned ${practitioner.name}`);

  return practitioner.userId;
}

type ProfileContext = { schedule: MealSlot[]; dailyKcal: number };

/**
 * The nutrition profile the plan is generated against, created only if missing.
 *
 * `saveNutritionProfile` is an upsert that overwrites every column, so calling it
 * unconditionally would erase a dietitian's real weight, targets and schedule on
 * the second run. The read comes first for that reason: an existing profile is
 * used exactly as it stands, and only a client who has none gets the demo's
 * figures.
 */
async function ensureNutritionProfile(client: DemoClient): Promise<ProfileContext> {
  const [existing] = await db
    .select({
      dailyKcalTarget: clientNutritionProfiles.dailyKcalTarget,
      mealSchedule: clientNutritionProfiles.mealSchedule,
    })
    .from(clientNutritionProfiles)
    .where(eq(clientNutritionProfiles.clientId, client.id))
    .limit(1);

  if (existing) {
    // Validated on read as well as on write, exactly as the column comment
    // requires: a hand-edited row must not reach the planner.
    const schedule = mealScheduleSchema.parse(existing.mealSchedule);
    const dailyKcal = existing.dailyKcalTarget ?? DEMO_KCAL_TARGET;

    console.info(`nutrition profile: already present, kept (${dailyKcal} kcal/day, ${schedule.length} slots)`);
    return { schedule, dailyKcal };
  }

  const saved = await saveNutritionProfile(client.clinicId, {
    clientId: client.id,
    weightKg: DEMO_WEIGHT_KG,
    dailyKcalTarget: DEMO_KCAL_TARGET,
    proteinTargetGrams: DEMO_PROTEIN_TARGET,
    allergenTags: DEMO_ALLERGEN_TAGS,
    preferences: 'يفضّل الأكل البيتي والوجبات التي تُحضَّر بسرعة، ويحب المشاوي.',
    dislikes: 'لا يحب الأسماك المقلية ولا الأطعمة الحارة جداً.',
    permanentInstructions: 'حساسية من الفول السوداني والمكسّرات — تُستبعد نهائياً. الهدف زيادة الوزن بمعدل تدريجي.',
    mealSchedule: DEFAULT_MEAL_SCHEDULE,
  });

  if (!saved) throw new Error('saveNutritionProfile refused: the client is not in that clinic');

  console.info(`nutrition profile: created (${DEMO_KCAL_TARGET} kcal/day, ${DEFAULT_MEAL_SCHEDULE.length} slots)`);
  return { schedule: DEFAULT_MEAL_SCHEDULE, dailyKcal: DEMO_KCAL_TARGET };
}

/**
 * The published week: the plan itself, its portions, its alternatives and the
 * note under every meal.
 *
 * Built for the week `today` falls in, not the coming one. The portal reads
 * `getPublishedBoard` and shows today's meals from it, so a plan for next Sunday
 * would leave Home saying there is a plan and showing nothing in it.
 */
async function seedPublishedPlan({
  client,
  profile,
  today,
}: {
  client: DemoClient;
  profile: ProfileContext;
  today: IsoDate;
}): Promise<void> {
  const { schedule, dailyKcal } = profile;
  const weekStartDate = startOfWeek(today);

  if (!(await clearPreviousDemoPlan(client, weekStartDate))) return;

  // Filtered by the client's allergens in SQL, which is the only allergen gate
  // that matters: a dish excluded here can never reach the plan.
  const catalog = await loadCatalog(DEMO_ALLERGEN_TAGS);
  const bySlug = new Map(catalog.map((dish) => [dish.slug, dish]));

  // What each slot is meant to carry, from the client's own shares. Portions are
  // derived from these rather than written by hand — see `demo-menu.ts`.
  const budgetBySlot = new Map(slotBudgets(dailyKcal, schedule).map((slot) => [slot.slotKey, slot.kcal]));

  const fill = new Map<string, SlotFill>();

  for (const day of DEMO_WEEK) {
    for (const meal of day.meals) {
      const dish = requireDish(bySlug, meal.dish, day, meal.slotKey);
      const budget = budgetBySlot.get(meal.slotKey);

      if (budget === undefined) {
        throw new Error(
          `the menu plans slot "${meal.slotKey}" but the client's schedule has no such slot; update demo-menu.ts or the schedule`,
        );
      }

      fill.set(slotFillKey(day.dayOfWeek, meal.slotKey), {
        dishId: dish.id,
        servings: portionFor(dish, budget),
      });
    }
  }

  const planId = await createPlanFromSkeleton({
    clinicId: client.clinicId,
    clientId: client.id,
    weekStartDate,
    kcalTarget: dailyKcal,
    // The skeleton always comes from the client's CURRENT schedule; the fill is
    // consulted, never trusted, so a menu naming a slot they no longer have is
    // dropped rather than resurrecting it.
    meals: planSkeleton({ schedule, dailyKcal, fill }),
  });

  if (!planId) throw new Error('createPlanFromSkeleton refused: the client is not in that clinic');

  await writeMealNotesAndOptions({ planId, catalog: bySlug, budgetBySlot });

  await saveWeekInstructions(client.clinicId, planId, DEMO_WEEK_NOTE);

  const published = await publishPlan(client.clinicId, planId);

  if (!published.ok) {
    // `unfilled` means a slot in the schedule has no dish in `demo-menu.ts`. The
    // same refusal a dietitian would get from the board, and for the same reason.
    throw new Error(`publishing the demo plan failed: ${published.reason}`);
  }

  console.info(
    `plan: published for the week of ${weekStartDate} – ${addDays(weekStartDate, 6)} ` +
      `(${DEMO_WEEK.length} days, ${DEMO_WEEK.reduce((total, day) => total + day.meals.length, 0)} meals)`,
  );
}

/**
 * Removes the plan a previous run of this script wrote for the same week, and
 * refuses to touch anything else.
 *
 * This is the whole of the script's idempotency, and its whole safety story. A
 * plan is recognised as the demo's own only by carrying {@link DEMO_WEEK_NOTE}
 * verbatim in `week_instructions`. Anything else for that week is a real plan
 * somebody made, so the script leaves it alone and builds nothing — a second
 * published plan for the same client and week is refused by the database anyway
 * (`weekly_plans_published_week_idx`), and silently deleting a dietitian's work to
 * make room would be far worse than doing nothing.
 *
 * Returns whether the caller should go on to build.
 */
async function clearPreviousDemoPlan(client: DemoClient, weekStartDate: string): Promise<boolean> {
  const existing = await db
    .select({
      id: weeklyPlans.id,
      status: weeklyPlans.status,
      weekInstructions: weeklyPlans.weekInstructions,
    })
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.clientId, client.id), eq(weeklyPlans.weekStartDate, weekStartDate)));

  const foreign = existing.filter((plan) => plan.weekInstructions !== DEMO_WEEK_NOTE);

  if (foreign.length > 0) {
    console.warn(
      `plan: ${client.fullName} already has a plan for the week of ${weekStartDate} that this script did not write ` +
        `(${foreign.map((plan) => plan.status).join(', ')}). Leaving it untouched and skipping the demo plan.`,
    );
    return false;
  }

  for (const plan of existing) {
    await deletePlan(client.clinicId, plan.id);
  }

  if (existing.length > 0) console.info(`plan: replaced the ${existing.length} plan(s) an earlier run wrote`);

  return true;
}

/** The dish a menu entry names, or a message that says which entry is wrong. */
function requireDish(
  bySlug: ReadonlyMap<string, DishDetail>,
  slug: string,
  day: DemoDay,
  slotKey: string,
): DishDetail {
  const dish = bySlug.get(slug);

  if (!dish) {
    throw new Error(
      `demo-menu.ts names dish "${slug}" for day ${day.dayOfWeek} / ${slotKey}, but it is not in the catalog the client may eat from. ` +
        `Either it was never seeded (run \`bun run db:seed:dishes\`) or it carries one of their allergens.`,
    );
  }

  return dish;
}

/**
 * The serving multiplier that puts a dish closest to its slot's budget.
 *
 * `bestServings` is the same function the swap panel uses, and it snaps to the
 * quarter steps a person can actually follow. It returns null for a dish with no
 * measured energy — a plate of cucumber cannot be scaled to 600 kcal — and one
 * serving is the honest answer there rather than an invented multiplier.
 */
function portionFor(dish: DishDetail, budgetKcal: number): number {
  return bestServings(baseServingKcal(dish.ingredients), budgetKcal) ?? 1;
}

/**
 * The dietitian's note on each meal and the alternatives under it.
 *
 * Written directly rather than through a mutation because there is no mutation
 * that means this: `rationale_ar` is filled by a generation, and options are
 * produced as a side effect of swapping a dish. Neither describes what is
 * happening here, which is a hand-written plan being laid down whole.
 *
 * Meals are matched by day and slot, never by insert order — the same rule
 * `insertOptions` documents in `mutations.ts`, and for the same reason: rows come
 * back in whatever order PostgreSQL produced them, and pairing by position would
 * eventually put Tuesday's alternatives under Wednesday's lunch.
 */
async function writeMealNotesAndOptions({
  planId,
  catalog,
  budgetBySlot,
}: {
  planId: string;
  catalog: ReadonlyMap<string, DishDetail>;
  budgetBySlot: ReadonlyMap<string, number>;
}): Promise<void> {
  const mealRows = await db
    .select({
      id: weeklyPlanMeals.id,
      dayOfWeek: weeklyPlanMeals.dayOfWeek,
      slotKey: weeklyPlanMeals.slotKey,
    })
    .from(weeklyPlanMeals)
    .where(eq(weeklyPlanMeals.planId, planId));

  const idBySlot = new Map(mealRows.map((row) => [slotFillKey(row.dayOfWeek, row.slotKey), row.id]));

  const options: { mealId: string; dishId: string; servings: number; sortOrder: number }[] = [];

  await db.transaction(async (tx) => {
    for (const day of DEMO_WEEK) {
      for (const meal of day.meals) {
        const mealId = idBySlot.get(slotFillKey(day.dayOfWeek, meal.slotKey));
        if (!mealId) continue;

        await tx
          .update(weeklyPlanMeals)
          .set({ rationaleAr: meal.noteAr, updatedAt: new Date() })
          .where(eq(weeklyPlanMeals.id, mealId));

        const budget = budgetBySlot.get(meal.slotKey) ?? 0;

        meal.alternatives.forEach((slug, index) => {
          const dish = catalog.get(slug);
          if (!dish) return;

          options.push({
            mealId,
            dishId: dish.id,
            servings: portionFor(dish, budget),
            sortOrder: index,
          });
        });
      }
    }

    if (options.length > 0) {
      // The unique index refuses the same dish twice in one meal's options; a menu
      // that repeats one is a typo, not a reason to abort the whole week.
      await tx.insert(weeklyPlanMealOptions).values(options).onConflictDoNothing();
    }
  });

  console.info(`plan: wrote ${mealRows.length} meal notes and ${options.length} alternatives`);
}

/**
 * {@link DEMO_ADHERENCE}'s days of plan adherence, ending yesterday.
 *
 * Deliberately stops short of today, exactly as `db:seed` does: both the home
 * screen and the progress tab read `client_plan_adherence`, so leaving today
 * unlogged means signing in lands on the same "log today" prompt a real client
 * sees — and tapping it is what proves the two screens move together.
 *
 * `logPlanAdherence` is the portal's own write, upserting on `(client_id, date)`,
 * which is what makes re-running this correct rather than a duplicate-key error.
 * The action layer always passes the clinic's `today` so a client cannot backdate
 * a report; a seed writing fixture history for two past days is the one caller
 * that legitimately supplies a different date.
 */
async function seedAdherence(client: DemoClient, today: IsoDate): Promise<void> {
  for (const entry of DEMO_ADHERENCE) {
    const date = addDays(today, -entry.daysAgo);

    const logged = await logPlanAdherence(
      { clientId: client.id, clinicId: client.clinicId },
      date,
      entry.level,
    );

    if (!logged.ok) throw new Error(`logging adherence for ${date} failed: ${logged.error}`);

    // The wellness row for the same day. An upsert on the same unique index the
    // adherence write uses, so this is a correction on a re-run and never a
    // second row for one day.
    await db
      .insert(clientCheckIns)
      .values({
        clinicId: client.clinicId,
        clientId: client.id,
        date,
        score: entry.score,
        ...entry.metrics,
      })
      .onConflictDoUpdate({
        target: [clientCheckIns.clientId, clientCheckIns.date],
        set: { score: entry.score, ...entry.metrics, updatedAt: new Date() },
      });

    console.info(`adherence: ${date} — ${entry.level} (day scored ${entry.score}/10)`);
  }
}

await seedDemoClient();
process.exit(0);
