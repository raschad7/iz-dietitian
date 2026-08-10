'use client';

import * as React from 'react';
import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { toast } from '@/components/ui/toast';

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
import { boardRows } from '../board-rows';
import { railTabsForPlan, type RailTab } from '../rail-state';
import { dayKey, PLAN_STATUSES } from '../schema';
import { slotFillKey } from '../skeleton';
import type { RecentUse } from '../usage';

import { BoardEditor, useEditor } from './board-dnd';
import { BoardSheet, useCompactPlanner } from './board-sheet';
import { ClientPicker } from './client-picker';
import { DayColumn } from './day-column';
import { SlotRail } from './slot-rail';
import { DishCatalog } from './dish-catalog';
import type { GhostMeal } from './meal-card';
import { MealDetailPanel } from './meal-detail-panel';
import { NewWeekDialog, type NewWeekProps } from './new-week-dialog';
import { PublishButton } from './publish-button';
import { RailTabs } from './rail-tabs';

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
  const { board, editable, pending, error, lastMove, undoLastMove } = useEditor();

  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);
  const [tab, setTab] = useState<RailTab>('client');
  const [comparing, setComparing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  /*
   * Whether the fixed rail is showing in the wide workspace.
   *
   * The week is the primary workspace, so the context rail only stays fixed
   * when the app rail, seven readable day columns and context rail all fit.
   */
  const [railOpen, setRailOpen] = useState(true);
  // Which day the phone shows. Sunday until the dietitian says otherwise:
  // "today" would need a helper in the week logic, and this board is planning
  // next week anyway, where no day is today.
  const [selectedDay, setSelectedDay] = useState(0);

  // Which of the two presentations the rail is in. The panels themselves do not
  // know, and are rendered into exactly one of them.
  const compactPlanner = useCompactPlanner();

  const selectedMeal = board.days
    .flatMap((day) => day.meals)
    .find((meal) => meal.id === selectedMealId);

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

  /**
   * The rail's four panels, written once.
   *
   * They are rendered into either the fixed rail or the sheet, never both: the
   * tabs and their panels carry `id`s that `aria-controls` and `aria-labelledby`
   * point at, and two copies would be two elements answering to one name.
   */
  function renderRailContent(collapsed = false) {
    return (
      <>
        <RailTabs
          className="shrink-0"
          label={t('title')}
          active={tab}
          onSelect={setTab}
          tabs={railTabsForPlan(true).map((id) => ({ id, label: t(`tabs.${id}`) }))}
          onToggle={() => {
            if (compactPlanner) setSheetOpen(false);
            else setRailOpen((open) => !open);
          }}
          toggleLabel={compactPlanner ? t('close') : t(railOpen ? 'hidePanels' : 'showPanels')}
          collapsed={collapsed}
        />

        {/* The tabs stay put and the panel under them scrolls. A tab bar that
            scrolls away with its own panel is a tab bar you have to scroll back
            up to use. */}
        {!collapsed ? (
          <div
            role="tabpanel"
            id={`rail-panel-${tab}`}
            aria-labelledby={`rail-tab-${tab}`}
            className={cn(
              'min-h-0 flex-1 overflow-hidden pt-3',
              !compactPlanner && 'ps-5',
            )}
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
                  onBrowseDishes={() => setTab('dishes')}
                />
              ) : (
                <p className="text-body-sm text-muted-foreground">{t('selectMeal')}</p>
              )
            ) : tab === 'past' ? (
              <div className="no-scrollbar h-full overflow-y-auto overflow-x-hidden">
                {history}
              </div>
            ) : (
              <div className="no-scrollbar h-full overflow-y-auto overflow-x-hidden">
                {children}
              </div>
            )}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      {/*
        The header wraps rather than clips. Every item in it but the client name
        was `whitespace-nowrap` or `shrink-0`, so below about 375px the name
        truncated to nothing and then the row simply ran off the end of the
        screen — the controls were still there, just not reachable. Wrapping
        costs a second line on a phone and keeps every control pressable, which
        is the trade a toolbar should make; hiding a control to save a row means
        the feature is gone.
      */}
      <header className="border-b border-border pb-4">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
          <span className="block text-caption text-muted-foreground">{t('title')}</span>
          <h2 className="sr-only">{board.clientName}</h2>
          <ClientPicker
            clients={clients}
            selectedClientId={board.clientId}
            appearance="heading"
          />
            <div className="mt-2 flex flex-wrap items-center gap-y-1 text-label text-muted-foreground">
              {isMember(PLAN_STATUSES, board.status) && (
          <span className="inline-flex items-center gap-2 pe-3">
            <span
              aria-hidden
              className={cn(
                'size-2 rounded-full',
                board.status === 'published' ? 'bg-primary' : 'bg-muted-foreground',
              )}
            />
            {t(`status.${board.status}`)}
          </span>
              )}

        <span className="whitespace-nowrap border-s border-border px-3">
          {t('weekOf', { date: board.weekStartDate })}
        </span>

        {/* The one fact here that is printed elsewhere on the same screen — the
            client panel carries it, and so does every unplanned day column — so
            it is the one that gives up its place on a phone. */}
        <span className="hidden whitespace-nowrap border-s border-border ps-3 sm:inline">
          {t('dailyTargetShort', { value: dailyTarget })}
        </span>

        {/* Reserved width, so a save does not reflow the row it sits in. Only
            where there is width to reserve: on a phone the row is already two
            lines and 96px of held-open blank is a third. */}
            </div>
          </div>

          <div className="planner-action-bar flex w-full max-w-full shrink-0 flex-wrap items-center justify-start gap-2 pb-1 sm:w-auto rtl:flex-row-reverse">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="planner-compact-trigger max-sm:px-3"
            aria-label={t('openPanels')}
            title={t('openPanels')}
            onClick={() => setSheetOpen(true)}
          >
            <Icon name="moreActions" />
            <span className="max-sm:sr-only">{t('openPanels')}</span>
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

          </div>
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
            className="planner-week-grid grid h-full grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-2 p-2 xl:min-w-[64rem] xl:grid-cols-[auto_repeat(7,minmax(0,1fr))]"
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
                onSelectMeal={(mealId) => {
                  const opening = selectedMealId !== mealId;
                  setSelectedMealId(opening ? mealId : null);
                  setTab('meal');

                  // Whichever presentation the rail is in has to be showing, or
                  // the card opens a panel into nothing. Only on the way *open*:
                  // tapping the selected card again closes it, and reopening the
                  // rail on that press would fight the press.
                  if (!opening) return;
                  // In the compact layout this is the sheet. Setting it
                  // unconditionally
                  // left `sheetOpen` stuck true on a desktop that never showed
                  // the sheet — and narrowing the window afterwards then popped
                  // it open with nothing having asked.
                  if (compactPlanner) setSheetOpen(true);
                  else setRailOpen(true);
                }}
                ghosts={ghostsByDay?.[day.dayOfWeek]}
                compareDate={previous?.weekStartDate}
                showOnPhone={day.dayOfWeek === selectedDay}
              />
            ))}
          </div>
        </div>

        {/* The rail collapses into its own 48px edge, so the same control stays
            attached to the same object. Only the panel content unmounts; the
            rail itself never jumps into the toolbar. */}
        <aside
          aria-label={t('openPanels')}
          className={cn(
            'planner-desktop-rail shrink-0 flex-col overflow-hidden border-s border-border',
            'transition-[width] duration-300 ease-[cubic-bezier(.16,1,.3,1)]',
            railOpen ? 'w-[22rem]' : 'w-12',
          )}
        >
          {!compactPlanner && renderRailContent(!railOpen)}
        </aside>
      </div>

      <BoardSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        label={t('openPanels')}
        closeLabel={t('close')}
        dir={getLocaleDirection(activeLocale)}
        showDefaultClose={false}
      >
        {compactPlanner && renderRailContent()}
      </BoardSheet>

      {/* Persistence feedback floats above the workspace instead of inserting a
          new header row. Optimistic edits already move immediately; this quiet
          indicator confirms the background write without making the tool jump. */}
      <div
        role="status"
        aria-live="polite"
        aria-hidden={!pending && !error}
        className={cn(
          'pointer-events-none fixed bottom-4 end-4 z-50 flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-label shadow-elevated',
          'transition-[opacity,transform] duration-150 ease-[cubic-bezier(.16,1,.3,1)]',
          pending || error ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
          error ? 'border-destructive text-destructive' : 'border-border text-muted-foreground',
        )}
      >
        <Icon
          name={error ? 'attention' : 'refresh'}
          className={cn('size-4', pending && !error && 'motion-safe:animate-spin')}
        />
        {error ? t(error) : t('savingIndicator')}
      </div>

      <MoveToast lastMove={lastMove} pending={pending} undoLastMove={undoLastMove} />

    </div>
  );
}

/**
 * "Moved X", with the way back.
 *
 * This used to be a fixed bar this component drew for itself, pinned to the
 * bottom of the viewport with its own shadow, radius and translate. It is a
 * toast — an transient status message with one action — so it is now the app's
 * toast, and there is one fewer floating surface to keep in step with the rest.
 *
 * Keyed on the move rather than on its existence: dragging a second meal while
 * the first announcement is still up has to replace it, and an effect watching
 * a truthy `lastMove` would not fire again.
 */
function MoveToast({
  lastMove,
  pending,
  undoLastMove,
}: {
  lastMove: { dishName: string } | null;
  pending: boolean;
  undoLastMove: () => void;
}) {
  const t = useTranslations('weeklyPlans');

  React.useEffect(() => {
    if (!lastMove) return;

    toast.add({
      title: t('mealMoved', { name: lastMove.dishName }),
      actionProps: {
        children: t('undo'),
        disabled: pending,
        onClick: undoLastMove,
      },
    });
    // `pending` is deliberately not a dependency: it flips while the move is
    // saving, and re-running on it would post the same toast twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMove, t]);

  return null;
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
