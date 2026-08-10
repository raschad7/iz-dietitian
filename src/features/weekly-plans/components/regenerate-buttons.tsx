'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { regenerateMealAction } from '../actions';
import { initialGenerateState, type GenerateState } from '../form-state';

/**
 * Regeneration at meal scope.
 *
 * The optional one-line instruction is the point: "cheaper" or "nothing that
 * needs an oven" is how a dietitian corrects one meal without rebuilding a day.
 */
function Pending({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
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

export function RegenerateMealButton({
  planId,
  mealId,
  locale,
}: {
  planId: string;
  mealId: string;
  locale: string;
}) {
  const t = useTranslations('weeklyPlans');
  const [state, formAction] = useActionState(regenerateMealAction, initialGenerateState);

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="planId" value={planId} />
      {/* Keyed by meal id so switching cards resets the field rather than carrying
          the previous meal's instruction over to the next one. */}
      <input type="hidden" name="mealId" value={mealId} />

      <Input
        key={mealId}
        name="instruction"
        placeholder={t('instructionPlaceholder')}
        maxLength={600}
      />

      <Pending label={t('regenerateMeal')} pendingLabel={t('generating')} />
      <Message state={state} />
    </form>
  );
}
