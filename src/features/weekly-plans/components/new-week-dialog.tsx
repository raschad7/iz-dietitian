'use client';

import { useActionState, useCallback, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Icon } from '@/components/ui/icon';
import { Dialog, DialogBody, DialogHeader } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { startEmptyWeekAction, startWeekFromPlanAction } from '../editor-actions';
import { initialNewWeekState } from '../form-state';
import { newWeekMode, type NewWeekMode } from '../new-week';
import type { ClientContext } from '../queries';

import { GenerateForm } from './generate-form';
import { GenerationLoadingScreen } from './generation-loading-screen';
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
  triggerLabel,
  triggerVariant = 'ghost',
  compactTrigger = false,
}: {
  clientId: string;
  /** The plan on screen, which decides whether generating replaces it. */
  board: { id: string; status: string } | null;
  locale: Locale;
  newWeek: NewWeekProps;
  triggerLabel?: string;
  triggerVariant?: 'default' | 'ghost' | 'neutral';
  /** Keeps the icon-only form on narrow phones while preserving its name. */
  compactTrigger?: boolean;
}) {
  const t = useTranslations('weeklyPlans');
  const tCommon = useTranslations('common');
  const activeLocale = useLocale();
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [weekStartDate, setWeekStartDate] = useState(newWeek.weekStartDate);

  const mode = newWeekMode(board);

  const close = useCallback(() => {
    if (!generating) setOpen(false);
  }, [generating]);

  const finishGeneration = useCallback(() => {
    setGenerating(false);
    setOpen(false);
  }, []);

  // A plan cannot be copied into itself, and offering it would be the one row
  // in the list that quietly does nothing.
  const copyable = newWeek.plans.filter((plan) => plan.id !== board?.id);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={triggerVariant}
        aria-label={compactTrigger ? (triggerLabel ?? t('newWeek')) : undefined}
        title={compactTrigger ? (triggerLabel ?? t('newWeek')) : undefined}
        className={
          compactTrigger ? 'px-3 2xl:size-10 2xl:rounded-full 2xl:px-0' : undefined
        }
        onClick={() => {
          setGenerating(false);
          setWeekStartDate(newWeek.weekStartDate);
          setOpen(true);
        }}
      >
        <Icon name="add" />
        <span className={compactTrigger ? '2xl:sr-only' : undefined}>
          {triggerLabel ?? t('newWeek')}
        </span>
      </Button>

      <Dialog
        open={open}
        onClose={close}
        label={
          generating
            ? t(mode === 'regenerate' ? 'generationLoading.regenerateTitle' : 'generationLoading.title')
            : t('newWeekTitle')
        }
        dir={getLocaleDirection(activeLocale)}
        size="wide"
        dismissible={!generating}
      >
        {/* The choices stay mounted while hidden. The server action and its
            lifecycle observer belong to that subtree; unmounting it during the
            request would strand an error behind a loading screen. */}
        <div hidden={generating} aria-hidden={generating || undefined}>
          <DialogHeader
            title={t('newWeekTitle')}
            description={t('newWeekSubtitle')}
            onClose={close}
            closeLabel={tCommon('close')}
          />

          <DialogBody>
            <div className="mb-5 grid gap-3 rounded-lg bg-muted px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] sm:items-center">
              <div>
                <Label htmlFor="new-week-start">{t('weekStartLabel')}</Label>
                <p className="mt-1 text-caption leading-relaxed text-muted-foreground">
                  {t('weekStartHint')}
                </p>
              </div>
              <DatePicker
                id="new-week-start"
                value={weekStartDate}
                onChange={setWeekStartDate}
                locale={locale}
              />
            </div>

            {/* Stacked on a phone, three across from `sm` up — the dialog is a
                full bottom sheet there, and three columns in a phone's width is
                three columns of nothing. */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
              <GenerateDoor
                clientId={clientId}
                locale={locale}
                mode={mode}
                weekStartDate={weekStartDate}
                blocked={newWeek.generateBlocked}
                context={newWeek.context}
                defaultInstruction={newWeek.defaultInstruction}
                onPendingChange={setGenerating}
                onSuccess={finishGeneration}
              />

              <CopyDoor
                clientId={clientId}
                locale={locale}
                weekStartDate={weekStartDate}
                plans={copyable}
                blocked={newWeek.blocked}
              />

              <EmptyDoor
                clientId={clientId}
                locale={locale}
                weekStartDate={weekStartDate}
                blocked={newWeek.blocked}
              />
            </div>
          </DialogBody>
        </div>

        {generating && <GenerationLoadingScreen mode={mode} />}
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
  onPendingChange,
  onSuccess,
}: {
  clientId: string;
  locale: string;
  mode: NewWeekMode;
  weekStartDate: string;
  blocked: 'not_configured' | 'profile_incomplete' | null;
  context: ClientContext;
  defaultInstruction: string | null;
  onPendingChange: (pending: boolean) => void;
  onSuccess: () => void;
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
        onPendingChange={onPendingChange}
        onSuccess={onSuccess}
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

          <fieldset className="no-scrollbar flex max-h-64 min-h-0 flex-1 flex-col overflow-y-auto">
            <legend className="sr-only">{t('newWeekCopy')}</legend>

            {/*
              `RadioGroup` owns the roving focus and the arrow keys the loose
              inputs never had, and writes the submitted `<input>` itself — so
              this stays a plain server-action form. Its own `gap-2` is dropped:
              the rows carry their own padding and a hover fill that has to meet
              its neighbours, or the list reads as separated cards.
            */}
            <RadioGroup name="sourcePlanId" defaultValue={plans[0]?.id} required className="gap-0">
              {plans.map((plan) => (
                // The label is the target, not the 16px dot: a whole row is a
                // comfortable thing to hit, and clicking it checks the radio.
                <label
                  key={plan.id}
                  className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
                >
                  <RadioGroupItem value={plan.id} className="shrink-0" />

                  <span className="min-w-0 flex-1">
                    <span className="block text-body-sm">{plan.weekStartDate}</span>
                    <span className="block text-caption text-muted-foreground">
                      {t('kcalValue', { value: plan.kcalTargetSnapshot })} ·{' '}
                      {t('planMeals', { count: plan.mealCount })}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
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
