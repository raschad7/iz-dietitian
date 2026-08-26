'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

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
  /**
   * A generated plan is now on the board.
   *
   * It carries the count of slots the model could not fill, because `partial`
   * is a success and the dialog closes on it: without the number here the
   * warning is rendered into a form that is already on its way off the screen,
   * which is exactly where it used to go.
   */
  onSuccess?: (result: { unfilled: number }) => void;
}) {
  const t = useTranslations('weeklyPlans');
  const [state, formAction] = useActionState(generateWeekAction, initialGenerateState);

  return (
    /*
      Two named questions that scroll, and a button that does not.

      It used to be one undifferentiated run of controls — a bordered fieldset,
      a bare label, a textarea, a submit — each spaced 6px from the next, so the
      card read as a form with no shape and the eye had to parse every row to
      find out what it was being asked. There are only two questions here, and
      each one now says which it is: **what this week aims at**, which the
      profile answers unless you say otherwise, and **what to keep in mind**,
      which is free text.

      ── Why the button is a sibling of the fields ──

      The card is one of three columns in a dialog whose height is fixed from
      `sm` up, so its body is a box of a known size and the form either fits it
      or does not. On a 1280×720 laptop it does not — the two blocks come to
      ~300px in a ~346px box, and the moment an error line or the "this takes a
      minute" note appears the submit is pushed under the fold of a scroller
      nobody can see the bottom of. Putting the fields in their own scrollport
      and the button outside it makes the overflow land on the part that can
      afford it: the fields move, and the one control that closes the decision
      is nailed to the foot of the card where the other two doors' buttons are.

      `h-full` on the form is what makes that work — the door's body is a flex
      column of definite height, so the form matches it exactly, the outer
      scroller it sits in never has anything to scroll, and `min-h-0` inside
      keeps the field column from refusing to shrink.
    */
    <form action={formAction} className="flex h-full min-h-0 flex-col">
      <GenerationLifecycle
        state={state}
        onPendingChange={onPendingChange}
        onSuccess={onSuccess}
      />

      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="weekStartDate" value={weekStartDate} />

      <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <WeekTargets context={context} />

        <Block label={t('weekInstructions')} hint={t('weekInstructionsHint')}>
          {/*
            Two rows, and a ceiling. A box that grows as you type would push the
            fields it shares the scrollport with around under the pointer, and
            600 characters of instruction is a paragraph either way.
          */}
          <Textarea
            id="instruction"
            name="instruction"
            rows={2}
            className="min-h-16 max-h-20 text-body-sm"
            maxLength={600}
            defaultValue={defaultInstruction ?? ''}
            placeholder={t('instructionPlaceholder')}
          />
        </Block>
      </div>

      <div className="flex shrink-0 flex-col gap-1.5 pt-3">
        {blocked ? (
          <p className="rounded-md bg-muted px-2.5 py-2 text-caption text-muted-foreground">
            {t(blocked === 'not_configured' ? 'errors.notConfigured' : 'errors.profileIncomplete')}
          </p>
        ) : (
          <Submit mode={mode} />
        )}

        <Result state={state} />
      </div>
    </form>
  );
}

/**
 * One titled question inside the card.
 *
 * A `<fieldset>` with a floating `<legend>` was the wrong shape for this: it
 * draws a box around every group, and two boxes stacked inside a card that is
 * itself a box is three edges deep before any control. A heading over a tinted
 * well says the same thing with one edge, and the well is what tells the eye
 * where one question stops and the next begins.
 *
 * `label` is a heading rather than a `<label>` element — it names a group, and
 * each control inside carries its own name.
 */
function Block({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg bg-muted/60 px-3 py-2.5">
      <h4 className="pb-1.5 text-label font-semibold text-foreground">{label}</h4>
      {children}
      {hint && <p className="pt-1 text-caption leading-relaxed text-muted-foreground">{hint}</p>}
    </section>
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
  onSuccess?: (result: { unfilled: number }) => void;
}) {
  const { pending } = useFormStatus();

  /*
    Both of these fire in the same commit when the action resolves, and in this
    order: `pending` drops to false, then the state carries the result. The
    dialog depends on that order — see `handlePendingChange` there, where the
    "the wait is over" and "the wait succeeded" signals are folded into one
    piece of state so the second can overrule the first.
  */
  useEffect(() => {
    onPendingChange?.(pending);
  }, [onPendingChange, pending]);

  useEffect(() => {
    if (state.status === 'done') onSuccess?.({ unfilled: 0 });
    if (state.status === 'partial') onSuccess?.({ unfilled: state.unfilled });
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
 *
 * **The goal used to be a third control here and is gone.** Two of the three
 * were numbers you type; the goal was a select whose default read "use the
 * profile" — the same thing the two blank fields already said, spelled out in
 * a row of its own and needing to be read to find out it was saying nothing.
 * The goal is a property of the client, set on the profile where the rest of
 * the client is; overriding it for one week and leaving the profile disagreeing
 * with the plan is a state nobody asked for and one this form no longer offers.
 * The action still accepts a `goal` field — nothing here sends one, so the
 * server falls back to the profile's, which was always the answer.
 */
function WeekTargets({ context }: { context: ClientContext }) {
  const t = useTranslations('weeklyPlans');

  return (
    <Block label={t('weekTargets')} hint={t('targetsHint')}>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-label">
          <span className="text-muted-foreground">{t('kcalTargetLabel')}</span>
          <Input
            type="number"
            name="kcalTarget"
            min={800}
            max={6000}
            inputMode="numeric"
            className="h-10 bg-card px-3 text-body-md tabular-nums"
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
            className="h-10 bg-card px-3 text-body-md tabular-nums"
            placeholder={
              context.effectiveProteinGrams === null ? '' : String(context.effectiveProteinGrams)
            }
          />
        </label>
      </div>
    </Block>
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
