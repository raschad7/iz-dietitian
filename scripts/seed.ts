/**
 * Seed script — run with `bun run db:seed`.
 *
 * Executed directly by Bun; there is no tsx/ts-node in this project.
 *
 * Idempotent: re-running replaces the seeded clients rather than duplicating
 * them. It is for local development only and refuses to run in production.
 */
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { db } from '@/db';
import { account, appointments, clients, clinics, clinicWorkingHours, practitioners, user } from '@/db/schema';
import { addDays, toIsoDate } from '@/features/booking/date';
import { ensurePractitioner } from '@/features/booking/mutations';
import { createClient, saveIntake } from '@/features/clients/mutations';
import { DEFAULT_MEAL_SCHEDULE } from '@/features/clients/nutrition';
import { issuePortalCredentials, suggestPortalUsername } from '@/features/clients/portal-credentials';
import { defaultClinicScheduleRows } from '@/features/clinic-profile/default-schedule';
import { auth } from '@/lib/auth';
import { paletteColorAt } from '@/lib/avatar-color';

import { seedCatalogFoods } from './seed-catalog-foods';
import { seedDishes } from './seed-dishes';

const STAFF_EMAIL = 'dietitian@clinic.ps';
const STAFF_PASSWORD = 'clinic-dev-password';

/**
 * The seeded clients, in the two halves a client record is written in: the card
 * that creates them, and the intake that makes them plannable.
 *
 * `intake` is optional, and one client deliberately has none — a record with no
 * nutrition profile is the ordinary starting state, and the planner's blocked
 * path needs something to be blocked on.
 */
type SeedClient = {
  client: Parameters<typeof createClient>[1];
  intake?: Omit<Parameters<typeof saveIntake>[1], 'clientId'>;
};

/** The fields every intake carries, so each seed row states only what differs. */
const BASE_INTAKE = {
  allergenTags: [],
  customAllergens: [],
  mealSchedule: DEFAULT_MEAL_SCHEDULE,
} satisfies Partial<Parameters<typeof saveIntake>[1]>;

