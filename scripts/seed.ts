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
import {
  account,
  appointments,
  clientCheckIns,
  clientPlanAdherence,
  clients,
  clinics,
  clinicWorkingHours,
  METRIC_MAX,
  METRIC_MIN,
  practitioners,
  user,
  type AdherenceLevel,
} from '@/db/schema';
import { addDays, toIsoDate } from '@/features/booking/date';
import { ensurePractitioner } from '@/features/booking/mutations';
import { createClient } from '@/features/clients/mutations';
import { issuePortalCredentials } from '@/features/clients/portal-credentials';
import { defaultClinicScheduleRows } from '@/features/clinic-profile/default-schedule';
import { auth } from '@/lib/auth';
import { paletteColorAt, pickAvatarColor } from '@/lib/avatar-color';

import { seedDishes } from './seed-dishes';
import { seedFoods } from './seed-foods';

const STAFF_EMAIL = 'dietitian@clinic.ps';
const STAFF_PASSWORD = 'clinic-dev-password';

// Fixed (not `suggestUsername`-generated) so the same login always works after
// a fresh `bun run db:seed` — a stable credential to develop and test against.
const SEED_PORTAL_USERNAME = 'zainab';

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

  const created = await Promise.all(SEED_CLIENTS.map((input) => createClient(clinicId, input)));

  // One client gets portal credentials so the granted state — and a working
  // sign-in — is visible in the UI without doing it by hand. Issued through
  // `issuePortalCredentials`, the same path staff use, so the seed cannot drift
  // from the runtime behaviour (and Better Auth's `user`/`account` rows stay in
  // sync with `clients.userId`, unlike a hand-rolled insert).
  const [, second] = created;
  if (second) {
    const result = await issuePortalCredentials(clinicId, second.id, SEED_PORTAL_USERNAME);
    if (result.ok) {
      console.info(`portal credentials: ${result.username} / ${result.temporaryPassword} (must be changed on first sign-in)`);
    } else {
      console.warn(`could not issue portal credentials for "${SEED_PORTAL_USERNAME}": ${result.code}`);
    }

    // Gives the portal test login a real photo on `/portal/profile` instead of
    // the initials fallback. `createClient` has no `photoUrl` input — the
    // practitioner form never sets one, since the photo is the one field on the
    // record the client owns — so this is set directly, the same way as `color`
    // and `status` below.
    await db.update(clients).set({ photoUrl: '/avatars/hiba.png' }).where(eq(clients.id, second.id));

    // And a fortnight of check-ins, so signing in as the portal test login
    // lands on a home screen with a real week and streak instead of the empty
    // state. Scoped to this one seeded client only — every other client's
    // progress card stays genuinely empty until someone actually checks in.
    await seedDemoCheckIns(clinicId, second.id);

    // Plan adherence through yesterday, deliberately stopping short of today:
    // both the home screen and the progress tab read `client_plan_adherence`
    // now (never a mock of their own), so leaving today unlogged means signing
    // in lands on the same "log today" prompt a real client would see, and
    // logging it is what proves the two screens move together.
    await seedDemoPlanAdherence(clinicId, second.id);
  }

  // Give every seeded client a distinct avatar colour, the way
  // `createClientAndBook` does for clients added from the picker.
  for (const [index, client] of created.entries()) {
    const name = SEED_CLIENTS[index]?.fullName ?? client.id;
    await db.update(clients).set({ color: pickAvatarColor(name) }).where(eq(clients.id, client.id));
  }

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
  const foodCount = await seedFoods();
  console.info(`seeded ${foodCount} foods (USDA SR Legacy)`);

  const { dishes: dishCount, ingredients } = await seedDishes();
  console.info(`seeded ${dishCount} dishes, ${ingredients} ingredients`);
}

/**
 * Fourteen days of check-ins ending today, for the portal test login only.
 *
 * Scores ride a plausible 6–10 wave rather than sitting at the maximum every
 * day — a perfect fortnight would read as fake precisely because real weeks
 * do not look like that. The five metrics are derived from the day's score
 * rather than seeded independently: this is fixture data for exercising the
 * home screen, not a stand-in for a real client's answers, so it only needs
 * to be plausible, not independently meaningful.
 */
const DEMO_CHECK_IN_SCORES = [8, 7, 9, 6, 8, 10, 7, 9, 8, 7, 9, 8, 10, 7];

async function seedDemoCheckIns(clinicId: string, clientId: string): Promise<void> {
  const today = toIsoDate(new Date());

  const rows = DEMO_CHECK_IN_SCORES.map((score, daysAgo) => {
    const metricBase = Math.min(METRIC_MAX, Math.max(METRIC_MIN, Math.round(score / 2)));

    return {
      clinicId,
      clientId,
      date: addDays(today, -daysAgo),
      score,
      energy: metricBase,
      sleep: Math.max(METRIC_MIN, metricBase - 1),
      appetite: metricBase,
      mood: Math.min(METRIC_MAX, metricBase + 1),
      water: metricBase,
    };
  });

  await db.insert(clientCheckIns).values(rows);
  console.info(`seeded ${rows.length} demo check-ins for the portal login`);
}

/**
 * Thirteen days of plan adherence ending yesterday, for the portal test login
 * only. A mixed run rather than every day `full`, for the same reason the
 * check-in scores wave instead of maxing out — a perfect run reads as fake.
 */
const DEMO_ADHERENCE_LEVELS: AdherenceLevel[] = [
  'full',
  'full',
  'partial',
  'full',
  'missed',
  'full',
  'full',
  'partial',
  'full',
  'full',
  'missed',
  'partial',
  'full',
];

async function seedDemoPlanAdherence(clinicId: string, clientId: string): Promise<void> {
  const today = toIsoDate(new Date());

  const rows = DEMO_ADHERENCE_LEVELS.map((level, index) => ({
    clinicId,
    clientId,
    // `index + 1`: the most recent entry is yesterday, never today.
    date: addDays(today, -(index + 1)),
    level,
  }));

  await db.insert(clientPlanAdherence).values(rows);
  console.info(`seeded ${rows.length} demo plan-adherence reports for the portal login`);
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
