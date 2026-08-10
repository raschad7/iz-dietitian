'use client';

import * as React from 'react';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button, buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';

import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import type {
  Board,
  BoardDay,
  CatalogEntry,
  ComparisonPlan,
  SwapCandidate,
} from '../queries';
import { boardRows } from '../board-rows';
import { dayKey } from '../schema';
import { slotFillKey } from '../skeleton';
import type { RecentUse } from '../usage';

import { BoardEditor, useEditor } from './board-dnd';
import { DayColumn } from './day-column';
import { SlotRail } from './slot-rail';
import { DishCatalogDrawer } from './dish-catalog-drawer';
import type { GhostMeal } from './meal-card';
import { MealInspector } from './meal-inspector';
import { NewWeekDialog, type NewWeekProps } from './new-week-dialog';
import { PublishButton } from './publish-button';

type BoardProps = {
  board: Board;
  candidates: Record<string, SwapCandidate[]>;
  catalog: readonly CatalogEntry[];
  usage: Record<string, RecentUse>;
  /** The plan immediately before this one, for the compare overlay. */
  previous: ComparisonPlan | null;
  locale: Locale;
  /** The client's earlier weeks, rendered on the server. */
  history: React.ReactNode;
  newWeek: NewWeekProps;
  /** The server-rendered client summary shown between the toolbar and board. */
  children: React.ReactNode;
};

/**
 * The board: seven day columns with contextual surfaces instead of a side rail.
 *
 * A client component because everything it coordinates is local state — which meal
 * is open, which tab is showing, whether the previous week is overlaid, whether a
 * live plan is being edited on purpose. The plan arrives in one server query, so
 * switching days or opening a card costs nothing.
 *
 * The editable decision lives here rather than inside `BoardEditor` so that the
 * published-plan toggle and the editor share one answer.
 */
export function PlanBoard(props: BoardProps) {
  // A published plan is read-only until the dietitian says otherwise. Editing what
  // a client is already following should be a decision, not a slip.
  const [allowPublished, setAllowPublished] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const editable =
    props.board.status === 'draft' || (props.board.status === 'published' && allowPublished);

  return (
    <BoardEditor
      board={props.board}
      editable={editable}
      allowPublished={allowPublished}
      locale={props.locale}
      onDishDragStart={() => setCatalogOpen(false)}
    >
      <BoardBody
        {...props}
        allowPublished={allowPublished}
        onAllowPublished={setAllowPublished}
        catalogOpen={catalogOpen}
        onCatalogOpenChange={setCatalogOpen}
      />
    </BoardEditor>
  );
}

