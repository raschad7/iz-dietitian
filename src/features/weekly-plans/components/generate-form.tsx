'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { Textarea } from '@/components/ui/textarea';
import { CLIENT_GOALS } from '@/features/clients/schema';

import { generateWeekAction } from '../actions';
import { initialGenerateState, type GenerateState } from '../form-state';
import { type NewWeekMode } from '../new-week';
import type { ClientContext } from '../queries';

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
  mode,
  blocked,
  context,
  defaultInstruction,
  onPendingChange,
  onSuccess,
}: {
  clientId: string;
  weekStartDate: string;
  locale: string;
  /**
   * Whether this generation replaces the draft on screen or starts a week of
   * its own. It changes what the button says and nothing else — the decision
   * itself lives in `new-week.ts`.
   */
  mode: NewWeekMode;
  blocked: 'not_configured' | 'profile_incomplete' | null;
  /** For the placeholders on the target fields — what the profile would give. */
  context: ClientContext;
  defaultInstruction?: string | null;
  /** Lets the containing dialog replace its choices with a protected wait state. */
  onPendingChange?: (pending: boolean) => void;
  /** A generated plan is now on the board, so the containing choice can close. */
  onSuccess?: () => void;
}) {
  const t = useTranslations('weeklyPlans');
  const [state, formAction] = useActionState(generateWeekAction, initialGenerateState);

  return (
    <form action={formAction} className="flex h-full min-h-0 flex-col gap-1.5">
      <GenerationLifecycle
        state={state}
        onPendingChange={onPendingChange}
        onSuccess={onSuccess}
      />

      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="weekStartDate" value={weekStartDate} />

      <WeekTargets context={context} />

      <label htmlFor="instruction" className="text-label">
        {t('weekInstructions')}
      </label>

      <Textarea
        id="instruction"
        name="instruction"
        rows={2}
        className="min-h-16 max-h-16"
        maxLength={600}
        defaultValue={defaultInstruction ?? ''}
        placeholder={t('instructionPlaceholder')}
      />

      {blocked ? (
        <p className="rounded-md bg-muted px-2.5 py-2 text-caption text-muted-foreground">
          {t(blocked === 'not_configured' ? 'errors.notConfigured' : 'errors.profileIncomplete')}
        </p>
      ) : (
        <Submit mode={mode} />
      )}

      <Result state={state} />
    </form>
  );
}

/**
 * Bridges form status to the dialog without moving the server action out of the
 * form that owns it. It renders nothing and stays mounted while the dialog's
 * visible content changes, so an error can always restore the form.
 */
function GenerationLifecycle({
  state,
  onPendingChange,
  onSuccess,
}: {
  state: GenerateState;
  onPendingChange?: (pending: boolean) => void;
  onSuccess?: () => void;
}) {
  const { pending } = useFormStatus();

  useEffect(() => {
    onPendingChange?.(pending);
  }, [onPendingChange, pending]);

  useEffect(() => {
    if (state.status === 'done' || state.status === 'partial') onSuccess?.();
  }, [onSuccess, state]);

  return null;
}

/**
 * This week's targets, if they differ from the client's.
 *
 * Every field is left blank and shows the profile's figure as its placeholder,
 * rather than being pre-filled with it. A pre-filled value would be submitted on
 * every generation, so the plan could never distinguish "1,850 because that is her
 * target" from "1,850 because someone chose it for this week" — and the point of
 * these columns is exactly that distinction.
 */
function WeekTargets({ context }: { context: ClientContext }) {
  const t = useTranslations('weeklyPlans');
  const tGoals = useTranslations('clients.goal');

  return (
    <fieldset className="flex flex-col gap-1 rounded-md border border-border p-2">
      <legend className="px-1 text-label">{t('weekTargets')}</legend>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-label">
          <span className="text-muted-foreground">{t('kcalTargetLabel')}</span>
          <Input
            type="number"
            name="kcalTarget"
            min={800}
            max={6000}
            inputMode="numeric"
            className="h-10 px-3"
            placeholder={context.effectiveKcal === null ? '' : String(context.effectiveKcal)}
          />
        </label>

        <label className="flex flex-col gap-1 text-label">
          <span className="text-muted-foreground">{t('proteinTargetLabel')}</span>
          <Input
            type="number"
            name="proteinTarget"
            min={20}
            max={400}
            inputMode="numeric"
            className="h-10 px-3"
            placeholder={
              context.effectiveProteinGrams === null ? '' : String(context.effectiveProteinGrams)
            }
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-label">
        <span className="text-muted-foreground">{t('goalLabel')}</span>
        <SelectField
          name="goal"
          defaultValue=""
          size="sm"
          options={[
            { value: '', label: t('useProfile') },
            ...CLIENT_GOALS.map((goal) => ({ value: goal as string, label: tGoals(goal) })),
          ]}
        />
      </label>

      <p className="text-caption text-muted-foreground">{t('targetsHint')}</p>
    </fieldset>
  );
}

function Submit({ mode }: { mode: NewWeekMode }) {
  const t = useTranslations('weeklyPlans');
  const { pending } = useFormStatus();

  return (
    <>
      <Button type="submit" size="sm" className="w-full" disabled={pending}>
        {pending ? t('generating') : mode === 'regenerate' ? t('regenerateWeek') : t('generate')}
      </Button>

      {/* A whole week is 35 meals and takes the best part of a minute. Saying so
          up front is the difference between waiting and reloading the page. */}
      {pending && <p className="text-caption text-muted-foreground">{t('generatingHint')}</p>}
    </>
  );
}

function Result({ state }: { state: GenerateState }) {
  const t = useTranslations('weeklyPlans');
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.status === 'error') errorRef.current?.focus();
  }, [state]);

  if (state.status === 'idle' || state.status === 'done') return null;

  if (state.status === 'partial') {
    return (
      <p className="text-caption text-status-attention-fg">
        {t('unfilledWarning', { count: state.unfilled })}
      </p>
    );
  }

  return (
    <p
      ref={errorRef}
      role="alert"
      tabIndex={-1}
      className="text-caption text-destructive outline-none"
    >
      {t(state.messageKey)}
      {state.detail && <span className="mt-0.5 block opacity-80">{state.detail}</span>}
    </p>
  );
}
