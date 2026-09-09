'use server';

import { and, count, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { db } from '@/db';
import { session as sessionTable, user } from '@/db/schema/auth';
import { clients } from '@/db/schema/clients';
import { clinics } from '@/db/schema/clinics';
import { locales } from '@/i18n/routing';
import { requireAdminSession } from '@/lib/session';

import { writeAudit } from './audit';
import { isUsableReason, REASON_MAX_LENGTH, type AdminActionKey } from './audit-rules';
import { sharedFoodSchema, updateSharedFood } from './catalog';
import { loadPlanCatalog } from './plan-catalog';
import { parsePlanPrice } from './plans';
import { countActiveAdmins } from './queries';

/**
 * The platform's writes.
 *
 * ## Every one of them starts with `requireAdminSession`
 *
 * That is not belt and braces over the layout's guard: a server action is a
 * public endpoint, reachable by its id from any page that ever rendered it, so a
 * layout can protect what a reader *sees* and never what they can *post*. The
 * same argument `requireStaffSession` is written on.
 *
 * ## Every one of them writes to the audit log
 *
 * Including the ones that fail. A refused attempt — the last admin trying to
 * disable themselves, a promotion blocked because the clinic still has patients
 * — is recorded with `outcome: 'refused'`, because "somebody tried this and the
 * system said no" is exactly what a later review wants to see, and a log of only
 * successes cannot show an attempt.
 *
 * Where the write is transactional, the log entry is inside the same transaction
 * on purpose: a panel that can suspend a clinic and then fail to record it has a
 * log that is worse than none, because it looks complete.
 *
 * ## Destructive verbs require a reason
 *
 * Validated here and enforced again in `writeAudit`, which throws. The dialog
 * that collects it disables its own button, which stops a mis-click and nothing
 * else.
 */

export type AdminActionState = { status: 'idle' | 'ok' | 'error'; message?: string };

const reasonField = z.string().trim().max(REASON_MAX_LENGTH).optional();

const clinicInput = z.object({
  clinicId: z.string().uuid(),
  locale: z.enum(locales),
  reason: reasonField,
});

const accountInput = z.object({
  userId: z.string().min(1),
  locale: z.enum(locales),
  reason: reasonField,
});

/**
 * Records an attempt the system turned down, then returns the refusal.
 *
 * A helper rather than four copies, because the thing most likely to rot is the
 * branch nobody exercises — and every one of these branches is a branch nobody
 * exercises until the day it matters.
 */
async function refuse(
  action: AdminActionKey,
  actor: { id: string; email: string },
  target: { id: string; label: string },
  message: string,
  reason?: string | null,
): Promise<AdminActionState> {
  await writeAudit({
    action,
    actorId: actor.id,
    actorEmail: actor.email,
    targetId: target.id,
    targetLabel: target.label,
    outcome: 'refused',
    /*
      A refusal carries whatever reason was typed, and `writeAudit`'s
      required-reason check does not apply to it — the operator may well have
      been stopped before they got as far as the box. Passing a placeholder to
      satisfy the check would put a sentence in the log that nobody wrote.
    */
    reason: reason ?? null,
    after: { refused: message },
  }).catch(() => {
    /*
      A failure to log a refusal must not turn into a 500 on top of the refusal.
      The operator is already being told no; swallowing this keeps the message
      they need in front of them. The successful paths deliberately do NOT do
      this — there the log write is inside the transaction and a failure rolls
      the action back with it.
    */
  });

  return { status: 'error', message };
}

/* ── Clinics ───────────────────────────────────────────────────────────────── */

/**
 * Turns a clinic off, or back on.
 *
 * ## What suspending actually does
 *
 * It writes `clinics.suspended_at` and deletes the session rows of everyone who
 * works there. The two do different jobs, and it is worth being exact about
 * which one does which.
 *
 * **The column is what makes it immediate.** `requireStaffSession` reads it on
 * every staff request — page or server action — through `isClinicSuspended`,
 * which goes to the database. A dietitian with the app already open is turned
 * away at their very next request, before anything renders.
 *
 * **Deleting the sessions is what makes it durable.** It does NOT take effect
 * instantly, and assuming it does would be the mistake here: Better Auth caches
 * a session in a signed cookie for `SESSION_COOKIE_CACHE_SECONDS` — sixty — so
 * for up to a minute a deleted row is still honoured without anything going back
 * to the table to notice. The column check is what covers that window; the
 * deletion is what stops the session living out its full term afterwards.
 *
 * ## What it deliberately does not do
 *
 * It does not touch the clinic's clients or their portal sessions. Suspension is
 * the platform's dispute with the practice; a patient is not a party to it, and
 * taking away their meal plan to apply pressure to their dietitian punishes the
 * one person who cannot resolve it.
 *
 * Reactivating clears the timestamp and nothing else. The deleted sessions are
 * not restored — signing in again is the ordinary cost of having been suspended.
 */
export async function setClinicSuspensionAction(
  suspended: boolean,
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = clinicInput.safeParse({
    clinicId: formData.get('clinicId'),
    locale: formData.get('locale'),
    reason: formData.get('reason') ?? undefined,
  });

  if (!parsed.success) return { status: 'error', message: 'invalid' };

  const session = await requireAdminSession(parsed.data.locale);
  const actor = { id: session.user.id, email: session.user.email };
  const { clinicId, locale, reason } = parsed.data;

  const [clinic] = await db
    .select({ name: clinics.name, suspendedAt: clinics.suspendedAt })
    .from(clinics)
    .where(eq(clinics.id, clinicId))
    .limit(1);

  if (!clinic) return { status: 'error', message: 'notFound' };

  const action: AdminActionKey = suspended ? 'clinic.suspend' : 'clinic.reactivate';
  const target = { id: clinicId, label: clinic.name };

  if (suspended && !isUsableReason(reason)) {
    return refuse(action, actor, target, 'reasonRequired', reason);
  }

  const at = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(clinics)
      .set({ suspendedAt: suspended ? at : null, updatedAt: at })
      .where(eq(clinics.id, clinicId));

    if (suspended) {
      /*
        Every staff account at this clinic, signed out.

        A subquery inside the delete rather than two round trips: reading the ids
        and then deleting by them leaves a gap in which a dietitian can sign in
        and keep a session the sweep never saw. One statement has no such gap,
        and it is inside the same transaction as the column write, so a clinic is
        never marked suspended with its sessions left standing.

        The role filter states the intent. A client's `clinic_id` is null, so
        this cannot reach a patient's portal session even without it — but
        suspension deliberately leaves the portal alone, and that should be
        legible here rather than inferred from a column being null somewhere
        else.
      */
      await tx.delete(sessionTable).where(
        inArray(
          sessionTable.userId,
          tx
            .select({ id: user.id })
            .from(user)
            .where(and(eq(user.clinicId, clinicId), eq(user.role, 'staff'))),
        ),
      );
    }

    await writeAudit(
      {
        action,
        actorId: actor.id,
        actorEmail: actor.email,
        targetId: clinicId,
        targetLabel: clinic.name,
        reason,
        before: { suspendedAt: clinic.suspendedAt?.toISOString() ?? null },
        after: { suspendedAt: suspended ? at.toISOString() : null },
      },
      tx,
    );
  });

  revalidatePath(`/${locale}/admin/clinics`);
  revalidatePath(`/${locale}/admin/clinics/${clinicId}`);
  revalidatePath(`/${locale}/admin`);

  return { status: 'ok' };
}

