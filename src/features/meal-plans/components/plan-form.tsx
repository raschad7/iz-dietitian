'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createPlanAction, updatePlanAction } from '@/features/meal-plans/actions';
import { initialPlanFormState } from '@/features/meal-plans/form-state';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

export type PlanFormValues = {
  id: string;
  title: string;
  notes: string | null;
  clientId: string;
};

export function PlanForm({
  locale,
  clients,
  plan,
  defaultClientId,
}: {
  locale: Locale;
  clients: { id: string; fullName: string }[];
  /** Absent when creating. */
  plan?: PlanFormValues;
  /** Preselected when arriving from a client's page. Validated by the caller. */
  defaultClientId?: string;
}) {
  const t = useTranslations('mealPlans');
  const tCommon = useTranslations('common');

  const [state, formAction] = useActionState(
    plan ? updatePlanAction : createPlanAction,
    initialPlanFormState,
  );

  const errorFor = (field: string) =>
    state.status === 'error' ? state.fieldErrors?.[field]?.[0] : undefined;

  return (
    <form action={formAction} className="max-w-xl space-y-6 text-start">
      <input type="hidden" name="locale" value={locale} />
      {plan ? <input type="hidden" name="planId" value={plan.id} /> : null}

      <Field id="clientId" label={t('fields.client')} error={errorFor('clientId')}>
        {/*
         * The client cannot be changed once the plan exists: moving a day's meals
         * to a different person is a mistake far more often than an intention.
         * The field stays visible, disabled, with the value carried in a hidden
         * input — a disabled input submits nothing.
         */}
        <Select
          id="clientId"
          name={plan ? undefined : 'clientId'}
          defaultValue={plan?.clientId ?? defaultClientId ?? ''}
          disabled={Boolean(plan)}
          required
        >
          <option value="" disabled>
            {t('fields.selectClient')}
          </option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.fullName}
            </option>
          ))}
        </Select>
        {plan ? <input type="hidden" name="clientId" value={plan.clientId} /> : null}
      </Field>

      <Field id="title" label={t('fields.title')} error={errorFor('title')}>
        <Input
          id="title"
          name="title"
          required
          maxLength={120}
          placeholder={t('fields.titlePlaceholder')}
          defaultValue={plan?.title ?? ''}
        />
      </Field>

      <Field id="notes" label={t('fields.notes')} error={errorFor('notes')}>
        <Textarea id="notes" name="notes" rows={3} defaultValue={plan?.notes ?? ''} />
      </Field>

      {state.status === 'error' ? (
        <p role="status" className="text-sm text-destructive">
          {t(state.messageKey)}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <SubmitButton label={tCommon('save')} />
        <Link
          href={plan ? `/app/meal-plans/${plan.id}` : '/app/meal-plans'}
          className={buttonVariants({ variant: 'outline' })}
        >
          {tCommon('cancel')}
        </Link>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const tCommon = useTranslations('common');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? tCommon('loading') : label}
    </Button>
  );
}
