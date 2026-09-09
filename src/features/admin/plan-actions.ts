'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { clinics } from '@/db/schema/clinics';
import { platformPlans } from '@/db/schema/platform-plans';
import { locales } from '@/i18n/routing';
import { requireAdminSession } from '@/lib/session';

import { writeAudit } from './audit';
import { isUsableReason, REASON_MAX_LENGTH } from './audit-rules';
import { parsePlanKey, parsePlanPrice } from './plans';

/**
 * The writes behind the packages screen.
 *
 * ## Its own file, not `actions.ts`
 *
 * That file is the platform's writes against *clinics, accounts and foods* —
 * things the operator does to a tenant. These are writes against what the
 * platform sells, which every one of those tenants is priced by, and keeping
 * them apart is what makes "who can change a price" answerable by reading one
 * file rather than scrolling past nine unrelated handlers.
 *
 * ## What cannot be changed
 *
 * **A package's key.** It is what `clinics.plan` stores, on every clinic that
 * has ever taken the package, and there is no foreign key to cascade a rename
 * through — so renaming it would silently orphan every one of them onto the
 * fallback. The display name is the thing an operator actually wants to change
 * and it is separately editable, which is why the two are different columns.
 *
 * **A package is never deleted.** {@link archivePlanAction} retires it: gone
 * from the pickers, still pricing whoever is on it. See the schema note.
 *
 * ## Every one of them is audited
 *
 * Through `writeAudit`, inside the same transaction as the change, with the
 * before/after pair — so "who put the price up" is a query rather than a
 * conversation. Archiving requires a reason; the rest do not, because the pair
 * already says what happened. See `audit-rules.ts`.
 */

/**
 * What the form may be told, as a closed set.
 *
 * A union rather than `string` so the message and the catalogue cannot drift:
 * adding a refusal here without adding the sentence for it stops the build,
 * which is the only reliable way a form ends up with a real explanation instead
 * of a generic "could not save".
 */
export type PlanActionMessage =
  | 'invalid'
  | 'badPrice'
  | 'badLimit'
  | 'badKey'
  | 'duplicateKey'
  | 'notFound'
  | 'lastPlan'
  | 'reasonRequired';

export type PlanActionState = { status: 'idle' | 'ok' | 'error'; message?: PlanActionMessage };

const reasonField = z.string().max(REASON_MAX_LENGTH).optional();

/** Shared shape. Blank optional numbers mean "uncounted", not zero. */
const planFields = {
  locale: z.enum(locales),
  nameEn: z.string().trim().min(1).max(60),
  nameAr: z.string().trim().min(1).max(60),
  price: z.string().max(20),
  seats: z.string().max(6).optional(),
  aiPlansPerMonth: z.string().max(8).optional(),
  trialDays: z.string().max(4).optional(),
  rank: z.string().max(4).optional(),
};

const createInput = z.object({ ...planFields, key: z.string().max(40) });
const updateInput = z.object({ ...planFields, id: z.string().uuid() });

/**
 * A blank optional number is `null` — "not counted" — and a written one has to
 * be a non-negative integer. Returns `undefined` for input that is neither,
 * which the callers treat as a validation failure.
 *
 * The three states matter: `null` (unlimited), a number (a limit), and invalid.
 * Collapsing the first two would make "unlimited seats" indistinguishable from
 * "zero seats", which is the difference between the top package and a broken one.
 */
function optionalCount(raw: string | undefined): number | null | undefined {
  const text = (raw ?? '').trim();
  if (text === '') return null;
  if (!/^\d{1,7}$/.test(text)) return undefined;

  return Number(text);
}

function readFields(data: z.infer<typeof updateInput> | z.infer<typeof createInput>) {
  const priceMinor = parsePlanPrice(data.price.trim() === '' ? '0' : data.price);
  const seats = optionalCount(data.seats);
  const aiPlansPerMonth = optionalCount(data.aiPlansPerMonth);
  const trialDays = optionalCount(data.trialDays);
  const rank = optionalCount(data.rank);

  if (priceMinor === null) return { error: 'badPrice' as const };
  if (seats === undefined || aiPlansPerMonth === undefined) return { error: 'badLimit' as const };
  if (trialDays === undefined || rank === undefined) return { error: 'badLimit' as const };

  // Zero seats is a package nobody can use — the check constraint refuses it,
  // and saying so here is better than surrendering a database error to the form.
  if (seats !== null && seats < 1) return { error: 'badLimit' as const };
  if (trialDays !== null && trialDays < 1) return { error: 'badLimit' as const };

  return {
    values: {
      nameEn: data.nameEn,
      nameAr: data.nameAr,
      monthlyPriceMinor: priceMinor,
      seats,
      aiPlansPerMonth,
      trialDays,
      rank: rank ?? 0,
    },
  };
}