const planInput = z.object({
  clinicId: z.string().uuid(),
  locale: z.enum(locales),
  /*
    Any non-empty string here, checked against the catalogue in the handler
    rather than baked into the schema. The set of packages is a table now, and a
    `z.enum` built at module load would be a snapshot of it that goes stale the
    moment the operator adds one.
  */
  plan: z.string().min(1).max(40),
  /** Blank means "whatever the tier lists" — see `monthlyPriceOf`. */
  price: z.string().max(20).optional(),
  /** `YYYY-MM-DD`, or blank to clear. */
  trialEndsAt: z.string().max(10).optional(),
  reason: reasonField,
});

/**
 * Moves a clinic onto a tier, and optionally onto its own price.
 *
 * ## The price is stored on the clinic, not derived from the tier
 *
 * A blank price field means "use the tier's" and stores null; a number stores
 * that number. The same reasoning `client_charges` uses for keeping its own
 * amount: raising the list price of `pro` next year must not silently rewrite
 * what a clinic on a negotiated deal is recorded as paying.
 *
 * **Zero is a real price and not a blank.** A pilot at no charge is exactly the
 * arrangement an operator needs the revenue screen to be honest about, so an
 * entered `0` is stored as `0` and only an empty string clears the override.
 *
 * ## It does not require a reason
 *
 * Nothing is taken away, and the `before`/`after` pair in the log already states
 * the whole change — from which tier, to which, at what price. A required
 * sentence there would be ceremony.
 */
