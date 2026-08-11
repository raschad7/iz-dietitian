'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';

import { publishPlanAction, unpublishPlanAction } from '../actions';
import { initialPlanActionState, type PlanActionState } from '../form-state';

/**
 * Publish, or take back.
 *
 * Publishing is disabled while any slot is empty rather than allowed and then
 * refused: the server checks it too, but a button that always fails is a worse way
 * to learn the rule than one that explains itself.
 *
 * **One control in two states, and it never moves.** The header used to promote
 * a *different* button to the solid fill once a plan went live — publish was
 * green, then "new week" became green and publish turned into an outlined
 * "unpublish" somewhere else in the row. Three things changed at once (which
 * button is green, which is outlined, how many there are) and the row read as a
 * different toolbar rather than as the same one in a new state.
 *
 * Now only this control changes, in place: an eye that fills green to publish
 * and a struck-through eye, outlined, to take it back. The pair is what makes
 * the relationship legible — publishing is what the client can *see*.
 *
 * A published plan therefore has no green button anywhere, and that is the
 * honest reading: the week is finished, and nothing is waiting to be done.
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
      <div className="relative flex flex-col items-end gap-1">
        <form action={unpublish}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="planId" value={planId} />
          <Submit
            label={t('unpublish')}
            pendingLabel={t('unpublishing')}
            icon="eyeOff"
            variant="outline"
            confirmed={publishState.status === 'done'}
          />
        </form>
        <Message state={unpublishState} />
      </div>
    );
  }

  if (status !== 'draft') return null;

  return (
    <div className="relative flex flex-col items-end gap-1">
      <form action={publish}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="planId" value={planId} />
        <Submit
          label={t('publish')}
          pendingLabel={t('publishing')}
          icon="eye"
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
  icon,
  disabled,
  title,
  variant,
  confirmed,
}: {
  label: string;
  pendingLabel: string;
  icon: IconName;
  disabled?: boolean;
  title?: string;
  variant?: 'outline';
  confirmed?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="sm"
      variant={variant}
      disabled={pending || disabled}
      title={title}
      aria-busy={pending}
      data-pending={pending}
      data-confirmed={confirmed || undefined}
      className="planner-publish-button px-3"
    >
      <Icon name={icon} className="planner-publish-icon" />
      {/* Both labels occupy one grid cell, so submitting never changes the
          toolbar's width. Opacity communicates state without moving its peers. */}
      <span className="grid">
        <span className={pending ? 'invisible col-start-1 row-start-1' : 'col-start-1 row-start-1'}>
          {label}
        </span>
        <span
          aria-hidden={!pending}
          className={pending ? 'col-start-1 row-start-1' : 'invisible col-start-1 row-start-1'}
        >
          {pendingLabel}
        </span>
      </span>
    </Button>
  );
}

function Message({ state }: { state: PlanActionState }) {
  const t = useTranslations('weeklyPlans');

  if (state.status !== 'error') return null;

  return (
    <p className="absolute end-0 top-full z-20 mt-1 w-max max-w-72 rounded-md bg-card px-2 py-1 text-caption text-destructive shadow-elevated">
      {t(state.messageKey)}
    </p>
  );
}
