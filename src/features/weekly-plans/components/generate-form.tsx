'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

import { generateWeekAction } from '../actions';
import { initialGenerateState, type GenerateState } from '../form-state';

/**
 * The generate control: this week's instructions, and the button.
 *
 * `blocked` is passed in rather than discovered here — the page already knows
 * whether OpenAI is configured and whether the profile is complete, and a button
 * that explains why it cannot run beats one that runs and fails.
 */
export function GenerateForm({
  clientId,
  weekStartDate,
  locale,
  blocked,
  defaultInstruction,
}: {
  clientId: string;
  weekStartDate: string;
  locale: string;
  blocked: 'not_configured' | 'profile_incomplete' | null;
  defaultInstruction?: string | null;
}) {
  const t = useTranslations('weeklyPlans');
  const [state, formAction] = useActionState(generateWeekAction, initialGenerateState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="weekStartDate" value={weekStartDate} />

      <label htmlFor="instruction" className="text-xs font-medium">
        {t('weekInstructions')}
      </label>

      <Textarea
        id="instruction"
        name="instruction"
        rows={3}
        maxLength={600}
        defaultValue={defaultInstruction ?? ''}
        placeholder={t('instructionPlaceholder')}
        className="text-xs"
      />

      {blocked ? (
        <p className="rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
          {t(blocked === 'not_configured' ? 'errors.notConfigured' : 'errors.profileIncomplete')}
        </p>
      ) : (
        <Submit />
      )}

      <Result state={state} />
    </form>
  );
}

function Submit() {
  const t = useTranslations('weeklyPlans');
  const { pending } = useFormStatus();

  return (
    <>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? t('generating') : t('generate')}
      </Button>

      {/* A whole week is 35 meals and takes the best part of a minute. Saying so
          up front is the difference between waiting and reloading the page. */}
      {pending && <p className="text-xs text-muted-foreground">{t('generatingHint')}</p>}
    </>
  );
}

function Result({ state }: { state: GenerateState }) {
  const t = useTranslations('weeklyPlans');

  if (state.status === 'idle' || state.status === 'done') return null;

  if (state.status === 'partial') {
    return (
      <p className="text-xs text-amber-600 dark:text-amber-500">
        {t('unfilledWarning', { count: state.unfilled })}
      </p>
    );
  }

  return (
    <p className="text-xs text-destructive">
      {t(state.messageKey)}
      {state.detail && <span className="mt-0.5 block opacity-80">{state.detail}</span>}
    </p>
  );
}
