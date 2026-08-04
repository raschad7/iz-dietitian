'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { getLocaleDirection } from '@/i18n/routing';
import { isMember } from '@/lib/enum';

import type {
  Board,
  CatalogEntry,
  ComparisonPlan,
  PlannableClient,
  SwapCandidate,
} from '../queries';
import { PLAN_STATUSES } from '../schema';
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
            className="grid h-full min-w-[68.75rem] grid-cols-7 gap-x-2.5 gap-y-1.5"
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
