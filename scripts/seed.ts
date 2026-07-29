/**
 * Seed script — run with `bun run db:seed`.
 *
 * Executed directly by Bun; there is no tsx/ts-node in this project.
 *
 * Idempotent: re-running replaces the seeded clients rather than duplicating
 * them. It is for local development only and refuses to run in production.
 */
import { eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { account, clients, clinics, foods, user } from '@/db/schema';
import { createClient, invitePortalAccess } from '@/features/clients/mutations';
import { addItem, createPlan } from '@/features/meal-plans/mutations';
import { auth } from '@/lib/auth';

import { seedFoods } from './seed-foods';

const STAFF_EMAIL = 'dietitian@clinic.ps';
const STAFF_PASSWORD = 'clinic-dev-password';

const SEED_CLIENTS = [
  { fullName: 'أحمد خليل', phone: '0599123456', email: 'ahmad@example.ps', preferredLocale: 'ar' as const, dateOfBirth: '1988-04-12', sex: 'male' as const, heightCm: 178, goal: 'weight_loss' as const, activityLevel: 'light' as const, allergies: 'لا يوجد' },
  { fullName: 'سارة عبد الله', phone: '0598222333', email: 'sara@example.ps', preferredLocale: 'ar' as const, dateOfBirth: '1994-11-03', sex: 'female' as const, heightCm: 165, goal: 'maintenance' as const, activityLevel: 'moderate' as const },
  { fullName: 'إبراهيم نصّار', phone: '0597444555', preferredLocale: 'ar' as const, dateOfBirth: '1972-01-20', sex: 'male' as const, heightCm: 170, goal: 'medical' as const, activityLevel: 'sedentary' as const, medicalNotes: 'ارتفاع ضغط الدم' },
  { fullName: 'فاطمة درويش', preferredLocale: 'ar' as const, sex: 'female' as const, goal: 'weight_gain' as const },
  { fullName: 'Layla Haddad', email: 'layla@example.ps', preferredLocale: 'en' as const, dateOfBirth: '2000-07-09', sex: 'female' as const, heightCm: 160, goal: 'sports' as const, activityLevel: 'very_active' as const },
] satisfies Parameters<typeof createClient>[1][];

async function seed(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('refusing to seed a production database');
  }

  const [existingStaff] = await db
    .select({ id: user.id, clinicId: user.clinicId })
    .from(user)
    .where(eq(user.email, STAFF_EMAIL))
    .limit(1);

  let clinicId = existingStaff?.clinicId ?? null;

  if (!existingStaff) {
    /**
     * Not `auth.api.signUpEmail`: `autoSignIn` is on, so signing up tries to set
     * a session cookie through the `nextCookies` plugin, and `cookies()` throws
     * outside a request scope — which a Bun script has none of.
     *
     * Instead the rows are written directly, using Better Auth's own hasher so
     * the password verifies at sign-in. `providerId: 'credential'` is what
     * Better Auth looks for on an email/password account.
     */
    const ctx = await auth.$context;
    const userId = crypto.randomUUID();

    // Each staff account is its own clinic — the tenant boundary. Created here
    // directly for the same reason the user row is: no request scope.
    const [clinic] = await db
      .insert(clinics)
      .values({ name: 'عيادة التغذية' })
      .returning({ id: clinics.id });

    if (!clinic) throw new Error('insert into clinics returned no row');
    clinicId = clinic.id;

    await db.insert(user).values({
      id: userId,
      name: 'أخصائي التغذية',
      email: STAFF_EMAIL,
      emailVerified: true,
      role: 'staff',
      locale: 'ar',
      clinicId,
    });

    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: await ctx.password.hash(STAFF_PASSWORD),
    });

    console.info(`staff account created: ${STAFF_EMAIL} / ${STAFF_PASSWORD}`);
  } else {
    console.info(`staff account already present: ${STAFF_EMAIL}`);
  }

  // Clients are replaced wholesale so the script stays idempotent. Their portal
  // accounts go too — `clients.user_id` is `set null`, so deleting only the
  // clients would leave client-role users behind and the next invite would then
  // fail with email_taken.
  if (!clinicId) {
    throw new Error(`staff account ${STAFF_EMAIL} has no clinic; delete it and re-run the seed`);
  }

  await db.delete(clients).where(eq(clients.clinicId, clinicId));
  await db.delete(user).where(eq(user.role, 'client'));

  const created = await Promise.all(SEED_CLIENTS.map((input) => createClient(clinicId, input)));

  // One client gets portal access so the invited state is visible in the UI.
  const [, second] = created;
  if (second) {
    await invitePortalAccess(clinicId, second.id);
  }

  // One archived client so the status filter has something to filter.
  const [first] = created;
  if (first) {
    await db.update(clients).set({ status: 'archived' }).where(eq(clients.id, first.id));
  }

  console.info(`seeded ${created.length} clients`);

  await seedSampleMealPlan(clinicId, second?.id);
}

/**
 * The foods reference table, plus one worked example.
 *
 * `foods` is shared reference data, not a tenant's — so it is upserted rather
 * than deleted and rewritten, and it survives re-seeding the clients above. The
 * sample plan goes to whichever client is still active, so the meal-plans page
 * has something real on it after a fresh `bun run db:seed`.
 */
async function seedSampleMealPlan(clinicId: string, clientId: string | undefined): Promise<void> {
  const foodCount = await seedFoods();
  console.info(`seeded ${foodCount} foods (USDA SR Legacy)`);

  if (!clientId) return;

  const plan = await createPlan(clinicId, {
    clientId,
    title: 'Sample day',
    notes: 'Seeded example. Edit or delete it freely.',
  });

  if (!plan) return;

  // Looked up by FoodData Central id, the stable natural key — a description
  // match would break the seed the moment USDA reworded something.
  const byFdcId = new Map(
    (
      await db
        .select({ id: foods.id, fdcId: foods.fdcId })
        .from(foods)
        .where(inArray(foods.fdcId, [169705, 171287, 173944, 169704, 171477, 170886]))
    ).map((food) => [food.fdcId, food.id]),
  );

  const meals = await db.query.mealPlanMeals.findMany({
    where: (table, { eq: equals }) => equals(table.planId, plan.id),
    orderBy: (table, { asc }) => asc(table.timeOfDay),
  });

  /** [meal index, FoodData Central id, grams] */
  const SAMPLE_ITEMS: [number, number, number][] = [
    [0, 169705, 80], // Oats
    [0, 171287, 100], // Egg, whole, raw, fresh
    [1, 173944, 120], // Bananas, raw
    [2, 169704, 180], // Rice, brown, long-grain, cooked
    [2, 171477, 150], // Chicken, broilers or fryers, breast, meat only, cooked, roasted
    [4, 170886, 200], // Yogurt, plain, low fat
  ];

  for (const [mealIndex, fdcId, grams] of SAMPLE_ITEMS) {
    const mealId = meals[mealIndex]?.id;
    const foodId = byFdcId.get(fdcId);

    if (mealId && foodId) {
      await addItem(clinicId, mealId, { foodId, quantityGrams: grams });
    }
  }

  console.info(`seeded 1 sample meal plan across ${meals.length} meals`);
}

await seed();
process.exit(0);