/** A new package. The key is written once, here, and never again. */
export async function createPlanAction(
  _previous: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const parsed = createInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: 'error', message: 'invalid' };

  const session = await requireAdminSession(parsed.data.locale);

  const key = parsePlanKey(parsed.data.key);
  if (!key) return { status: 'error', message: 'badKey' };

  const fields = readFields(parsed.data);
  if ('error' in fields) return { status: 'error', message: fields.error };

  const [existing] = await db
    .select({ id: platformPlans.id })
    .from(platformPlans)
    .where(eq(platformPlans.key, key))
    .limit(1);

  // Including an archived one: the key is the identity, and reusing it would
  // re-point every clinic still sitting on the retired package.
  if (existing) return { status: 'error', message: 'duplicateKey' };

  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(platformPlans)
      .values({ key, ...fields.values })
      .returning();

    await writeAudit(
      {
        action: 'plan.create',
        targetId: created!.id,
        targetLabel: `${created!.nameEn} (${key})`,
        before: null,
        after: created!,
        actorId: session.user.id,
        actorEmail: session.user.email,
      },
      tx,
    );
  });

  revalidatePath(`/${parsed.data.locale}/admin/plans`);

  return { status: 'ok' };
}

/** Price, names, allowances, trial length and ordering. Never the key. */
export async function updatePlanAction(
  _previous: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const parsed = updateInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: 'error', message: 'invalid' };

  const session = await requireAdminSession(parsed.data.locale);

  const fields = readFields(parsed.data);
  if ('error' in fields) return { status: 'error', message: fields.error };

  const [before] = await db
    .select()
    .from(platformPlans)
    .where(eq(platformPlans.id, parsed.data.id))
    .limit(1);

  if (!before) return { status: 'error', message: 'notFound' };

  await db.transaction(async (tx) => {
    const [after] = await tx
      .update(platformPlans)
      .set({ ...fields.values, updatedAt: new Date() })
      .where(eq(platformPlans.id, parsed.data.id))
      .returning();

    await writeAudit(
      {
        action: 'plan.update',
        targetId: before.id,
        targetLabel: `${after!.nameEn} (${before.key})`,
        before,
        after: after!,
        actorId: session.user.id,
        actorEmail: session.user.email,
      },
      tx,
    );
  });

  revalidatePath(`/${parsed.data.locale}/admin/plans`);

  return { status: 'ok' };
}

const archiveInput = z.object({
  id: z.string().uuid(),
  locale: z.enum(locales),
  reason: reasonField,
});

/**
 * Retire a package.
 *
 * **Refused when it is the last one offered.** A platform with nothing to sell
 * cannot price a sign-up, and `makePlanCatalog` would be left choosing a
 * fallback from archived rows — which is a state to prevent rather than to
 * handle. The operator adds the replacement first.
 *
 * Clinics on the package are deliberately left where they are. Moving them
 * would be a silent price change on somebody else's subscription, decided by a
 * button labelled "archive"; the screen says how many are affected and the
 * operator moves them deliberately.
 */
export async function archivePlanAction(
  _previous: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const parsed = archiveInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: 'error', message: 'invalid' };

  const session = await requireAdminSession(parsed.data.locale);

  if (!isUsableReason(parsed.data.reason)) return { status: 'error', message: 'reasonRequired' };

  const [before] = await db
    .select()
    .from(platformPlans)
    .where(eq(platformPlans.id, parsed.data.id))
    .limit(1);

  if (!before) return { status: 'error', message: 'notFound' };
  if (before.archivedAt) return { status: 'ok' };

  const [remaining] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(platformPlans)
    .where(and(isNull(platformPlans.archivedAt), ne(platformPlans.id, before.id)));

  if ((remaining?.count ?? 0) === 0) return { status: 'error', message: 'lastPlan' };

  await db.transaction(async (tx) => {
    const at = new Date();
    const [after] = await tx
      .update(platformPlans)
      .set({ archivedAt: at, updatedAt: at })
      .where(eq(platformPlans.id, before.id))
      .returning();

    await writeAudit(
      {
        action: 'plan.archive',
        targetId: before.id,
        targetLabel: `${before.nameEn} (${before.key})`,
        reason: parsed.data.reason,
        before,
        after: after!,
        actorId: session.user.id,
        actorEmail: session.user.email,
      },
      tx,
    );
  });

  revalidatePath(`/${parsed.data.locale}/admin/plans`);

  return { status: 'ok' };
}

const restoreInput = z.object({ id: z.string().uuid(), locale: z.enum(locales) });

/** Put a retired package back on sale. Costs no reason — see `audit-rules.ts`. */
export async function restorePlanAction(
  _previous: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const parsed = restoreInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: 'error', message: 'invalid' };

  const session = await requireAdminSession(parsed.data.locale);

  const [before] = await db
    .select()
    .from(platformPlans)
    .where(eq(platformPlans.id, parsed.data.id))
    .limit(1);

  if (!before) return { status: 'error', message: 'notFound' };
  if (!before.archivedAt) return { status: 'ok' };

  await db.transaction(async (tx) => {
    const [after] = await tx
      .update(platformPlans)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(platformPlans.id, before.id))
      .returning();

    await writeAudit(
      {
        action: 'plan.restore',
        targetId: before.id,
        targetLabel: `${before.nameEn} (${before.key})`,
        before,
        after: after!,
        actorId: session.user.id,
        actorEmail: session.user.email,
      },
      tx,
    );
  });

  revalidatePath(`/${parsed.data.locale}/admin/plans`);

  return { status: 'ok' };
}

/** How many clinics sit on each package, so the screen can warn before retiring one. */
export async function countClinicsByPlan(): Promise<Map<string, number>> {
  const rows = await db
    .select({ plan: clinics.plan, count: sql<number>`count(*)::int` })
    .from(clinics)
    .groupBy(clinics.plan);

  return new Map(rows.map((row) => [row.plan, row.count]));
}
