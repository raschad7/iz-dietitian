'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogHeader } from '@/components/ui/dialog';
import { getLocaleDirection } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { startEmptyWeekAction, startWeekFromPlanAction } from '../editor-actions';
import { initialNewWeekState } from '../form-state';
import { newWeekMode, type NewWeekMode } from '../new-week';
import type { ClientContext } from '../queries';

import { GenerateForm } from './generate-form';
import type { PlanSummary } from './plan-history';

/** Everything the three doors need that the board itself does not carry. */
export type NewWeekProps = {
  /** The week all three doors build into. */
  weekStartDate: string;
  /** Every plan this client has. The copy door offers all but the open one. */
  plans: readonly PlanSummary[];
  /**
   * No profile. All three doors build their slots from the client's schedule
   * and target, so none of them can run without one.
   */
  blocked: boolean;
  /** The generate door's extra requirement: a configured provider. */
  generateBlocked: 'not_configured' | 'profile_incomplete' | null;
  /** For the placeholders on the generate door's target fields. */
  context: ClientContext;
  /** The instruction the open week was generated with, if any. */
  defaultInstruction: string | null;
};

/**
 * The three doors into a plan, side by side.
 *
 * They were a 288px dropdown, which is not enough room to say what any of them
 * does — the generate door could only link away to a form living in a different
 * panel, and the copy door could offer exactly one week. A dialog is the size
 * the choice actually is: three cards, each showing its own controls, chosen
 * once and then gone.
 *
 * Generation is featured but is still one door of three. A returning client's
 * next week is usually last week with a few meals changed, and making that path
 * go through a model was the whole problem.
 */