const SEED_CLIENTS: SeedClient[] = [
  {
    client: { fullName: 'أحمد خليل', phone: '0599123456', email: 'ahmad@example.ps', preferredLocale: 'ar', dateOfBirth: '1988-04-12', sex: 'male' },
    intake: { ...BASE_INTAKE, heightCm: 178, goal: 'weight_loss', activityLevel: 'light', weightKg: 92, allergies: 'لا يوجد' },
  },
  {
    client: { fullName: 'سارة عبد الله', phone: '0598222333', email: 'sara@example.ps', preferredLocale: 'ar', dateOfBirth: '1994-11-03', sex: 'female' },
    intake: { ...BASE_INTAKE, heightCm: 165, goal: 'maintenance', activityLevel: 'moderate', weightKg: 61 },
  },
  {
    client: { fullName: 'إبراهيم نصّار', phone: '0597444555', preferredLocale: 'ar', dateOfBirth: '1972-01-20', sex: 'male' },
    intake: {
      ...BASE_INTAKE,
      heightCm: 170,
      goal: 'medical',
      activityLevel: 'sedentary',
      weightKg: 88,
      medicalNotes: 'ارتفاع ضغط الدم',
      conditions: 'ارتفاع ضغط الدم',
      medications: 'أملوديبين ٥ ملغ يومياً',
      permanentInstructions: 'تقليل الملح في كل الوجبات',
    },
  },
  // No intake: the "profile incomplete" path in the planner needs a client to
  // be incomplete, and a freshly added walk-in is exactly this shape.
  { client: { fullName: 'فاطمة درويش', preferredLocale: 'ar', sex: 'female' } },
  {
    client: { fullName: 'Layla Haddad', email: 'layla@example.ps', preferredLocale: 'en', dateOfBirth: '2000-07-09', sex: 'female' },
    intake: {
      ...BASE_INTAKE,
      heightCm: 160,
      goal: 'sports',
      activityLevel: 'very_active',
      weightKg: 55,
      allergenTags: ['lactose'],
      allergies: 'Lactose intolerant — lactose-free dairy is fine',
      dislikes: 'Okra',
    },
  },
];

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

    // The same rows the `user.create.before` hook writes for a real sign-up
    // (`src/lib/auth.ts`). Bypassing Better Auth means bypassing that hook, so
    // they have to be written here too — and they are not optional decoration:
    // `getClinicProfile` returns null unless it finds exactly seven, which makes
    // the onboarding page throw, and every `/app` route redirects there.
    await db.insert(clinicWorkingHours).values(defaultClinicScheduleRows(clinicId));

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
  //
  // Both deletes are scoped to this clinic. `users.role = 'client'` alone would
  // reach across every tenant in the database and delete the portal accounts of
  // clinics the seed does not own — a developer signed up as a real dietitian
  // would lose their clients' logins to a script that is only supposed to
  // refresh its own fixtures.
  if (!clinicId) {
    throw new Error(`staff account ${STAFF_EMAIL} has no clinic; delete it and re-run the seed`);
  }

  // Repairs a database seeded before the insert above existed, whose clinic has
  // no working hours and therefore cannot open any page under `/app`. Re-running
  // the seed is the obvious thing to reach for when the app misbehaves, so it is
  // what should fix it — a `db:reset` should not be the price of a stale row.
  await ensureClinicSchedule(clinicId);

  // Read first: `clients.user_id` is the only link from a clinic to its portal
  // accounts, and `on delete set null` means it is gone the instant the client
  // row is. Collecting the ids afterwards would find nothing.
  const portalUserIds = (
    await db
      .select({ userId: clients.userId })
      .from(clients)
      .where(and(eq(clients.clinicId, clinicId), isNotNull(clients.userId)))
  ).map((row) => row.userId as string);

  await db.delete(clients).where(eq(clients.clinicId, clinicId));

  if (portalUserIds.length > 0) {
    // `role` is still checked: these ids come from `clients.user_id`, which
    // nothing should ever point at a staff account, and a delete is the wrong
    // place to find out that something did.
    await db.delete(user).where(and(eq(user.role, 'client'), inArray(user.id, portalUserIds)));
  }

  const created = await Promise.all(SEED_CLIENTS.map((seed) => createClient(clinicId, seed.client)));

  // The clinical half, written the same way the intake dialog writes it: one
  // call per client, fanning out to both tables. Without this every seeded
  // client has no nutrition profile and the planner refuses to generate for
  // all of them, which is not a useful development database.
  for (const [index, client] of created.entries()) {
    const intake = SEED_CLIENTS[index]?.intake;
    if (intake) await saveIntake(clinicId, { ...intake, clientId: client.id });
  }

  // One client gets portal credentials so the granted state — and a working
  // sign-in — is visible in the UI without doing it by hand.
  const [, second] = created;
  const secondInput = SEED_CLIENTS[1]?.client;
  if (second && secondInput) {
    const username = await suggestPortalUsername(secondInput);
    const result = await issuePortalCredentials(clinicId, second.id, username);
    if (result.ok) {
      console.info(`portal credentials: ${result.username} / ${result.temporaryPassword}`);
    }
  }

  // No colour pass. A seeded client's colour is their position in the clinic —
  // `clientSeq` — so they have one the moment they are inserted, the same as a
  // client added from the register or the booking picker. `clients.color` is
  // legacy and read by nothing; see the note on the column.

  // One archived client so the status filter has something to filter.
  const [first] = created;
  if (first) {
    await db.update(clients).set({ status: 'archived' }).where(eq(clients.id, first.id));
  }

  console.info(`seeded ${created.length} clients`);

  await seedCalendar(clinicId, 'أخصائي التغذية', created);
  await seedReferenceData();
}

/**
 * Guarantees the clinic has the seven working-hours rows every screen under
 * `/app` depends on.
 *
 * A complete week is left exactly as it is, so a dietitian who has changed their
 * opening hours does not have them silently reset by a re-seed of the client
 * fixtures.
 */
