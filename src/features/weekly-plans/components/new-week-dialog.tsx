'use client';

import { useActionState, useCallback, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Icon } from '@/components/ui/icon';
import { Dialog, DialogBody, DialogHeader } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { TooltipHint } from '@/components/ui/tooltip-hint';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { startEmptyWeekAction, startWeekFromPlanAction } from '../editor-actions';
import { initialNewWeekState } from '../form-state';
import { newWeekMode, type NewWeekMode } from '../new-week';
import type { ClientContext } from '../queries';

import { GenerateForm } from './generate-form';
import { GenerationLoadingScreen } from './generation-loading-screen';
import type { PlanSummary } from './plan-history';

/**
 * Says out loud what a control's own caption stopped saying.
 *
 * The planner's action bar collapses its buttons to icons once it moves up
 * beside the client summary, and an icon with no words on it needs somewhere to
 * put them. Below that width the caption is right there on the button and a tip
 * repeating it is noise, so this passes the child straight through.
 */
function ShowLabelWhenHidden({
  hidden,
  label,
  children,
}: {
  hidden: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (!hidden) return children;

  return <TooltipHint label={label}>{children}</TooltipHint>;
}

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
      {/* The tip only exists in the compact state, because that is the only
          state where the label is not already printed on the control. */}
      <ShowLabelWhenHidden hidden={compactTrigger} label={triggerLabel ?? t('newWeek')}>
        <Button
          type="button"
          size="sm"
          variant={triggerVariant}
          aria-label={compactTrigger ? (triggerLabel ?? t('newWeek')) : undefined}
          // Square-shouldered even when it collapses to an icon: the planner's
          // action bar is one set of controls and they share the base radius.
          className={compactTrigger ? 'px-3 md:size-10 md:px-0' : undefined}
          onClick={() => {
            setGenerating(false);
            setWeekStartDate(newWeek.weekStartDate);
            setOpen(true);
          }}
        >
          <Icon name="add" />
          <span className={compactTrigger ? 'md:sr-only' : undefined}>
            {triggerLabel ?? t('newWeek')}
          </span>
        </Button>
      </ShowLabelWhenHidden>

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
        /*
          A fixed stage from `sm` up, so the surface does not resize under the
          pointer when the generate door swaps for the loading one.

          `52rem` flat, and **no `sm:max-h-none`**: that used to be here to stop
          a `max-h` utility fighting the height, and it would now switch off the
          responsive dialog frame's own ceiling — the one thing keeping this
          surface inside a 1366×768 laptop or a landscape phone. The frame caps
          the height; this only asks for one.
        */
        className="sm:h-[52rem]"
      >
        {/* The choices stay mounted while hidden. The server action and its
            lifecycle observer belong to that subtree; unmounting it during the
            request would strand an error behind a loading screen. */}
        <div
          hidden={generating}
          aria-hidden={generating || undefined}
          className="sm:flex sm:h-full sm:min-h-0 sm:flex-col"
        >
          <DialogHeader
            title={t('newWeekTitle')}
            description={t('newWeekSubtitle')}
            onClose={close}
            closeLabel={tCommon('close')}
          />

          {/*
            `sm:overflow-y-auto`, not `sm:overflow-hidden`.

            From `sm` up this dialog is a fixed height —
            `min(52rem, 100dvh - 1rem)` — and the body was told to clip whatever
            did not fit inside it. On a tall window nothing ever did, so the
            clip was invisible; on a short one it was the whole point of the
            screen. A landscape phone (844×390), a 1280×600 window or a 1366×768
            laptop with browser chrome leaves under ~660px here, and the generate
            door's form ran past it: its fields and its submit button were drawn
            outside the box and there was no way to scroll to them, so the week
            could not be created at all.

            Scrolling rather than clipping changes nothing when the content
            fits — no bar is drawn app-wide, and a box with nothing to scroll
            behaves exactly as it did — and turns "unreachable" into "one swipe
            away" when it does not.
          */}
          <DialogBody className="sm:min-h-0 sm:flex-1 sm:overflow-y-auto">
            <div className="grid shrink-0 gap-3 rounded-lg bg-muted px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] sm:items-center">
              <div>
                <Label htmlFor="new-week-start" className="text-body-md font-medium">
                  {t('weekStartLabel')}
                </Label>
                <p className="mt-1 text-body-sm leading-relaxed text-muted-foreground">
                  {t('weekStartHint')}
                </p>
              </div>
              {/*
                Olive on the chosen day, the way the calendar toolbar's picker marks it —
                not the neutral black a date field draws. The default is neutral because a
                form's month grid painted in the accent came out as a field of green, but
                this panel is not one field among many: the dialog asks which week to
                build, and this is the answer to it.
              */}
              <DatePicker
                id="new-week-start"
                value={weekStartDate}
                onChange={setWeekStartDate}
                locale={locale}
                selectedTone="primary"
              />
            </div>

            {/* Stacked on a phone, three across from `sm` up — the dialog is a
                full bottom sheet there, and three columns in a phone's width is
                three columns of nothing. */}
            {/* Generate first, so it lands at the reading edge — the right in
                Arabic, the left in English. It is the featured door and the one
                carrying a form; sitting last it was the door you reached after
                scanning past the two you did not want. The order mirrors with
                the writing direction because the grid is direction-aware, which
                is the whole reason it is expressed as document order. */}
            <div className="grid gap-4 sm:min-h-0 sm:flex-1 sm:grid-cols-3 sm:items-stretch">
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
    <Door
      featured
      icon="ai"
      title={t(`newWeekGenerate.${mode}`)}
      hint={t(`newWeekGenerateHint.${mode}`)}
    >
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
    <Door icon="history" title={t('newWeekCopy')} hint={t('newWeekFromHint')}>
      {plans.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-8 text-center text-body-sm text-muted-foreground">
          {t('noEarlierPlans')}
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="no-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto rounded-md bg-muted/35 p-1">
            {plans.map((plan) => (
              <form key={plan.id} action={formAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="clientId" value={clientId} />
                <input type="hidden" name="weekStartDate" value={weekStartDate} />
                <Button
                  type="submit"
                  name="sourcePlanId"
                  value={plan.id}
                  variant="neutral"
                  disabled={blocked}
                  className="h-auto min-h-14 w-full max-w-none justify-between px-3 py-2 text-start whitespace-normal"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-sm font-medium">{plan.weekStartDate}</span>
                    <span className="mt-0.5 block text-caption font-normal text-muted-foreground">
                      {t('kcalValue', { value: plan.kcalTargetSnapshot })} ·{' '}
                      {t('planMeals', { count: plan.mealCount })}
                    </span>
                  </span>
                  <Icon name="chevronEnd" className="size-4 text-muted-foreground" />
                </Button>
              </form>
            ))}
          </div>

          {blocked && <Unavailable messageKey="errors.profileIncomplete" />}

          {state.status === 'error' && (
            <p className="text-caption text-destructive">{t(state.messageKey)}</p>
          )}
        </div>
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
    <form action={formAction} className="min-h-0 sm:h-full">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="weekStartDate" value={weekStartDate} />
      <Button
        type="submit"
        variant="neutral"
        disabled={blocked}
        className="h-full min-h-56 w-full max-w-none flex-col justify-start gap-1.5 rounded-lg border-transparent px-5 pb-6 pt-4 text-center whitespace-normal shadow-none ring-1 ring-foreground/10 hover:ring-primary sm:min-h-0"
      >
        <span className="grid size-10 place-items-center rounded-md border border-border bg-card text-heading-lg font-normal leading-none text-foreground">
          +
        </span>
        <span className="font-heading text-heading-sm font-medium text-foreground">
          {t('newWeekEmpty')}
        </span>
        <span className="max-w-64 text-body-sm font-normal leading-relaxed text-muted-foreground">
          {t('newWeekEmptyHint')}
        </span>
        {blocked && (
          <span className="mt-auto text-caption font-normal text-muted-foreground">
            {t('errors.profileIncomplete')}
          </span>
        )}
        {state.status === 'error' && (
          <span className="mt-auto text-caption font-normal text-destructive">
            {t(state.messageKey)}
          </span>
        )}
      </Button>
    </form>
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
  icon,
  iconContent,
  title,
  hint,
  children,
}: {
  featured?: boolean;
  icon?: React.ComponentProps<typeof Icon>['name'];
  iconContent?: React.ReactNode;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      variant="default"
      selected={featured}
      className={cn(
        'min-h-0 min-w-0 gap-0 py-0 shadow-none ring-border sm:h-full',
        featured && 'ring-primary',
      )}
    >
      {/*
        The head reads down the middle: mark, name, one sentence.

        The featured door's mark takes the brand's subtle fill and an olive
        glyph while the other two stay neutral — the same distinction the card's
        olive edge is already making, said a second time in the one place the
        eye lands first. It is a tint and not a solid: this card holds the
        dialog's primary button, and two olive fills stacked in one column makes
        the button compete with a badge.
      */}
      <div
        className={cn(
          'flex shrink-0 flex-col items-center gap-1.5 px-5 pb-3 pt-4 text-center',
        )}
      >
        <span
          className={cn(
            'grid size-10 place-items-center rounded-md border',
            featured
              ? 'border-transparent bg-primary-subtle text-primary'
              : 'border-border bg-card text-foreground',
          )}
        >
          {iconContent ?? (icon ? <Icon name={icon} className="size-5" /> : null)}
        </span>
        <h3 className="font-heading text-heading-sm font-medium" dir="auto">
          {title}
        </h3>
        <p className="max-w-64 text-body-sm leading-relaxed text-muted-foreground" dir="auto">
          {hint}
        </p>
      </div>

      {/*
        The door's own body scrolls too, for the same reason the dialog's does:
        on a short viewport the generate door's form is taller than the column it
        sits in, and the alternative to scrolling it is clipping its submit
        button off the bottom of a card the reader cannot move.
      */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-3">{children}</div>
    </Card>
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