export function NewWeekDialog({
  clientId,
  board,
  locale,
  newWeek,
}: {
  clientId: string;
  /** The plan on screen, which decides whether generating replaces it. */
  board: { id: string; status: string } | null;
  locale: string;
  newWeek: NewWeekProps;
}) {
  const t = useTranslations('weeklyPlans');
  const tCommon = useTranslations('common');
  const activeLocale = useLocale();
  const [open, setOpen] = useState(false);

  const mode = newWeekMode(board);

  // A plan cannot be copied into itself, and offering it would be the one row
  // in the list that quietly does nothing.
  const copyable = newWeek.plans.filter((plan) => plan.id !== board?.id);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        {t('newWeek')}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        label={t('newWeekTitle')}
        dir={getLocaleDirection(activeLocale)}
        size="wide"
      >
        <DialogHeader
          title={t('newWeekTitle')}
          description={t('newWeekSubtitle')}
          onClose={() => setOpen(false)}
          closeLabel={tCommon('close')}
        />

        <DialogBody>
          {/* Stacked on a phone, three across from `sm` up — the dialog is a
              full bottom sheet there, and three columns in a phone's width is
              three columns of nothing. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <GenerateDoor
              clientId={clientId}
              locale={locale}
              mode={mode}
              weekStartDate={newWeek.weekStartDate}
              blocked={newWeek.generateBlocked}
              context={newWeek.context}
              defaultInstruction={newWeek.defaultInstruction}
            />

            <CopyDoor
              clientId={clientId}
              locale={locale}
              weekStartDate={newWeek.weekStartDate}
              plans={copyable}
              blocked={newWeek.blocked}
            />

            <EmptyDoor
              clientId={clientId}
              locale={locale}
              weekStartDate={newWeek.weekStartDate}
              blocked={newWeek.blocked}
            />
          </div>
        </DialogBody>
      </Dialog>
    </>
  );
}

/**
 * Generation, with its form rather than a link to one.
 *
 * The form used to live in the client tab of the rail, so choosing "generate
 * with AI" meant being sent somewhere else to do it. Here the door and the
 * controls are the same surface.
 */
function GenerateDoor({
  clientId,
  locale,
  mode,
  weekStartDate,
  blocked,
  context,
  defaultInstruction,
}: {
  clientId: string;
  locale: string;
  mode: NewWeekMode;
  weekStartDate: string;
  blocked: 'not_configured' | 'profile_incomplete' | null;
  context: ClientContext;
  defaultInstruction: string | null;
}) {
  const t = useTranslations('weeklyPlans');

  return (
    <Door featured title={t(`newWeekGenerate.${mode}`)} hint={t(`newWeekGenerateHint.${mode}`)}>
      <GenerateForm
        clientId={clientId}
        weekStartDate={weekStartDate}
        locale={locale}
        mode={mode}
        blocked={blocked}
        context={context}
        defaultInstruction={defaultInstruction}
      />
    </Door>
  );
}

/**
 * Copying a past week.
 *
 * Every earlier plan, not the single newest one the dropdown had room for —
 * `listPlans` already returns them all, so the short list was a cost with no
 * saving behind it. Each row shows the week, the target it was built against
 * and how many meals it holds: the three facts the record actually keeps.
 */
function CopyDoor({
  clientId,
  locale,
  weekStartDate,
  plans,
  blocked,
}: {
  clientId: string;
  locale: string;
  weekStartDate: string;
  plans: readonly PlanSummary[];
  blocked: boolean;
}) {
  const t = useTranslations('weeklyPlans');
  const [state, formAction] = useActionState(startWeekFromPlanAction, initialNewWeekState);

  return (
    <Door title={t('newWeekCopy')} hint={t('newWeekFromHint')}>
      {plans.length === 0 ? (
        <p className="text-caption text-muted-foreground">{t('noEarlierPlans')}</p>
      ) : (
        <form action={formAction} className="flex min-h-0 flex-1 flex-col gap-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="weekStartDate" value={weekStartDate} />

          <fieldset className="flex max-h-64 min-h-0 flex-1 flex-col overflow-y-auto">
            <legend className="sr-only">{t('newWeekCopy')}</legend>

            {plans.map((plan, index) => (
              // The label is the target, not the 16px dot: a whole row is a
              // comfortable thing to hit, and clicking it checks the radio.
              <label
                key={plan.id}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <input
                  type="radio"
                  name="sourcePlanId"
                  value={plan.id}
                  defaultChecked={index === 0}
                  required
                  className="size-4 shrink-0 accent-primary"
                />

                <span className="min-w-0 flex-1">
                  <span className="block text-body-sm">{plan.weekStartDate}</span>
                  <span className="block text-caption text-muted-foreground">
                    {t('kcalValue', { value: plan.kcalTargetSnapshot })} ·{' '}
                    {t('planMeals', { count: plan.mealCount })}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {blocked ? (
            <Unavailable messageKey="errors.profileIncomplete" />
          ) : (
            <DoorSubmit label={t('copyIntoWeek', { date: weekStartDate })} />
          )}

          {state.status === 'error' && (
            <p className="text-caption text-destructive">{t(state.messageKey)}</p>
          )}
        </form>
      )}
    </Door>
  );
}

/** One empty slot per meal in the client's schedule, and nothing else. */
function EmptyDoor({
  clientId,
  locale,
  weekStartDate,
  blocked,
}: {
  clientId: string;
  locale: string;
  weekStartDate: string;
  blocked: boolean;
}) {
  const t = useTranslations('weeklyPlans');
  const [state, formAction] = useActionState(startEmptyWeekAction, initialNewWeekState);

  return (
    <Door title={t('newWeekEmpty')} hint={t('newWeekEmptyHint')}>
      <form action={formAction} className="flex flex-1 flex-col justify-end gap-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="weekStartDate" value={weekStartDate} />

        {blocked ? (
          <Unavailable messageKey="errors.profileIncomplete" />
        ) : (
          <DoorSubmit label={t('newWeekEmptyAction')} />
        )}

        {state.status === 'error' && (
          <p className="text-caption text-destructive">{t(state.messageKey)}</p>
        )}
      </form>
    </Door>
  );
}

/**
 * One of the three cards.
 *
 * `featured` is the brand **edge** and never a fill — the same language `Card`
 * and `Select` already speak. It carries no sweep of its own: the dialog around
 * it is the swept surface, and one tail per surface.
 */
function Door({
  featured,
  title,
  hint,
  children,
}: {
  featured?: boolean;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-3 rounded-lg p-4',
        featured ? 'border-2 border-primary' : 'border border-border',
      )}
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-body-md font-semibold" dir="auto">
          {title}
        </h3>
        <p className="text-caption text-muted-foreground" dir="auto">
          {hint}
        </p>
      </div>

      {children}
    </section>
  );
}

/**
 * Why a door cannot be used, in place of its button.
 *
 * Said rather than hidden, the same way the dish catalog keeps an
 * allergen-blocked dish on screen with its reason attached: a door that
 * disappears looks like a door that never existed, and the dietitian goes
 * looking for it instead of fixing the profile.
 */
function Unavailable({ messageKey }: { messageKey: 'errors.profileIncomplete' | 'errors.notConfigured' }) {
  const t = useTranslations('weeklyPlans');

  return (
    <p className="rounded-md bg-muted px-3 py-2 text-caption text-muted-foreground">
      {t(messageKey)}
    </p>
  );
}

function DoorSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="outline" size="sm" className="w-full" disabled={pending}>
      {label}
    </Button>
  );
}