export async function updateClinicPlanAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = planInput.safeParse({
    clinicId: formData.get('clinicId'),
    locale: formData.get('locale'),
    plan: formData.get('plan'),
    price: formData.get('price') ?? undefined,
    trialEndsAt: formData.get('trialEndsAt') ?? undefined,
    reason: formData.get('reason') ?? undefined,
  });

  if (!parsed.success) return { status: 'error', message: 'invalid' };

  const session = await requireAdminSession(parsed.data.locale);
  const { clinicId, locale, plan, price, trialEndsAt, reason } = parsed.data;

  const rawPrice = price?.trim() ?? '';
  const priceMinor = rawPrice === '' ? null : parsePlanPrice(rawPrice);

  if (rawPrice !== '' && priceMinor === null) return { status: 'error', message: 'badPrice' };

  const rawTrial = trialEndsAt?.trim() ?? '';
  /*
    Parsed as a UTC midnight rather than through `new Date(string)` with a bare
    date, which some runtimes read as local time. A trial that ends "on the 30th"
    should end at the same instant regardless of where the server is.
  */
  const trialDate = rawTrial === '' ? null : new Date(`${rawTrial}T00:00:00.000Z`);

  if (trialDate !== null && Number.isNaN(trialDate.getTime())) {
    return { status: 'error', message: 'badDate' };
  }

  /*
    The package has to exist. `plan` is now a free string in the schema — see
    the note there — so this is where a key that names nothing is refused,
    against the table rather than against a constant compiled last release.

    An ARCHIVED package is accepted: the picker does not offer one, but a clinic
    already sitting on a retired package must be able to have its price or trial
    date saved without being silently moved off it.
  */
  const catalog = await loadPlanCatalog();
  if (!catalog.byKey.has(plan)) return { status: 'error', message: 'invalid' };

  const [clinic] = await db
    .select({
      name: clinics.name,
      plan: clinics.plan,
      planPriceMinor: clinics.planPriceMinor,
      trialEndsAt: clinics.trialEndsAt,
    })
    .from(clinics)
    .where(eq(clinics.id, clinicId))
    .limit(1);

  if (!clinic) return { status: 'error', message: 'notFound' };

  const at = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(clinics)
      .set({
        plan,
        planPriceMinor: priceMinor,
        trialEndsAt: trialDate,
        // Only when the tier itself moves. Re-saving the same plan with a new
        // price is not the start of a new subscription.
        planStartedAt: clinic.plan === plan ? undefined : at,
        updatedAt: at,
      })
      .where(eq(clinics.id, clinicId));

    await writeAudit(
      {
        action: 'clinic.plan.update',
        actorId: session.user.id,
        actorEmail: session.user.email,
        targetId: clinicId,
        targetLabel: clinic.name,
        reason,
        before: {
          plan: clinic.plan,
          planPriceMinor: clinic.planPriceMinor,
          trialEndsAt: clinic.trialEndsAt?.toISOString() ?? null,
        },
        after: {
          plan,
          planPriceMinor: priceMinor,
          trialEndsAt: trialDate?.toISOString() ?? null,
        },
      },
      tx,
    );
  });

  revalidatePath(`/${locale}/admin/clinics`);
  revalidatePath(`/${locale}/admin/clinics/${clinicId}`);
  revalidatePath(`/${locale}/admin/revenue`);

  return { status: 'ok' };
}

