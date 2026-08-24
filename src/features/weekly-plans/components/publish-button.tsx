'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { TooltipHint } from '@/components/ui/tooltip-hint';
import { cn } from '@/lib/utils';

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

  /*
   * Every label the control can ever show, in both states.
   *
   * The width of this button is decided by the longest of them and never by
   * whichever one is on screen. "Publish for the client" and "Unpublish" are not
   * the same length in either language, so publishing used to shrink the button
   * under the pointer and shove the whole action bar sideways — in the same
   * moment the plan went live, which is exactly when the dietitian is watching
   * that row rather than the button. One footprint, four captions.
   */
  const labels = [t('publish'), t('publishing'), t('unpublish'), t('unpublishing')];

  if (status === 'published') {
    return (
      <div className="relative flex flex-col items-end gap-1">
        <form action={unpublish}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="planId" value={planId} />
          <Submit
            label={t('unpublish')}
            pendingLabel={t('unpublishing')}
            labels={labels}
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
          labels={labels}
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
  labels,
  icon,
  disabled,
  title,
  variant,
  confirmed,
}: {
  label: string;
  pendingLabel: string;
  /** Every caption this control can show, so its width never depends on state. */
  labels: readonly string[];
  icon: IconName;
  disabled?: boolean;
  title?: string;
  variant?: 'outline';
  confirmed?: boolean;
}) {
  const { pending } = useFormStatus();

  const button = (
    <Button
      type="submit"
      size="sm"
      variant={variant}
      disabled={pending || disabled}
      aria-busy={pending}
      data-pending={pending}
      data-confirmed={confirmed || undefined}
      className="planner-publish-button px-3"
    >
      <Icon name={icon} className="planner-publish-icon" />
      {/* All four captions occupy one grid cell, so neither submitting nor
          publishing changes the toolbar's width — the cell is as wide as the
          longest of them in whatever language is loaded. Only one is ever
          visible; the rest are `invisible`, which reserves their box without
          drawing them or announcing them. */}
      <span className="grid">
        {labels.map((caption, index) => {
          // By index, so two states that happen to share a caption still render
          // exactly one visible label rather than two stacked on each other.
          const shown = index === labels.indexOf(pending ? pendingLabel : label);

          return (
            <span
              key={index}
              aria-hidden={!shown}
              className={cn('col-start-1 row-start-1 text-center', !shown && 'invisible')}
            >
              {caption}
            </span>
          );
        })}
      </span>
    </Button>
  );

  if (!title) return button;

  /*
    The reason it is disabled, in this app's tooltip rather than the browser's
    `title`.

    A disabled button swallows its own pointer events, which is exactly why the
    native tip was chosen here and exactly why it was the wrong choice: it works
    only for a mouse, waits a second, and is drawn by the OS. `TooltipHint`
    wraps the button in a span, and the span is what the pointer hovers — so the
    explanation arrives on the one control whose whole problem is that it cannot
    be pressed.
  */
  return <TooltipHint label={title}>{button}</TooltipHint>;
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
