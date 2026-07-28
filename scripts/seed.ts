/**
 * Seed script — run with `bun run db:seed`.
 *
 * Executed directly by Bun; there is no tsx/ts-node in this project.
 *
 * Idempotent: re-running replaces the seeded clients rather than duplicating
 * them. It is for local development only and refuses to run in production.
 */
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { account, clients, clinics, user } from '@/db/schema';
import { createClient, invitePortalAccess } from '@/features/clients/mutations';
import { auth } from '@/lib/auth';

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
}

await seed();
process.exit(0);