/* ── Accounts ──────────────────────────────────────────────────────────────── */

/**
 * Disables an account, or enables it again.
 *
 * Same two-part shape as clinic suspension, for the same reasons: the column is
 * what makes it immediate (`requireRole` reads it through `isAccountDisabled` on
 * every request), and deleting the session rows is what makes it durable past
 * the sixty-second cookie cache.
 *
 * ## Two things it refuses to do
 *
 * **It will not disable the account pressing the button.** Locking yourself out
 * of the only screen that could let you back in is not a state worth supporting,
 * and the check is here rather than in the UI because the UI is a suggestion.
 *
 * **It will not disable the last enabled admin.** With no admin left, nothing can
 * reach `/admin` at all, and the only way back is `bun run admin:sync` on a
 * machine with database access. That is a recoverable state, not a lost one — but
 * it should be entered deliberately from a terminal, not by a mis-click on a row.
 *
 * Both refusals are recorded.
 */
export async function setAccountDisabledAction(
  disabled: boolean,
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = accountInput.safeParse({
    userId: formData.get('userId'),
    locale: formData.get('locale'),
    reason: formData.get('reason') ?? undefined,
  });

  if (!parsed.success) return { status: 'error', message: 'invalid' };

  const session = await requireAdminSession(parsed.data.locale);
  const actor = { id: session.user.id, email: session.user.email };
  const { userId, locale, reason } = parsed.data;

  const [target] = await db
    .select({ role: user.role, email: user.email, name: user.name, disabledAt: user.disabledAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!target) return { status: 'error', message: 'notFound' };

  const action: AdminActionKey = disabled ? 'account.disable' : 'account.enable';
  const subject = { id: userId, label: target.email };

  if (disabled) {
    if (userId === session.user.id) return refuse(action, actor, subject, 'self', reason);

    if (!isUsableReason(reason)) return refuse(action, actor, subject, 'reasonRequired', reason);

    if (target.role === 'admin' && (await countActiveAdmins()) <= 1) {
      return refuse(action, actor, subject, 'lastAdmin', reason);
    }
  }

  const at = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ disabledAt: disabled ? at : null, updatedAt: at })
      .where(eq(user.id, userId));

    if (disabled) await tx.delete(sessionTable).where(eq(sessionTable.userId, userId));

    await writeAudit(
      {
        action,
        actorId: actor.id,
        actorEmail: actor.email,
        targetId: userId,
        targetLabel: target.email,
        reason,
        before: { disabledAt: target.disabledAt?.toISOString() ?? null },
        after: { disabledAt: disabled ? at.toISOString() : null },
      },
      tx,
    );
  });

  revalidatePath(`/${locale}/admin/accounts`);
  revalidatePath(`/${locale}/admin`);

  return { status: 'ok' };
}

/**
 * Grants the platform role.
 *
 * The self-service half of `bun run admin:sync`, and it carries the same rule
 * the script does: promoting detaches the account from its clinic, because an
 * admin holds no `clinicId` and `requireStaffClinic` must never be able to hand
 * one a tenant scope.
 *
 * **It refuses to promote a dietitian whose clinic still has clients**, for the
 * reason the script gives at length: the practice would be left with nobody able
 * to open it. There is no `--force` here — a terminal is the right place for
 * that decision, not a button.
 *
 * **Demoting is deliberately not offered.** An admin has no clinic, so turning
 * one back into staff would produce an account that satisfies
 * `requireStaffSession` and then throws in `requireStaffClinic` on the very next
 * line. Making that work means choosing a clinic to put them in, which is a
 * different feature from a toggle. Disable the account instead.
 *
 * A reason is required: this is the action that hands somebody the keys.
 */
