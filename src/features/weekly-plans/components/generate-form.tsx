'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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
}) {
  const t = useTranslations('weeklyPlans');
  const [state, formAction] = useActionState(generateWeekAction, initialGenerateState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="weekStartDate" value={weekStartDate} />

      <WeekTargets context={context} />

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
      />

      {blocked ? (
        <p className="rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
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
    <fieldset className="flex flex-col gap-1.5 rounded-md border border-border p-2.5">
      <legend className="px-1 text-xs font-medium">{t('weekTargets')}</legend>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{t('kcalTargetLabel')}</span>
          <Input
            type="number"
            name="kcalTarget"
            min={800}
            max={6000}
            inputMode="numeric"
            placeholder={context.effectiveKcal === null ? '' : String(context.effectiveKcal)}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{t('proteinTargetLabel')}</span>
          <Input
            type="number"
            name="proteinTarget"
            min={20}
            max={400}
            inputMode="numeric"
            placeholder={
              context.effectiveProteinGrams === null ? '' : String(context.effectiveProteinGrams)
            }
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">{t('goalLabel')}</span>
        <Select name="goal" defaultValue="">
          <option value="">{t('useProfile')}</option>
          {CLIENT_GOALS.map((goal) => (
            <option key={goal} value={goal}>
              {tGoals(goal)}
            </option>
          ))}
        </Select>
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
      {pending && <p className="text-xs text-muted-foreground">{t('generatingHint')}</p>}
    </>
  );
}

function Result({ state }: { state: GenerateState }) {
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
      {state.detail && <span className="mt-0.5 block opacity-80">{state.detail}</span>}
    </p>
  );
}