function BoardBody({
  candidates,
  catalog,
  usage,
  previous,
  locale,
  history,
  newWeek,
  children,
  allowPublished,
  onAllowPublished,
  catalogOpen,
  onCatalogOpenChange,
}: BoardProps & {
  allowPublished: boolean;
  onAllowPublished: (value: boolean) => void;
  catalogOpen: boolean;
  onCatalogOpenChange: (value: boolean) => void;
}) {
  const t = useTranslations('weeklyPlans');
  // The optimistic board, not the server one: everything below renders the edit
  // just made, before it has finished being written.
  const { board, editable, pending, error } = useEditor();

  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);
  const [selectedMealAnchor, setSelectedMealAnchor] = useState<HTMLButtonElement | null>(null);
  const [catalogContextMealId, setCatalogContextMealId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  // Which day the phone shows. Sunday until the dietitian says otherwise:
  // "today" would need a helper in the week logic, and this board is planning
  // next week anyway, where no day is today.
  const [selectedDay, setSelectedDay] = useState(0);

  const mealsById = useMemo(
    () => new Map(board.days.flatMap((day) => day.meals).map((meal) => [meal.id, meal])),
    [board.days],
  );
  const selectedMeal = selectedMealId ? mealsById.get(selectedMealId) : undefined;
  const catalogContextMeal = catalogContextMealId
    ? mealsById.get(catalogContextMealId)
    : undefined;


  const dailyTarget = Math.round(board.kcalTargetSnapshot);

  /*
   * The week's rows: one per slot, drawn from the union across all seven days.
   *
   * Not `max(meals per day)` any more. That counted rows without identifying
   * them, so a day missing its third slot rendered its fourth meal in row three
   * — fine when every card announced itself, and a lie the moment the slot rail
   * labels the row instead. See `board-rows.ts`.
   */
  const rows = useMemo(() => boardRows(board.days), [board.days]);
  // The floor of 1 covers a plan whose days are all still empty.
  const slotRows = Math.max(rows.length, 1);

  /*
   * One row template for the week: a header row, a row per meal slot, and — only
   * while the plan is editable, or the columns would end on a row nothing is ever
   * placed in — a row for the add control.
   *
   * The explicit floor is the readability contract. Metadata and the nutrition
   * shelf may never squeeze the dish name out of the card; when the viewport is
   * shorter than the week, the board scrolls instead of collapsing its content.
   */
  const rowTemplate = `auto repeat(${slotRows}, minmax(6rem, 1fr))${editable ? ' auto' : ''}`;

  /**
   * The previous plan's dish for each slot, marked where it repeats.
   *
   * Built once for the week rather than looked up per card, and only while compare
   * is on — thirty-five lookups a render is not free, and nobody is reading them
   * when the overlay is off.
   */
  const ghostsByDay = useMemo(() => {
    if (!comparing || !previous) return null;

    const byDay: Record<number, Record<string, GhostMeal>> = {};

    for (const day of board.days) {
      const ghosts: Record<string, GhostMeal> = {};

      for (const meal of day.meals) {
        const before = previous.slots[slotFillKey(day.dayOfWeek, meal.slotKey)];
        if (!before) continue;

        ghosts[meal.slotKey] = {
          nameAr: before.nameAr,
          isRepeat: meal.dish?.id === before.dishId,
        };
      }

      byDay[day.dayOfWeek] = ghosts;
    }

    return byDay;
  }, [comparing, previous, board.days]);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      {children}

      {/* Keep every plan action reachable when the toolbar wraps on a phone. */}
      <header className="border-b border-border pb-4">
        <h2 className="sr-only">{board.clientName}</h2>
        <div className="planner-action-bar flex w-full max-w-full flex-wrap items-center justify-start gap-2 pb-1 rtl:flex-row-reverse">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="planner-compact-trigger max-sm:px-3"
            aria-label={t('tabs.dishes')}
            title={t('tabs.dishes')}
            onClick={() => onCatalogOpenChange(true)}
          >
            <Icon name="dishes" />
            <span className="max-sm:sr-only">{t('tabs.dishes')}</span>
          </Button>
          {/*
            Plan actions, in a stable order that does not depend on status.

            The panels control is first in source order. `rtl:flex-row-reverse`
            keeps it on the physical left in both languages while the button's
            own text retains the document direction. The row wraps instead of
            scrolling, so every action remains reachable on a narrow screen.
          */}
          <PublishButton
            planId={board.id}
            status={board.status}
            unfilled={board.unfilled}
            locale={locale}
          />

          <NewWeekDialog
            clientId={board.clientId}
            board={board}
            locale={locale}
            newWeek={newWeek}
            triggerVariant="neutral"
            compactTrigger
          />

          {/*
            Always rendered, disabled until there is a published plan to edit.

            It used to appear on publish, which pushed every control after it
            sideways at the exact moment the dietitian was looking somewhere
            else. A control that is *going* to exist should hold its place: the
            row's shape then never changes, and the greyed-out button doubles as
            a note that this becomes available once the week is live.
          */}
          {/* The hint rides on a wrapping span, not on the button. `Button`
              carries `disabled:pointer-events-none`, and an element that takes
              no pointer events never fires the hover a native `title` needs —
              so the one explanation of *why* it is greyed out would have been
              unreachable exactly when it was wanted. */}
          <span title={board.status === 'published' ? undefined : t('editPublishedDisabled')}>
          <Button
            type="button"
            size="sm"
            variant="neutral"
            disabled={board.status !== 'published'}
            aria-pressed={allowPublished}
            onClick={() => {
              if (allowPublished) {
                onAllowPublished(false);
                return;
              }

              // One confirmation for the mode, not one per drop. Confirming every
              // drag would make the editor unusable.
              if (window.confirm(t('editPublishedConfirm'))) onAllowPublished(true);
            }}
          >
            <Icon name="edit" />
            {t('editPublished')}
          </Button>
          </span>

          {previous && (
            <Button
              type="button"
              size="sm"
              variant="neutral"
              aria-pressed={comparing}
              // The week being compared against is in the label's own tooltip
              // rather than in the label. A date is ten characters that change
              // nothing about what the button does, and it was the longest
              // string in a row that has to survive four other controls.
              title={t('compareWith', { date: previous.weekStartDate })}
              onClick={() => setComparing((value) => !value)}
            >
              <Icon name="history" />
              {t('compareShort')}
            </Button>
          )}

          <Popover>
            <PopoverTrigger
              className={buttonVariants({ variant: 'neutral', size: 'sm' })}
            >
              <Icon name="history" />
              {t('history')}
            </PopoverTrigger>
            <PopoverContent align="end" side="bottom" className="max-h-[min(32rem,70vh)] w-80 overflow-y-auto p-3">
              <PopoverTitle className="pb-1 text-label font-semibold">{t('history')}</PopoverTitle>
              {history}
            </PopoverContent>
          </Popover>

          <span
            role="status"
            aria-live="polite"
            className={cn(
              'ms-auto inline-flex min-w-24 items-center justify-end gap-2 text-label',
              error ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {pending || error ? (
              <>
                <Icon
                  name={error ? 'attention' : 'refresh'}
                  className={cn('size-4', pending && !error && 'motion-safe:animate-spin')}
                />
                {error ? t(error) : t('savingIndicator')}
              </>
            ) : null}
          </span>
        </div>
      </header>

      {allowPublished && (
        <p className="rounded-md bg-status-attention-bg px-3 py-2 text-body-sm text-status-attention-fg">
          {t('editPublishedWarning')}
        </p>
      )}

      {board.unfilled > 0 && (
        <p className="rounded-md bg-status-attention-bg px-3 py-2 text-body-sm text-status-attention-fg">
          {t('unfilledWarning', { count: board.unfilled })}
        </p>
      )}

      <BoardDayStrip days={board.days} selectedDay={selectedDay} onSelect={setSelectedDay} />

      <div className="flex min-h-0 flex-1">
        {/* Phones render one selected day. Tablets make the week itself a
            three-column-wide swipe surface, so the day picker no longer spends
            two rows above the work. The seven-column desktop keeps a 64rem
            readable floor and lets this wrapper own exceptional overflow.
            `h-full` keeps the row template's `1fr` working: the fr unit needs a
            definite height to share out. */}
        {/* The canvas under the cards is `canvas` — n-25, one stop off white —
            so a white card reads as a surface sitting on the board rather than
            as a bordered box on the page. Not `muted` (n-50): that is the
            *sunken* fill, and a board-sized expanse of it reads as beige rather
            than as white with the cards lifted off it. */}
        <div
          className="planner-week-scroll no-scrollbar min-w-0 flex-1 overflow-auto rounded-lg bg-background overscroll-contain"
          tabIndex={0}
          aria-label={t('title')}
        >
          {/* One grid for the week, and each day a subgrid of it, so every card in
              a row is the same height and the rows run straight across.
              `minmax(0,1fr)` per day rather than `1fr`, so a long dish name wraps
              instead of widening its column past the others.

              The first track is the slot rail. It is `auto` so it takes exactly
              the width its labels need, and it is first in *logical* order —
              which puts it at the inline-start, on the right in Arabic and the
              left in English, with no override either way.

              The row gap is declared here and only here: a subgrid inherits its
              parent's gutters, and repeating them on the day column would let the
              two drift out of step. */}
          <div
            className="planner-week-grid grid h-full grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 overflow-clip p-2 xl:min-w-[64rem] xl:grid-cols-[auto_repeat(7,minmax(0,1fr))]"
            style={{ gridTemplateRows: rowTemplate }}
          >
            <SlotRail rows={rows} editable={editable} />

            {board.days.map((day) => (
              <DayColumn
                key={day.dayOfWeek}
                day={day}
                rows={rows}
                dailyTarget={dailyTarget}
                editable={editable}
                selectedMealId={selectedMealId}
                onSelectMeal={(mealId, anchor) => {
                  const opening = selectedMealId !== mealId;
                  setSelectedMealId(opening ? mealId : null);
                  setSelectedMealAnchor(opening ? anchor : null);
                  if (opening) setCatalogContextMealId(mealId);
                }}
                ghosts={ghostsByDay?.[day.dayOfWeek]}
                compareDate={previous?.weekStartDate}
                showOnPhone={day.dayOfWeek === selectedDay}
              />
            ))}
          </div>
        </div>

      </div>

      <MealInspector
        meal={selectedMeal}
        anchor={selectedMealAnchor}
        candidates={selectedMeal ? candidates[selectedMeal.id] ?? [] : []}
        planId={board.id}
        locale={locale}
        editable={editable}
        model={board.model}
        onClose={() => {
          setSelectedMealId(null);
          setSelectedMealAnchor(null);
        }}
        onBrowseDishes={() => {
          if (selectedMeal) setCatalogContextMealId(selectedMeal.id);
          setSelectedMealId(null);
          setSelectedMealAnchor(null);
          onCatalogOpenChange(true);
        }}
      />

      <DishCatalogDrawer
        open={catalogOpen}
        onOpenChange={onCatalogOpenChange}
        catalog={catalog}
        usage={usage}
        slot={
          catalogContextMeal
            ? { slotKey: catalogContextMeal.slotKey, budgetKcal: catalogContextMeal.budgetKcal }
            : null
        }
        editable={editable}
        locale={locale}
      />

    </div>
  );
}

/**
 * The week, as seven things to tap on a phone, where even a three-column window
 * would become a queue of slivers. Tablets swipe the board itself instead.
 *
 * The shape is the portal strip's (`plan-day-strip.tsx`): four across, then
 * three. Not seven across, because Arabic weekday names are full words —
 * الأربعاء is eight characters — and seven columns inside 343px leaves about
 * 45px each; the only way to force one row is Intl's narrow form, which in
 * Arabic is a single letter (ن ث ر خ) that nobody reads as a weekday. Two
 * readable rows beat one cryptic one.
 *
 * What is deliberately not shared is the component. The portal selects a day by
 * navigating, so its server sends one day's meals rather than handing a phone a
 * week of dishes and ingredients to show a seventh of. The staff board already
 * holds the whole week in memory, so here the choice is local state and a round
 * trip would buy nothing.
 *
 * Days with nothing planned stay selectable and are only dimmed: an empty
 * Friday is a fact about the plan, and a day you cannot open reads as a broken
 * board rather than an empty one.
 */
function BoardDayStrip({
  days,
  selectedDay,
  onSelect,
}: {
  days: readonly BoardDay[];
  selectedDay: number;
  onSelect: (dayOfWeek: number) => void;
}) {
  const t = useTranslations('weeklyPlans');
  const tDays = useTranslations('weeklyPlans.days');

  return (
    <div
      role="group"
      aria-label={t('chooseDay')}
      className="grid shrink-0 grid-cols-4 gap-2 md:hidden"
    >
      {days.map((day) => {
        const active = day.dayOfWeek === selectedDay;
        const planned = day.meals.length > 0;

        return (
          <button
            key={day.dayOfWeek}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(day.dayOfWeek)}
            className={cn(
              'flex min-h-12 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg px-2 py-2',
              'transition-all duration-(--duration-sweep) ease-(--ease-sweep)',
              // The same focus and press treatment `buttonVariants` gives every
              // other control: a raw <button> otherwise falls back to the UA
              // outline, and a phone has no hover to stand in for a press cue.
              'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo active:translate-y-px',
              // Separated by fill, not by outline. Seven outlined boxes is six
              // competing borders before any content is read.
              active
                ? 'bg-primary text-primary-foreground'
                : planned
                  ? 'bg-muted text-foreground hover:bg-accent'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted',
            )}
          >
            <span className="text-body-sm leading-none">{tDays(dayKey(day.dayOfWeek))}</span>

            {/* Rendered either way so every day is the same height; invisible
                rather than absent when the day holds nothing. */}
            <span
              aria-hidden
              className={cn(
                'size-1.5 rounded-full',
                !planned && 'invisible',
                active ? 'bg-primary-foreground' : 'bg-primary',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