export async function promoteToAdminAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = accountInput.safeParse({
    userId: formData.get('userId'),
    locale: formData.get('locale'),
    reason: formData.get('reason') ?? undefined,
  });

  if (!parsed.success) return { status: 'error', message: 'invalid' };

  const session = await requireAdminSession(parsed.data.locale);
  const actor = { id: session.user.id, email: session.user.email };
  const { userId, locale, reason } = parsed.data;

  const [target] = await db
    .select({ role: user.role, clinicId: user.clinicId, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!target) return { status: 'error', message: 'notFound' };

  const subject = { id: userId, label: target.email };

  // A client account is a patient's. Promoting one would strip them of their
  // own records, which is what `admin:sync` refuses for the same reason.
  if (target.role !== 'staff') return refuse('account.promote', actor, subject, 'notStaff', reason);

  if (!isUsableReason(reason)) {
    return refuse('account.promote', actor, subject, 'reasonRequired', reason);
  }

  if (target.clinicId) {
    const [held] = await db
      .select({ total: count() })
      .from(clients)
      .where(eq(clients.clinicId, target.clinicId));

    if ((held?.total ?? 0) > 0) {
      return refuse('account.promote', actor, subject, 'hasClients', reason);
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ role: 'admin', clinicId: null, updatedAt: new Date() })
      .where(and(eq(user.id, userId), eq(user.role, 'staff')));

    await writeAudit(
      {
        action: 'account.promote',
        actorId: actor.id,
        actorEmail: actor.email,
        targetId: userId,
        targetLabel: target.email,
        reason,
        before: { role: 'staff', clinicId: target.clinicId },
        after: { role: 'admin', clinicId: null },
      },
      tx,
    );
  });

  revalidatePath(`/${locale}/admin/accounts`);

  return { status: 'ok' };
}

/* ── Shared catalog ────────────────────────────────────────────────────────── */

/**
 * Saves the curated half of a shared food.
 *
 * Nutrition is not in the schema, so it cannot arrive here even if a field for
 * it were added to the form — see the header of `catalog.ts` for why that half
 * belongs to `db:build-catalog` rather than to a person with a text box.
 *
 * The log entry carries the whole submitted record as `after`. That is a
 * departure from "only the fields that changed" and it is deliberate here: the
 * curated half is six short fields, and a food is the one target on this panel
 * whose edits arrive in batches, where seeing the state it was saved in matters
 * more than isolating which of the six moved.
 */
export async function saveSharedFoodAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const locale = formData.get('locale');
  const parsedLocale = z.enum(locales).safeParse(locale);
  if (!parsedLocale.success) return { status: 'error', message: 'invalid' };

  const session = await requireAdminSession(parsedLocale.data);

  const parsed = sharedFoodSchema.safeParse({
    foodId: formData.get('foodId'),
    nameAr: formData.get('nameAr'),
    nameEn: formData.get('nameEn'),
    state: formData.get('state'),
    category: formData.get('category'),
    // An unchecked checkbox is absent from the payload rather than 'false'.
    isActive: formData.get('isActive') === 'on',
  });

  if (!parsed.success) return { status: 'error', message: 'invalid' };

  const saved = await updateSharedFood(parsed.data);
  if (!saved) return { status: 'error', message: 'notFound' };

  await writeAudit({
    action: 'catalog.food.update',
    actorId: session.user.id,
    actorEmail: session.user.email,
    targetId: parsed.data.foodId,
    targetLabel: parsed.data.nameEn,
    before: saved.before,
    after: {
      nameAr: parsed.data.nameAr,
      nameEn: parsed.data.nameEn,
      state: parsed.data.state,
      category: parsed.data.category,
      isActive: parsed.data.isActive,
    },
  });

  revalidatePath(`/${parsedLocale.data}/admin/catalog`);
  revalidatePath(`/${parsedLocale.data}/admin/catalog/${parsed.data.foodId}`);

  return { status: 'ok' };
}
