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
import { dayOfWeekForDate, orderedWeekdays } from '../week';

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
  const { board, editable, error } = useEditor();

  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);
  const [selectedMealAnchor, setSelectedMealAnchor] = useState<HTMLButtonElement | null>(null);
  const [catalogContextMealId, setCatalogContextMealId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const firstDay = dayOfWeekForDate(board.weekStartDate) ?? 0;
  const [selectedDay, setSelectedDay] = useState(firstDay);

  const orderedDays = useMemo(() => {
    const byWeekday = new Map(board.days.map((day) => [day.dayOfWeek, day]));

    return orderedWeekdays(board.weekStartDate).flatMap((dayOfWeek) => {
      const day = byWeekday.get(dayOfWeek);
      return day ? [day] : [];
    });
  }, [board.days, board.weekStartDate]);

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
   * as a stable footer track for the add control. That footer remains reserved
   * after publishing so hiding the control cannot resize every meal row.
   *
   * The real remaining canvas, not the viewport, distributes the flexible rows.
   * The 4.5rem floor protects the dish name and nutrition shelf when an unusually
   * long schedule still needs to scroll.
   */
  const rowTemplate = `auto repeat(${slotRows}, minmax(4.5rem, 1fr)) 2.75rem`;

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
      {/* No `shadow-card`. The header is a full-width band pinned to the top of
          the workspace, not a card floating on it, and a shadow under something
          that spans the frame reads as a seam rather than as depth. The border
          is what separates it from the board. */}
      <header className="grid overflow-hidden rounded-lg border border-border bg-card 2xl:grid-cols-[minmax(0,1fr)_auto]">
        <h2 className="sr-only">{board.clientName}</h2>
        <div className="min-w-0">{children}</div>

        <div className="planner-action-bar mx-2 mb-2 flex max-w-full flex-wrap items-center justify-end gap-1.5 rounded-lg bg-muted/70 p-1.5 2xl:my-2 2xl:me-2 2xl:ms-0 2xl:w-auto 2xl:self-center 2xl:flex-nowrap 2xl:justify-center">
          <Button
            type="button"
            size="sm"
            variant="neutral"
            className="px-3 2xl:size-10 2xl:rounded-full 2xl:px-0"
            aria-label={t('tabs.dishes')}
            title={t('tabs.dishes')}
            onClick={() => onCatalogOpenChange(true)}
          >
            <Icon name="dishes" />
            <span className="2xl:sr-only">{t('tabs.dishes')}</span>
          </Button>
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

          <Popover>
            <PopoverTrigger
              aria-label={t('moreActions')}
              title={t('moreActions')}
              className={buttonVariants({ variant: 'neutral', size: 'icon-sm' })}
            >
              <Icon name="moreActions" />
              <span className="sr-only">{t('moreActions')}</span>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="bottom"
              className="max-h-[min(36rem,75vh)] w-80 overflow-y-auto p-3"
            >
              <PopoverTitle className="pb-2 text-label font-semibold">
                {t('moreActions')}
              </PopoverTitle>

              <div className="space-y-1">
                {previous && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-pressed={comparing}
                    className="w-full max-w-none justify-start"
                    title={t('compareWith', { date: previous.weekStartDate })}
                    onClick={() => setComparing((value) => !value)}
                  >
                    <Icon name="history" />
                    {t('compareShort')}
                  </Button>
                )}

                {board.status === 'published' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-pressed={allowPublished}
                    className="w-full max-w-none justify-start"
                    onClick={() => {
                      if (allowPublished) {
                        onAllowPublished(false);
                        return;
                      }

                      if (window.confirm(t('editPublishedConfirm'))) onAllowPublished(true);
                    }}
                  >
                    <Icon name="edit" />
                    {t('editPublished')}
                  </Button>
                )}
              </div>

              <div className="mt-2 border-t border-border pt-2">
                <p className="pb-1 text-caption font-semibold text-muted-foreground">
                  {t('history')}
                </p>
                {history}
              </div>
            </PopoverContent>
          </Popover>

          {/*
            Only failures are announced here now.

            The "saving" line used to appear in this row for the few hundred
            milliseconds an edit takes and then leave again, and because it is a
            flex item the whole action bar jumped sideways twice per edit — so
            replacing a meal made the header look unstable at exactly the moment
            the dietitian was watching the board redraw. A spinner that costs a
            layout shift is worse than no spinner: the edit is already visible
            optimistically on the card, which is the real feedback. An error
            still has to be said out loud, and that is rare enough to be worth
            the reflow.
          */}
          {error ? (
            <span
              role="status"
              aria-live="polite"
              className="ms-auto inline-flex items-center justify-end gap-2 text-label text-destructive"
            >
              <Icon name="attention" className="size-4" />
              {t(error)}
            </span>
          ) : null}
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

      <BoardDayStrip days={orderedDays} selectedDay={selectedDay} onSelect={setSelectedDay} />

      <div className="flex min-h-0 flex-1">
        {/* Phones render one selected day. Tablets make the week itself a
            three-column-wide swipe surface, so the day picker no longer spends
            two rows above the work. The seven-column desktop uses the available
            width; only unusually long schedules need exceptional overflow. */}
        {/* The canvas under the cards is `canvas` — n-25, one stop off white —
            so a white card reads as a surface sitting on the board rather than
            as a bordered box on the page. Not `muted` (n-50): that is the
            *sunken* fill, and a board-sized expanse of it reads as beige rather
            than as white with the cards lifted off it. */}
        {/* `overscroll-x-contain`, not `overscroll-contain`. The board is the
            one two-axis scroller in the app: sideways it holds the week, and
            containment there is what stops a swipe past Saturday from being
            read as a browser back-gesture. On the block axis it had nothing to
            contain — the grid usually fits — and containment applies to the box
            whether or not it can scroll, so the wheel died on the largest
            surface of the screen and the rail was the only place the page would
            move from. Naming the axis keeps the gesture guard and gives the
            wheel back. */}
        <div
          className="planner-week-scroll no-scrollbar min-w-0 flex-1 overflow-auto rounded-lg bg-background overscroll-x-contain"
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
              two drift out of step.

              **`min-h-full`, not `h-full`, and the clip is on one axis.** The
              `1fr` rows do need a definite height to share out, which is what
              `h-full` was for — but it also pinned the grid to the frame, and
              `overflow-clip` then cut off whatever would not fit. On a 720px
              window that was a whole row of seven meals: drawn nowhere,
              reachable by nothing, with no scrollbar to suggest they existed.
              `min-h-full` keeps the fr distribution when the week fits and lets
              the grid grow past the frame when the readability floor says it
              must — which is the case the frame's own
              `overflow-auto` was always there to handle.

              The clip stays on the inline axis, because that is the one it was
              for: `.planner-row-cell::before` reaches half into the column
              gutter to draw a continuous rule, and the outermost two reaches
              have to be cut off the board's edge. `overflow-x: clip` beside
              `overflow-y: visible` is a legal pair — unlike `hidden`, `clip`
              does not force the other axis to become a scroll container — so
              the block overflow travels up to the frame the way it should. */}
          <div
            className="planner-week-grid grid min-h-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-4 overflow-x-clip p-2 xl:grid-cols-[auto_repeat(7,minmax(0,1fr))] xl:gap-x-4 2xl:gap-x-6"
            style={{ gridTemplateRows: rowTemplate }}
          >
            <SlotRail rows={rows} editable={editable} />

            {orderedDays.map((day) => (
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
        catalog={catalog}
        usage={usage}
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
