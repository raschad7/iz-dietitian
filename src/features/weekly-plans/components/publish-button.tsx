'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

import { publishPlanAction, unpublishPlanAction } from '../actions';
import { initialPlanActionState, type PlanActionState } from '../form-state';

/**
 * Publish, or take back.
 *
 * Publishing is disabled while any slot is empty rather than allowed and then
 * refused: the server checks it too, but a button that always fails is a worse way
 * to learn the rule than one that explains itself.
 */
export function PublishButton({
  planId,
  status,
  unfilled,
  locale,
}: {
  planId: string;
  status: string;
  unfilled: number;
  locale: string;
}) {
  const t = useTranslations('weeklyPlans');
  const [publishState, publish] = useActionState(publishPlanAction, initialPlanActionState);
  const [unpublishState, unpublish] = useActionState(unpublishPlanAction, initialPlanActionState);

  if (status === 'published') {
    return (
      <div className="flex flex-col items-end gap-1">
        <form action={unpublish}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="planId" value={planId} />
          <Submit label={t('unpublish')} pendingLabel={t('unpublishing')} variant="outline" />
        </form>
        <Message state={unpublishState} />
      </div>
    );
  }

  if (status !== 'draft') return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={publish}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="planId" value={planId} />
        <Submit
          label={t('publish')}
          pendingLabel={t('publishing')}
          disabled={unfilled > 0}
          title={unfilled > 0 ? t('errors.unfilled') : undefined}
        />
      </form>
      <Message state={publishState} />
    </div>
  );
}

function Submit({
  label,
  pendingLabel,
  disabled,
  title,
  variant,
}: {
  label: string;
  pendingLabel: string;
  disabled?: boolean;
  title?: string;
  variant?: 'outline';
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending || disabled} title={title}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function Message({ state }: { state: PlanActionState }) {
  const t = useTranslations('weeklyPlans');

  if (state.status !== 'error') return null;

  return <p className="text-xs text-destructive">{t(state.messageKey)}</p>;
}