async function ensureClinicSchedule(clinicId: string): Promise<void> {
  const existing = await db
    .select({ weekday: clinicWorkingHours.weekday })
    .from(clinicWorkingHours)
    .where(eq(clinicWorkingHours.clinicId, clinicId));

  if (existing.length === 7) return;

  // A partial set is as broken as an empty one — `getClinicProfile` wants
  // exactly seven — and there is no way to know which of the present rows were
  // edited on purpose, so the whole week is rewritten from the defaults.
  if (existing.length > 0) {
    await db.delete(clinicWorkingHours).where(eq(clinicWorkingHours.clinicId, clinicId));
  }

  await db.insert(clinicWorkingHours).values(defaultClinicScheduleRows(clinicId));
  console.info('restored the clinic working-hours schedule');
}

/**
 * The two shared reference tables, in the only order that works: every dish
 * ingredient resolves to a `foods` row by `fdc_id`, so foods must land first.
 *
 * Neither is scoped to a clinic, so both are upserted rather than deleted and
 * rewritten, and both survive re-seeding the clients above.
 *
 * The dish catalog is not optional garnish. It is the only thing weekly-plan
 * generation may choose from — `loadCatalog` returning nothing makes the feature
 * refuse with `errors.emptyCatalog` — so a database seeded without it looks
 * fully set up and cannot generate a plan. `db:seed:dishes` still exists for
 * reseeding the catalog alone after editing `data/dishes.json`.
 *
 * No sample plan is seeded. A weekly plan needs a nutrition profile with a meal
 * schedule and then either a model call or a hand-built board, which is more
 * machinery than a seed should own. Generate one from a client's board instead.
 */
async function seedReferenceData(): Promise<void> {
  // Catalog before dishes, always: every ingredient resolves to a `catalog_foods`
  // row, and `seedDishes` refuses rather than writing a recipe it cannot join.
  const catalog = await seedCatalogFoods({ apply: true });
  console.info(
    `seeded catalog: ${catalog.foodsCreated} created, ${catalog.foodsUpdated} updated, ` +
      `${catalog.foodsUnchanged} unchanged, ${catalog.portionsWritten} portions, ${catalog.aliasesWritten} aliases`,
  );

  const { dishes: dishCount, ingredients } = await seedDishes();
  console.info(`seeded ${dishCount} dishes, ${ingredients} ingredients`);
}

/**
 * The clinic's single practitioner and a handful of appointments, so the
 * calendar has something to draw on a fresh database.
 *
 * One practitioner, because the account holder *is* the doctor — the app never
 * asks who an appointment is with. `ensurePractitioner` is the same function the
 * app uses, so the seed cannot drift from the runtime behaviour.
 *
 * `reason` is deliberately left unset on every appointment: the field has no
 * default anywhere, including here, so the popup opens on an empty box with only
 * its placeholder showing.
 */
async function seedCalendar(
  clinicId: string,
  ownerName: string,
  seededClients: { id: string }[],
): Promise<void> {
  // Appointments cascade from practitioners, so this clears both.
  await db.delete(practitioners).where(eq(practitioners.clinicId, clinicId));

  const practitionerId = await ensurePractitioner({ clinicId, ownerName });
  await db.update(practitioners).set({ color: paletteColorAt(0) }).where(eq(practitioners.id, practitionerId));

  const today = toIsoDate(new Date());

  // One earlier today so the derived "completed" state is visible on load, one
  // later today, and one tomorrow. Rule 5 means a different client each day.
  const schedule = [
    { date: today, startMinute: 8 * 60 + 30, durationMinutes: 45, client: 1 },
    { date: today, startMinute: 11 * 60, durationMinutes: 60, client: 2 },
    { date: addDays(today, 1), startMinute: 9 * 60, durationMinutes: 30, client: 3 },
  ];

  const rows = schedule
    .map((entry) => {
      const client = seededClients[entry.client];
      if (!client) return null;

      return {
        clinicId,
        practitionerId,
        clientId: client.id,
        date: entry.date,
        startMinute: entry.startMinute,
        durationMinutes: entry.durationMinutes,
      };
    })
    .filter((row) => row !== null);

  if (rows.length > 0) {
    // The clinic is closed at weekends, so a seeded date can fall on a day the
    // validator would reject. That is fine for a fixture — the constraints that
    // matter (no overlap, one per client per day) still apply.
    await db.insert(appointments).values(rows);
  }

  console.info(`seeded 1 practitioner and ${rows.length} appointments`);
}

await seed();
process.exit(0);
