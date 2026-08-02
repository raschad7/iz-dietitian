'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { regenerateDayAction, regenerateMealAction } from '../actions';
import { initialGenerateState, type GenerateState } from '../form-state';

/**
 * Regeneration at day and meal scope.
 *
 * Both take an optional one-line instruction, which is the whole point: "cheaper",
 * "nothing that needs an oven" is how a dietitian actually corrects a plan, and it
 * is faster than swapping four meals by hand.
 *
 * The instruction field is revealed on demand rather than always present — a row of
 * seven permanent text inputs above the board would dominate a page whose subject
 * is the plan.
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
      <p className="text-xs text-status-attention-fg">
        {t('unfilledWarning', { count: state.unfilled })}
      </p>
    );
  }

  return (
    <p className="text-xs text-destructive">
      {t(state.messageKey)}
      {state.detail && <span className="block opacity-80">{state.detail}</span>}
    </p>
  );
}

export function RegenerateDayButton({
  planId,
  dayOfWeek,
  locale,
}: {
  planId: string;
  dayOfWeek: number;
  locale: string;
}) {
  const t = useTranslations('weeklyPlans');
  const [state, formAction] = useActionState(regenerateDayAction, initialGenerateState);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={t('regenerateDay')}
        className="shrink-0 rounded px-1 text-label text-muted-foreground hover:text-foreground"
      >
        {/* A glyph rather than a word: seven of these sit in a row of narrow columns. */}
        ⟳
      </button>

      {open && (
        <form action={formAction} className="mt-1 flex w-full flex-col gap-1">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="dayOfWeek" value={dayOfWeek} />

          <Input
            name="instruction"
            placeholder={t('instructionPlaceholder')}
            maxLength={600}
            className="h-7 text-label"
          />

          <Pending label={t('regenerate')} pendingLabel={t('generating')} />
          <Message state={state} />
        </form>
      )}
    </>
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
        className="h-8 text-xs"
      />

      <Pending label={t('regenerateMeal')} pendingLabel={t('generating')} />
      <Message state={state} />
    </form>
  );
}
