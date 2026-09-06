'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PLATFORM_PLANS, type PlanKey } from '@/features/admin/plans';
import type { Locale } from '@/i18n/routing';

import { updateClinicPlanAction, type AdminActionState } from '../actions';

const TIER_KEY = {
  trial: 'tier.trial',
  starter: 'tier.starter',
  pro: 'tier.pro',
  clinic: 'tier.clinic',
} as const satisfies Record<PlanKey, string>;

/**
 * Which plan a clinic is on, at what price, and when its trial ends.
 *
 * ## The price field is empty by default, and empty means something
 *
 * Blank stores `null`, which is "charge whatever the tier lists". A number
 * stores that number and the tier's list price stops applying to this clinic.
 * The placeholder says so, because an empty field that quietly means "the
 * default" is indistinguishable from one somebody forgot to fill in.
 *
 * **Zero is a price, not a blank.** A pilot at no charge is a real arrangement,
 * and the action reads an entered `0` as zero rather than as "unset" — which is
 * why it tests the raw string against `''` instead of relying on truthiness.
 *
 * ## The trial date is a native `date` input
 *
 * Not the product's `DatePicker`. That control is built for a dietitian choosing
 * an appointment against a working-hours grid; this is one administrative date
 * typed occasionally by one person, and the native picker is keyboard-correct,
 * localised by the browser, and ships nothing.
 *
 * ## No reason required
 *
 * Nothing is taken away, and the log's before/after pair states the whole change
 * — from which tier, to which, at what price. A required sentence would be
 * ceremony. See `ADMIN_ACTIONS`.
 */
export function PlanForm({
  clinicId,
  locale,
  plan,
  priceInput,
  trialEndsAt,
}: {
  clinicId: string;
  locale: Locale;
  plan: string;
  /** Major units as text — "240" or "240.50" — or empty for the list price. */
  priceInput: string;
  /** `YYYY-MM-DD`, or empty. */
  trialEndsAt: string;
}) {
  const t = useTranslations('admin.plans.form');
  const tPlans = useTranslations('admin.plans');

  const [state, formAction] = useActionState<AdminActionState, FormData>(updateClinicPlanAction, {
    status: 'idle',
  });

  const selectClass =
    'h-10 w-full rounded-md border border-input bg-background px-3 text-body-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="clinicId" value={clinicId} />
      <input type="hidden" name="locale" value={locale} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field>
          <Label htmlFor="plan">{t('plan')}</Label>
          <select id="plan" name="plan" defaultValue={plan} className={selectClass}>
            {PLATFORM_PLANS.map((tier) => (
              <option key={tier.key} value={tier.key}>
                {tPlans(TIER_KEY[tier.key])}
              </option>
            ))}
          </select>
        </Field>

        <Field>
          <Label htmlFor="price">{t('price')}</Label>
          <Input
            id="price"
            name="price"
            defaultValue={priceInput}
            placeholder={t('pricePlaceholder')}
            inputMode="decimal"
            /* LTR regardless of the page: a price is digits, and digits read
               left to right inside Arabic. The label above it does not move. */
            dir="ltr"
            maxLength={20}
          />
        </Field>

        <Field>
          <Label htmlFor="trialEndsAt">{t('trialEndsAt')}</Label>
          <Input id="trialEndsAt" name="trialEndsAt" type="date" defaultValue={trialEndsAt} dir="ltr" />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit">{t('save')}</Button>

        {state.status === 'ok' ? (
          <span role="status" className="text-body-sm text-muted-foreground">
            {t('saved')}
          </span>
        ) : null}

        {state.status === 'error' ? (
          <span role="alert" className="text-body-sm text-status-attention-fg">
            {state.message === 'badPrice'
              ? t('badPrice')
              : state.message === 'badDate'
                ? t('badDate')
                : t('failed')}
          </span>
        ) : null}
      </div>
    </form>
  );
}
