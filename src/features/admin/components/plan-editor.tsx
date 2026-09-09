'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Locale } from '@/i18n/routing';

import {
  archivePlanAction,
  createPlanAction,
  restorePlanAction,
  updatePlanAction,
  type PlanActionState,
} from '../plan-actions';
import { ReasonDialog } from './reason-dialog';

/**
 * The forms behind the packages screen.
 *
 * ## Everything a package is, on one row
 *
 * A package has seven editable fields and there are only ever a handful of
 * packages, so each one is an open form rather than a row with a pencil on it.
 * A modal per edit would put a click and a context switch in front of the most
 * ordinary thing this screen exists for — changing a price — and a table of
 * read-only rows would need the modal anyway.
 *
 * ## The key is shown and cannot be edited
 *
 * It is what `clinics.plan` stores on every clinic that has taken the package,
 * with no foreign key behind it, so a rename would strand all of them on the
 * fallback. Shown because the operator needs to recognise it in the audit log
 * and in a stale-key warning; disabled because there is no safe way to change
 * it. The name beside it is the thing that is meant to change.
 *
 * ## A blank allowance is "unlimited", not zero
 *
 * The three fields that take a count treat empty as `null`. The placeholder
 * says so, because an empty box that means "no limit" and an empty box that
 * means "you have not filled this in yet" look identical.
 */

const numberProps = {
  inputMode: 'numeric' as const,
  dir: 'ltr' as const,
  autoComplete: 'off',
};

export type EditablePlan = {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  /** Major units as text — "240" — so the field round-trips what was typed. */
  priceInput: string;
  seats: string;
  aiPlansPerMonth: string;
  trialDays: string;
  rank: string;
  archived: boolean;
  /** How many clinics are on it, so retiring one can say what it affects. */
  clinics: number;
};

/** The shared name/price/allowance fields, used by both the create and edit forms. */
function PlanFields({ plan }: { plan?: EditablePlan }) {
  const t = useTranslations('admin.packages.fields');

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field>
        <Label htmlFor={`nameEn-${plan?.id ?? 'new'}`}>{t('nameEn')}</Label>
        <Input
          id={`nameEn-${plan?.id ?? 'new'}`}
          name="nameEn"
          defaultValue={plan?.nameEn}
          dir="ltr"
          required
        />
      </Field>

      <Field>
        <Label htmlFor={`nameAr-${plan?.id ?? 'new'}`}>{t('nameAr')}</Label>
        <Input
          id={`nameAr-${plan?.id ?? 'new'}`}
          name="nameAr"
          defaultValue={plan?.nameAr}
          dir="rtl"
          required
        />
      </Field>

      <Field>
        <Label htmlFor={`price-${plan?.id ?? 'new'}`}>{t('price')}</Label>
        <Input
          id={`price-${plan?.id ?? 'new'}`}
          name="price"
          defaultValue={plan?.priceInput}
          placeholder="0"
          {...numberProps}
        />
      </Field>

      <Field>
        <Label htmlFor={`rank-${plan?.id ?? 'new'}`}>{t('rank')}</Label>
        <Input
          id={`rank-${plan?.id ?? 'new'}`}
          name="rank"
          defaultValue={plan?.rank}
          placeholder="0"
          {...numberProps}
        />
      </Field>

      <Field>
        <Label htmlFor={`seats-${plan?.id ?? 'new'}`}>{t('seats')}</Label>
        <Input
          id={`seats-${plan?.id ?? 'new'}`}
          name="seats"
          defaultValue={plan?.seats}
          placeholder={t('unlimited')}
          {...numberProps}
        />
      </Field>

      <Field>
        <Label htmlFor={`ai-${plan?.id ?? 'new'}`}>{t('ai')}</Label>
        <Input
          id={`ai-${plan?.id ?? 'new'}`}
          name="aiPlansPerMonth"
          defaultValue={plan?.aiPlansPerMonth}
          placeholder={t('unlimited')}
          {...numberProps}
        />
      </Field>

      <Field>
        <Label htmlFor={`trial-${plan?.id ?? 'new'}`}>{t('trialDays')}</Label>
        <Input
          id={`trial-${plan?.id ?? 'new'}`}
          name="trialDays"
          defaultValue={plan?.trialDays}
          placeholder={t('noTrial')}
          {...numberProps}
        />
      </Field>
    </div>
  );
}

