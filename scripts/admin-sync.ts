/**
 * Promotes the accounts named in `ADMIN_EMAILS` to the `admin` role — run with
 * `bun run admin:sync`.
 *
 * ## Why a script and not a check in the guard
 *
 * `requireAdminSession` reads `users.role` and never looks at the environment.
 * It would have been fewer lines to let the guard accept "or the email is in
 * `ADMIN_EMAILS`", and it would have been worse in three ways: the answer to
 * "who can reach the platform area" would live in two places that can disagree,
 * a typo in a deployment's environment would silently grant or revoke access to
 * a *live session*, and there would be no row anywhere recording that the grant
 * happened. The database is the authority; this script is how the environment
 * gets a say, once, deliberately, with output.
 *
 * ## What it will not do
 *
 * It refuses to promote an account whose clinic still holds clients, unless
 * `--force` is passed. An admin holds no `clinicId` — see `UserRole` — so
 * promoting a working dietitian detaches them from the practice they are in the
 * middle of running, and every one of their clients would be left in a clinic
 * with nobody able to open it. Use a separate address for the platform account.
 *
 * It also never demotes. Removing an address from `ADMIN_EMAILS` and re-running
 * is not a revocation, and this script does not pretend otherwise: taking access
 * away is done from the Accounts screen, or by hand, and either way it should be
 * a decision someone made rather than a side effect of editing a variable.
 */

import { and, count, eq, inArray, ne } from 'drizzle-orm';

import { db } from '../src/db';
import { user } from '../src/db/schema/auth';
import { clients } from '../src/db/schema/clients';
import { clinics } from '../src/db/schema/clinics';
import { weeklyPlanGenerations } from '../src/db/schema/weekly-plans';

/** Same normalisation the auth paths use: an address is compared trimmed and lowercased. */
function normalise(email: string): string {
  return email.trim().toLowerCase();
}

function readAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS;

  if (!raw?.trim()) {
    throw new Error(
      'ADMIN_EMAILS is not set. Add it to .env.local as a comma-separated list of addresses that should reach /admin.',
    );
  }

  const emails = [...new Set(raw.split(',').map(normalise).filter(Boolean))];

  if (!emails.length) {
    throw new Error('ADMIN_EMAILS is set but contains no addresses.');
  }

  return emails;
}

/**
 * How many clients the account's clinic still holds.
 *
 * The question is about the clinic, not the person: a second dietitian in a
 * shared practice is just as disruptive to promote as the founder, because the
 * clinic is what the promotion detaches them from.
 */
async function clientsInClinic(clinicId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(clients)
    .where(eq(clients.clinicId, clinicId));

  return row?.total ?? 0;
}

/**
 * Removes the clinic a promoted account leaves behind, if nothing is left in it.
 *
 * Sign-up mints a clinic for every staff account — see the `user.create.before`
 * hook — so an address registered specifically to become an admin arrives here
 * owning an empty one, and the promotion detaches it. Without this the row
 * survives with no staff and no clients, and it is not harmless: the platform
 * screens count clinics, so every bootstrap would permanently overstate how many
 * practices are on the deployment. The AI usage screen is where it shows up
 * first, reporting a clinic that "has not generated a plan" and never will.
 *
 * Deliberately conservative. It deletes only when the clinic has no other staff,
 * no clients, and no generation history, and it re-checks all three against the
 * database rather than trusting what was read before the update. `clinics` is
 * the root of a wide cascade; the cost of a wrong `true` here is somebody's
 * practice, and the cost of a wrong `false` is one tidy-up left undone.
 */
async function dropClinicIfEmpty(clinicId: string, promotedUserId: string): Promise<boolean> {
  const [staff] = await db
    .select({ total: count() })
    .from(user)
    // Excluding the account just promoted: its `clinic_id` is null now, but
    // saying so here keeps the query honest if that ever stops being true.
    .where(and(eq(user.clinicId, clinicId), ne(user.id, promotedUserId)));

  if ((staff?.total ?? 0) > 0) return false;

  const [held] = await db.select({ total: count() }).from(clients).where(eq(clients.clinicId, clinicId));
  if ((held?.total ?? 0) > 0) return false;

  /*
    A clinic with no clients should have no generations either. Checked anyway,
    because `weekly_plan_generations.clinic_id` is `on delete cascade` and that
    table is the only record of what the platform has spent — deleting a clinic
    silently erases its history, which is exactly the thing not to get wrong.
  */
  const [runs] = await db
    .select({ total: count() })
    .from(weeklyPlanGenerations)
    .where(eq(weeklyPlanGenerations.clinicId, clinicId));

  if ((runs?.total ?? 0) > 0) return false;

  await db.delete(clinics).where(eq(clinics.id, clinicId));
  return true;
}

async function sync(force: boolean): Promise<void> {
  const emails = readAdminEmails();

  const accounts = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      clinicId: user.clinicId,
    })
    .from(user)
    .where(inArray(user.email, emails));

  const found = new Set(accounts.map((account) => normalise(account.email)));
  for (const email of emails) {
    if (!found.has(email)) {
      console.warn(`skip  ${email} — no account with that address. Sign up first, then re-run.`);
    }
  }

  let promoted = 0;

  for (const account of accounts) {
    if (account.role === 'admin') {
      console.info(`ok    ${account.email} — already an admin.`);
      continue;
    }

    if (account.role !== 'staff') {
      // A client account reaches the portal and is provisioned by a dietitian.
      // Promoting one would strip a patient of their own records.
      console.warn(`skip  ${account.email} — role is "${account.role}", not "staff". Refusing.`);
      continue;
    }

    if (account.clinicId) {
      const total = await clientsInClinic(account.clinicId);

      if (total > 0 && !force) {
        console.warn(
          `skip  ${account.email} — its clinic still holds ${total} client(s). ` +
            'Promoting detaches the account from that clinic and leaves nobody able to open it. ' +
            'Use a separate address for the platform account, or pass --force if you are certain.',
        );
        continue;
      }
    }

    /*
      `clinicId: null` is not tidying up — it is the promotion. An admin with a
      lingering clinic id would satisfy `requireStaffClinic` if any code ever
      called it with an admin session, which is precisely the crossing the two
      guards exist to prevent.
    */
    await db
      .update(user)
      .set({ role: 'admin', clinicId: null, updatedAt: new Date() })
      .where(and(eq(user.id, account.id), eq(user.role, 'staff')));

    console.info(`grant ${account.email} — promoted to admin.`);
    promoted += 1;

    if (account.clinicId && (await dropClinicIfEmpty(account.clinicId, account.id))) {
      console.info(`      removed the empty clinic it was signed up with.`);
    }
  }

  console.info(`
done. ${promoted} account(s) promoted, ${accounts.length - promoted} unchanged.`);
}

const force = process.argv.includes('--force');

/*
  A missing or empty `ADMIN_EMAILS` is the commonest way to run this wrong, and
  it is a configuration mistake rather than a crash. Print the sentence and
  leave; a stack trace through Bun's loader tells the reader nothing they can
  act on.
*/
try {
  await sync(force);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

process.exit(0);
