'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

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
import { BoardSheet, useBelowXl } from './board-sheet';
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
   * Whether the fixed rail is showing, above `xl`.
   *
   * The board did not fit on any monitor. Seven columns at the 150px floor plus
   * their gutters is 1104px; the rail costs 373px and the app's own rail 256px,
   * so even a 1920px window left the week 9px short and every narrower one cut
   * two or three days off the end — with no scrollbar in view to say so. The
   * week is the screen, so the rail is what gives way.
   */
  const [railOpen, setRailOpen] = useState(true);
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
  const rowTemplate = `auto repeat(${slotRows}, minmax(7rem, 1fr))${editable ? ' auto' : ''}`;

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
        tabs={railTabsForPlan(true).map((id) => ({ id, label: t(`tabs.${id}`) }))}
      />

      {/* The tabs stay put and the panel under them scrolls. A tab bar that
          scrolls away with its own panel is a tab bar you have to scroll back
          up to use. */}
      <div
        role="tabpanel"
        id={`rail-panel-${tab}`}
        aria-labelledby={`rail-tab-${tab}`}
        className="min-h-0 flex-1 overflow-hidden pt-3"
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
          <div className="no-scrollbar h-full overflow-y-auto overflow-x-hidden">{history}</div>
        ) : (
          <div className="no-scrollbar h-full overflow-y-auto overflow-x-hidden">{children}</div>
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

          <div className="flex flex-wrap items-center justify-end gap-2">
          {/*
            Plan actions, in a fixed order that does not depend on status.

            Publishing is always the first control and always the same control —
            see `publish-button.tsx` for why the header no longer promotes a
            different button to the solid fill once a plan goes live. "New week"
            is always second and always quiet. The two status-dependent controls
            are *appended* rather than inserted, so nothing already on the row
            shifts sideways when a plan is published.
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

          {/*
            View controls, fenced off from the actions above.

            They change what is on screen rather than what is in the plan, and
            with a published plan there are already four controls beside them —
            which is the row that wrapped into a ragged second line. A hairline
            and icon-only triggers buy back about 180px of label and say the two
            groups are different kinds of thing.
          */}
          <span className="flex items-center gap-2 border-s border-border ps-2">
            {/* Below `xl` the rail is a sheet, and a sheet that only opens by
                tapping a meal leaves the client, the catalog and the past weeks
                with no door at all — so this one keeps its label. It is the
                only way to those panels on a narrow screen, and an unlabelled
                glyph is a door nobody finds. */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="planner-compact-trigger"
              onClick={() => setSheetOpen(true)}
            >
              {t('openPanels')}
            </Button>

            {/* Above `xl` the same panels are already on screen, so this is not
                a door, it is a width dial — and the one control in the row that
                can afford to be a glyph, because losing it costs a view
                preference rather than access to anything. */}
            {/* `outline`, not `ghost`. A boxless chevron alone at the end of a
                toolbar reads as a scroll arrow rather than a control — the
                glyph needs an edge around it to say it is pressable, which is
                the trade an icon-only button makes for giving up its label. */}
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              className="planner-rail-toggle"
              aria-pressed={!railOpen}
              aria-label={railOpen ? t('hidePanels') : t('showPanels')}
              title={railOpen ? t('hidePanels') : t('showPanels')}
              onClick={() => setRailOpen((value) => !value)}
            >
              <Icon name={railOpen ? 'chevronEnd' : 'chevronStart'} />
            </Button>
          </span>
          </div>
        </div>

        {(pending || error) && (
          <p
            role="status"
            aria-live="polite"
            className={cn('mt-2 text-label text-muted-foreground', error && 'text-destructive')}
          >
            {error ? t(error) : t('savingIndicator')}
          </p>
        )}
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
            so the grid has a floor of 1104px — seven of those plus the six 10px
            gutters between them — and this wrapper is what carries the
            overflow; the grid cannot be its own scroller and also refuse to
            shrink. `h-full` keeps the row template's `1fr` working: the fr unit
            needs a definite height to share out, and inside a scroller the grid
            would otherwise size to its content and never stretch.

            The floor was 78rem, which is 169px a column — 9px more than a 1920px
            window can give it once both rails are paid for, so the week was
            clipped on every monitor there is and the collapse control above had
            nothing to collapse *to*. 69rem is the floor the comment always
            claimed. */}
        {/* The canvas under the cards is `canvas` — n-25, one stop off white —
            so a white card reads as a surface sitting on the board rather than
            as a bordered box on the page. Not `muted` (n-50): that is the
            *sunken* fill, and a board-sized expanse of it reads as beige rather
            than as white with the cards lifted off it. */}
        <div className="min-w-0 flex-1 overflow-auto rounded-lg bg-background [scrollbar-gutter:stable]">
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
            className="grid h-full grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-2 p-2 md:min-w-[74rem] md:grid-cols-[auto_repeat(7,minmax(0,1fr))]"
            style={{ gridTemplateRows: rowTemplate }}
          >
            <SlotRail rows={rows} editable={editable} />

            {board.days.map((day) => (
              <DayColumn
                key={day.dayOfWeek}
                day={day}
                rows={rows}
                dailyTarget={dailyTarget}
                planId={board.id}
                locale={locale}
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
                  // Below `xl` this is the sheet. Setting it unconditionally
                  // left `sheetOpen` stuck true on a desktop that never showed
                  // the sheet — and narrowing the window afterwards then popped
                  // it open with nothing having asked.
                  if (belowXl) setSheetOpen(true);
                  else setRailOpen(true);
                }}
                ghosts={ghostsByDay?.[day.dayOfWeek]}
                compareDate={previous?.weekStartDate}
                showOnPhone={day.dayOfWeek === selectedDay}
              />
            ))}
          </div>
        </div>

        {/* Unmounted rather than hidden when collapsed. The panels carry the
            `id`s `aria-controls` points at, so a hidden second copy would be a
            second element answering to the same name — the same reason the rail
            and the sheet never render together. */}
        {railOpen && (
          <aside className="planner-desktop-rail w-[22rem] shrink-0 flex-col border-s border-border ps-5">
            {!belowXl && railContent}
          </aside>
        )}
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

      {lastMove && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 start-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-card py-1.5 ps-4 pe-1.5 text-body-sm shadow-overlay rtl:translate-x-1/2"
        >
          <span className="min-w-0 truncate">{t('mealMoved', { name: lastMove.dishName })}</span>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={undoLastMove}>
            {t('undo')}
          </Button>
        </div>
      )}
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
