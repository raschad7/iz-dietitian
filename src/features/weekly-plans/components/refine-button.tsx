'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { TooltipHint } from '@/components/ui/tooltip-hint';

import { refinePlanAction } from '../actions';
import { initialGenerateState, type GenerateState } from '../form-state';

/**
 * A second opinion on the week.
 *
 * ## Why it is a button and not part of generating
 *
 * The two model calls together take around ninety-five seconds against a route
 * ceiling of a hundred and twenty, so running them back to back would sit on that
 * limit and fail on a slow afternoon. It is also the better shape for the work:
 * the dietitian gets a draft in fifty seconds and asks for a second reading when
 * she wants one, rather than waiting twice as long for every plan whether it
 * needed it or not.
 *
 * ## Why it is quiet
 *
 * `neutral`, beside publish rather than in front of it. Publish is the control
 * that changes what the client sees and it keeps the bar's only fill. This one
 * improves a draft she is already looking at, and a second green button would
 * make the row read as two equally weighted decisions.
 *
 * Only on a draft: a published week is what the client is holding, and quietly
 * rewriting thirty-five meals underneath it is not a thing a button should offer.
 */
export function RefineButton({
  planId,
  status,
  locale,
}: {
  planId: string;
  status: string;
  locale: string;
}) {
  const t = useTranslations('weeklyPlans');
  const [state, refine] = useActionState(refinePlanAction, initialGenerateState);

  if (status !== 'draft') return null;

  return (
    <div className="relative flex flex-col items-end gap-1">
      <form action={refine}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="planId" value={planId} />
        <Submit label={t('refine')} pendingLabel={t('refining')} hint={t('refineHint')} />
      </form>
      <Message state={state} />
    </div>
  );
}

function Submit({
  label,
  pendingLabel,
  hint,
}: {
  label: string;
  pendingLabel: string;
  hint: string;
}) {
  const { pending } = useFormStatus();

  return (
    <TooltipHint label={hint}>
      <Button type="submit" size="sm" variant="neutral" disabled={pending}>
        {/* The icon carries the meaning while the caption is long in Arabic and
            short in English; `aria-hidden` because the caption already says it. */}
        <Icon name="ai" aria-hidden className="size-4" />
        {pending ? pendingLabel : label}
      </Button>
    </TooltipHint>
  );
}

function Message({ state }: { state: GenerateState }) {
  const t = useTranslations('weeklyPlans');

  if (state.status === 'idle' || state.status === 'done') return null;

  if (state.status === 'partial') {
    return (
      <p className="text-caption text-status-attention-fg">
        {t('unfilledWarning', { count: state.unfilled })}
      </p>
    );
  }

  return (
    <p className="text-caption text-destructive">
      {t(state.messageKey)}
      {state.detail && <span className="block opacity-80">{state.detail}</span>}
    </p>
  );
}
