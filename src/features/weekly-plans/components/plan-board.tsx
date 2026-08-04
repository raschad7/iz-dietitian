'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { getLocaleDirection } from '@/i18n/routing';
import { isMember } from '@/lib/enum';
import { cn } from '@/lib/utils';

import type {
  Board,
  BoardDay,
  CatalogEntry,
  ComparisonPlan,
  PlannableClient,
  SwapCandidate,
} from '../queries';
import { dayKey, PLAN_STATUSES } from '../schema';
import { slotFillKey } from '../skeleton';
import type { RecentUse } from '../usage';

import { BoardEditor, useEditor } from './board-dnd';
import { BoardSheet, useBelowXl } from './board-sheet';
import { ClientPicker } from './client-picker';
import { DayColumn } from './day-column';
import { DishCatalog } from './dish-catalog';
import type { GhostMeal } from './meal-card';
import { MealDetailPanel } from './meal-detail-panel';
import { NewWeekDialog, type NewWeekProps } from './new-week-dialog';
import { PublishButton } from './publish-button';
import { RailTabs } from './rail-tabs';

/** The rail's panels. */
type RailTab = 'client' | 'dishes' | 'meal' | 'past';

type BoardProps = {
  board: Board;
  /** Every client with a plannable record, for the header's picker. */
  clients: readonly PlannableClient[];
  candidates: Record<string, SwapCandidate[]>;
  catalog: readonly CatalogEntry[];
  usage: Record<string, RecentUse>;
  /** The plan immediately before this one, for the compare overlay. */
  previous: ComparisonPlan | null;
  locale: string;
  /** The client's earlier weeks, rendered on the server. */
  history: React.ReactNode;
  newWeek: NewWeekProps;
  /** The context panel, rendered on the server and shown on the client tab. */
  children: React.ReactNode;
};