/** What the server said, as a sentence under the buttons. */
function Feedback({ state }: { state: PlanActionState }) {
  const t = useTranslations('admin.packages.status');

  if (state.status === 'idle') return null;

  return (
    <p
      className={
        state.status === 'ok'
          ? 'text-caption text-status-on-track-fg'
          : 'text-caption text-status-attention-fg'
      }
      role="status"
    >
      {state.status === 'ok' ? t('saved') : t(state.message ?? 'failed')}
    </p>
  );
}

/** One existing package: edit it, and retire or reinstate it. */
export function PlanRow({ plan, locale }: { plan: EditablePlan; locale: Locale }) {
  const t = useTranslations('admin.packages');
  const [state, formAction] = useActionState<PlanActionState, FormData>(updatePlanAction, {
    status: 'idle',
  });
  const [archiveState, archiveAction] = useActionState<PlanActionState, FormData>(
    archivePlanAction,
    { status: 'idle' },
  );
  const [restoreState, restoreAction] = useActionState<PlanActionState, FormData>(
    restorePlanAction,
    { status: 'idle' },
  );

  return (
    <div className="space-y-3 border-t border-border py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          {plan.nameEn}
          <code className="rounded bg-muted px-1.5 py-0.5 text-caption text-muted-foreground" dir="ltr">
            {plan.key}
          </code>
          {plan.archived ? (
            <span className="text-caption text-muted-foreground">{t('archived')}</span>
          ) : null}
        </p>

        <p className="text-caption text-muted-foreground">
          {t('onThisPlan', { count: plan.clinics })}
        </p>
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={plan.id} />
        <input type="hidden" name="locale" value={locale} />

        <PlanFields plan={plan} />

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm">
            {t('save')}
          </Button>
          <Feedback state={state} />
        </div>
      </form>

      {plan.archived ? (
        <form action={restoreAction}>
          <input type="hidden" name="id" value={plan.id} />
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="neutral" size="sm">
            {t('restore')}
          </Button>
          <Feedback state={restoreState} />
        </form>
      ) : (
        /*
          Retiring takes a reason, through the same dialog every other
          consequential verb on this panel uses — so the sentence that ends up
          in the audit log is written the same way whatever is being retired.
        */
        <form action={archiveAction} className="space-y-2">
          <input type="hidden" name="id" value={plan.id} />
          <input type="hidden" name="locale" value={locale} />

          <ReasonDialog
            locale={locale}
            /*
              A quiet trigger, on a screen where the ordinary job is editing a
              price and there is one of these per package. Four red buttons down
              the page read as four warnings and teach the eye to skip them; the
              confirmation behind it is still destructive, which is where the
              weight belongs.
            */
            tone="default"
            trigger={t('archive')}
            title={t('archiveTitle', { name: plan.nameEn })}
            description={
              plan.clinics > 0 ? t('archiveWarning', { count: plan.clinics }) : t('archiveHint')
            }
            confirmLabel={t('archive')}
          />

          <Feedback state={archiveState} />
        </form>
      )}
    </div>
  );
}

/** The new-package form, collapsed until it is wanted. */
export function NewPlanForm({ locale }: { locale: Locale }) {
  const t = useTranslations('admin.packages');
  const tf = useTranslations('admin.packages.fields');
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<PlanActionState, FormData>(createPlanAction, {
    status: 'idle',
  });

  if (!open) {
    return (
      <Button type="button" variant="neutral" onClick={() => setOpen(true)}>
        {t('add')}
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-border p-4">
      <input type="hidden" name="locale" value={locale} />

      <Field>
        <Label htmlFor="key-new">{tf('key')}</Label>
        <Input id="key-new" name="key" dir="ltr" placeholder="group" required />
        {/*
          Said before it is typed, not after it is refused: the key is the one
          field on this screen that can never be corrected later.
        */}
        <p className="text-caption text-muted-foreground">{tf('keyHint')}</p>
      </Field>

      <PlanFields />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm">
          {t('create')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t('cancel')}
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