/**
 * The board: seven day columns, and an end-side rail of panels.
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

  const editable =
    props.board.status === 'draft' || (props.board.status === 'published' && allowPublished);

  return (
    <BoardEditor
      board={props.board}
      editable={editable}
      allowPublished={allowPublished}
      locale={props.locale}
    >
      <BoardBody {...props} allowPublished={allowPublished} onAllowPublished={setAllowPublished} />
    </BoardEditor>
  );
}

function BoardBody({
  clients,
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
}: BoardProps & { allowPublished: boolean; onAllowPublished: (value: boolean) => void }) {
  const t = useTranslations('weeklyPlans');
  const activeLocale = useLocale();
  // The optimistic board, not the server one: everything below renders the edit
  // just made, before it has finished being written.
  const { board, editable, pending, error } = useEditor();

  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);
  const [tab, setTab] = useState<RailTab>('client');
  const [comparing, setComparing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Which day the phone is showing. Sunday until the dietitian says otherwise:
  // "today" would need a helper in the week logic, and this board is planning
  // next week anyway, where no day is today.
  const [selectedDay, setSelectedDay] = useState(0);

  // Which of the two presentations the rail is in. The panels themselves do not
  // know, and are rendered into exactly one of them.
  const belowXl = useBelowXl();

  const selectedMeal = board.days
    .flatMap((day) => day.meals)
    .find((meal) => meal.id === selectedMealId);

  const dailyTarget = Math.round(board.kcalTargetSnapshot);

  // Every day carries the same slots, so one day's count sizes the whole grid.
  // The floor of 1 covers a plan whose days are all still empty.
  const slotRows = Math.max(...board.days.map((day) => day.meals.length), 1);

  /*
   * One row template for the week: a header row, a row per meal slot, and — only
   * while the plan is editable, or the columns would end on a row nothing is ever
   * placed in — a row for the add control.
   *
   * `minmax(auto, 1fr)` rather than a fixed floor such as `minmax(6rem, 1fr)`. A
   * fixed minimum is not an intrinsic min track sizing function, so it switches
   * off the grid item's automatic minimum size; and once the board is taller than
   * the viewport there is no positive free space left for the `1fr` to grow the
   * track with, so every row would pin at the floor and the taller cards would
   * spill into the row below. `auto` floors each row at its own content and still
   * stretches to fill a board with room to spare.
   */
  const rowTemplate = `auto repeat(${slotRows}, minmax(auto, 1fr))${editable ? ' auto' : ''}`;

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

  /**
   * The rail's four panels, written once.
   *
   * They are rendered into either the fixed rail or the sheet, never both: the
   * tabs and their panels carry `id`s that `aria-controls` and `aria-labelledby`
   * point at, and two copies would be two elements answering to one name.
   */
  const railContent = (
    <>
      <RailTabs
        className="shrink-0"
        label={t('title')}
        active={tab}
        onSelect={setTab}
        tabs={[
          { id: 'client' as const, label: t('tabs.client') },
          { id: 'dishes' as const, label: t('tabs.dishes') },
          { id: 'meal' as const, label: t('tabs.meal') },
          { id: 'past' as const, label: t('tabs.past') },
        ]}
      />

      {/* The tabs stay put and the panel under them scrolls. A tab bar that
          scrolls away with its own panel is a tab bar you have to scroll back
          up to use. */}
      <div
        role="tabpanel"
        id={`rail-panel-${tab}`}
        aria-labelledby={`rail-tab-${tab}`}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {tab === 'dishes' ? (
          <DishCatalog
            catalog={catalog}
            usage={usage}
            slot={
              selectedMeal
                ? { slotKey: selectedMeal.slotKey, budgetKcal: selectedMeal.budgetKcal }
                : null
            }
            editable={editable}
          />
        ) : tab === 'meal' ? (
          selectedMeal ? (
            <MealDetailPanel
              meal={selectedMeal}
              candidates={candidates[selectedMeal.id] ?? []}
              planId={board.id}
              locale={locale}
              editable={editable}
              model={board.model}
              onClose={() => {
                setSelectedMealId(null);
                setTab('client');
              }}
            />
          ) : (
            <p className="text-body-sm text-muted-foreground">{t('selectMeal')}</p>
          )
        ) : tab === 'past' ? (
          history
        ) : (
          children
        )}
      </div>
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/*
        The header wraps rather than clips. Every item in it but the client name
        was `whitespace-nowrap` or `shrink-0`, so below about 375px the name
        truncated to nothing and then the row simply ran off the end of the
        screen — the controls were still there, just not reachable. Wrapping
        costs a second line on a phone and keeps every control pressable, which
        is the trade a toolbar should make; hiding a control to save a row means
        the feature is gone.
      */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ClientPicker clients={clients} selectedClientId={board.clientId} />

        {isMember(PLAN_STATUSES, board.status) && (
          <Badge variant={board.status === 'published' ? 'default' : 'muted'}>
            {t(`status.${board.status}`)}
          </Badge>
        )}

        <span className="whitespace-nowrap text-label text-muted-foreground">
          {t('weekOf', { date: board.weekStartDate })}
        </span>

        {/* The one fact here that is printed elsewhere on the same screen — the
            client panel carries it, and so does every unplanned day column — so
            it is the one that gives up its place on a phone. */}
        <span className="hidden whitespace-nowrap text-label text-muted-foreground sm:inline">
          {t('dailyTargetShort', { value: dailyTarget })}
        </span>

        {/* Reserved width, so a save does not reflow the row it sits in. Only
            where there is width to reserve: on a phone the row is already two
            lines and 96px of held-open blank is a third. */}
        <span
          role="status"
          aria-live="polite"
          className="shrink-0 text-label text-muted-foreground sm:min-w-24"
        >
          {error ? (
            <span className="text-destructive">{t(error)}</span>
          ) : pending ? (
            t('savingIndicator')
          ) : null}
        </span>

        <div className="ms-auto flex flex-wrap items-center justify-end gap-3">
          {/* Below `xl` the rail is a sheet, and a sheet that only opens by
              tapping a meal leaves the client, the catalog and the past weeks
              with no door at all. */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="xl:hidden"
            onClick={() => setSheetOpen(true)}
          >
            {t('openPanels')}
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
          />

          {board.status === 'published' && (
            <Button
              type="button"
              size="sm"
              variant={allowPublished ? 'default' : 'outline'}
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
              {t('editPublished')}
            </Button>
          )}

          {previous && (
            <Button
              type="button"
              size="sm"
              variant={comparing ? 'default' : 'outline'}
              aria-pressed={comparing}
              onClick={() => setComparing((value) => !value)}
            >
              {t('compareWith', { date: previous.weekStartDate })}
            </Button>
          )}
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

      <div className="flex min-h-0 flex-1 gap-3">
        {/* The week scrolls sideways rather than being crushed. Seven columns
            need about 150px each before a dish name stops fitting on two lines,
            so the grid has a floor of 1100px and this wrapper is what carries
            the overflow — the grid cannot be its own scroller and also refuse
            to shrink. `h-full` keeps the row template's `1fr` working: the fr
            unit needs a definite height to share out, and inside a scroller the
            grid would otherwise size to its content and never stretch. */}
        <div className="min-w-0 flex-1 overflow-auto">
          {/* One grid for the week, and each day a subgrid of it, so every card in
              a row is the same height and the rows run straight across.
              `grid-cols-7` is `repeat(7, minmax(0,1fr))` rather than `1fr`, so a
              long dish name wraps instead of widening its column past the others.

              The row gap is declared here and only here: a subgrid inherits its
              parent's gutters, and repeating them on the day column would let the
              two drift out of step. */}
          <div
            className="grid h-full grid-cols-7 gap-x-2.5 gap-y-1.5 max-md:grid-cols-1 md:min-w-[68.75rem]"
            style={{ gridTemplateRows: rowTemplate }}
          >
            {board.days.map((day) => (
              <DayColumn
                key={day.dayOfWeek}
                day={day}
                dailyTarget={dailyTarget}
                planId={board.id}
                locale={locale}
                editable={editable}
                selectedMealId={selectedMealId}
                onSelectMeal={(mealId) => {
                  setSelectedMealId((current) => (current === mealId ? null : mealId));
                  setTab('meal');
                  // Above `xl` the sheet never opens, so this is free there.
                  setSheetOpen(true);
                }}
                ghosts={ghostsByDay?.[day.dayOfWeek]}
                compareDate={previous?.weekStartDate}
                showOnPhone={day.dayOfWeek === selectedDay}
              />
            ))}
          </div>
        </div>

        <aside className="hidden w-72 shrink-0 flex-col border-s border-border ps-3 xl:flex">
          {!belowXl && railContent}
        </aside>
      </div>

      <BoardSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        label={t('openPanels')}
        closeLabel={t('close')}
        dir={getLocaleDirection(activeLocale)}
      >
        {belowXl && railContent}
      </BoardSheet>
    </div>
  );
}

/**
 * The week, as seven things to tap — below `md`, where seven columns are not a
 * layout, they are a queue of slivers.
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
