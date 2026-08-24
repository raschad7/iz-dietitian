'use client';

import * as React from 'react';
import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { Button, buttonVariants } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Icon } from '@/components/ui/icon';
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { TooltipHint } from '@/components/ui/tooltip-hint';

import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { deletePlanAction } from '../actions';
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
import { dayOfWeekForDate, orderedWeekdays, planColumnDates } from '../week';

import { BoardEditor, useEditor } from './board-dnd';
import { DayColumn } from './day-column';
import { SlotRail } from './slot-rail';
import { DishCatalogDrawer } from './dish-catalog-drawer';
import type { GhostMeal } from './meal-card';
import { MealInspector } from './meal-inspector';
import { NewWeekDialog, type NewWeekProps } from './new-week-dialog';
import { PublishButton } from './publish-button';
import { TagColorKey } from './tag-color-key';

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
  const [catalogOpen, setCatalogOpen] = useState(false);

  // Only a draft is editable. A published plan's nutrition is frozen at publish
  // time, so editing one in place would leave a card showing the previous dish's
  // calories under the new dish's name. Unpublish first — which clears the frozen
  // numbers and makes it a live draft again — then republish. See `editablePlan`.
  const editable = props.board.status === 'draft';

  return (
    <BoardEditor
      board={props.board}
      editable={editable}
      locale={props.locale}
      onDishDragStart={() => setCatalogOpen(false)}
    >
      <BoardBody {...props} catalogOpen={catalogOpen} onCatalogOpenChange={setCatalogOpen} />
    </BoardEditor>
  );
}

/**
 * A standing note above the board — the plan is published and read-only, or a
 * meal is still empty and publishing is blocked on it.
 *
 * Two sizes, because this is a band across the whole board and it is paid for
 * in meal cards. On a phone it is a 14px sentence with room around it, which is
 * how a warning should read on a page that scrolls and where a band costs
 * nothing anyone can see. From `md` up the board is pinned to the frame and
 * every pixel above it is taken off the week, so it becomes a 12px line with
 * the glyph carrying the alarm the fill used to carry alone: 24px instead of
 * 40, saying exactly the same thing.
 *
 * The glyph takes no `label`, which is what makes `Icon` mark it `aria-hidden`.
 * The sentence beside it already names the condition.
 */
function BoardNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-md bg-status-attention-bg px-3 py-2 text-body-sm text-status-attention-fg md:py-1 md:text-caption">
      <Icon name="attention" className="size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
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
  catalogOpen,
  onCatalogOpenChange,
}: BoardProps & {
  catalogOpen: boolean;
  onCatalogOpenChange: (value: boolean) => void;
}) {
  const t = useTranslations('weeklyPlans');
  const tCommon = useTranslations('common');
  // The optimistic board, not the server one: everything below renders the edit
  // just made, before it has finished being written.
  const { board, editable, error } = useEditor();

  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);
  const [selectedMealAnchor, setSelectedMealAnchor] = useState<HTMLButtonElement | null>(null);
  const [catalogContextMealId, setCatalogContextMealId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, startDeleting] = useTransition();
  const firstDay = dayOfWeekForDate(board.weekStartDate) ?? 0;
  const [selectedDay, setSelectedDay] = useState(firstDay);

  const orderedDays = useMemo(() => {
    const byWeekday = new Map(board.days.map((day) => [day.dayOfWeek, day]));

    return orderedWeekdays(board.weekStartDate).flatMap((dayOfWeek) => {
      const day = byWeekday.get(dayOfWeek);
      return day ? [day] : [];
    });
  }, [board.days, board.weekStartDate]);

  /* The calendar date behind each column heading, keyed by weekday so a rotated
     week (one starting on a Wednesday) still lands each date on its own column.
     `namesMonth` travels with it — see `planColumnDates` for why the month is
     printed on some columns and not others. */
  const columnDates = useMemo(
    () => new Map(planColumnDates(board.weekStartDate).map((column) => [column.dayOfWeek, column])),
    [board.weekStartDate],
  );

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
   * ── `auto`, not `1fr`, for the meal rows ──
   *
   * `1fr` makes every row the same height, which is tidy and is also why a
   * landscape iPad could not show a whole day. `1fr` tracks are all sized to
   * the largest one's content, so a single dish name long enough to wrap —
   * "Hummus with tahini and bread", one card of thirty-five — added 22px to
   * *all five* rows. On a 768px-tall screen that is 110px, which is the last
   * meal of the day pushed under the fold, on the one screen where the point is
   * seeing the day at once.
   *
   * An `auto` maximum sizes each row to what that row actually holds, and grid's
   * own `align-content: normal` still stretches auto tracks to fill the frame
   * when there is room to spare — so a tall window fills exactly as before, and
   * a short one shows five rows instead of four and a bit. Rows can now differ
   * from one another by a line of dish name, which is what a table does.
   *
   * `min-content` on the header row so the stretch passes it by: it holds the
   * day name and the day's total, and space added there would open a gap
   * between the name and the first card rather than going to the meals.
   *
   * The 4.5rem floor still protects the dish name and the figure under it.
   */
  const rowTemplate = `min-content repeat(${slotRows}, minmax(4.5rem, auto)) 2.75rem`;

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
          nameEn: before.nameEn,
          isRepeat: meal.dish?.id === before.dishId,
        };
      }

      byDay[day.dayOfWeek] = ghosts;
    }

    return byDay;
  }, [comparing, previous, board.days]);

  return (
    /* `md:gap-2`: from the tablet up, every gutter above the board is board
       that is not being drawn. 12px is right on a phone, where this column
       scrolls and the rhythm is what separates one block from the next; on a
       768px-tall landscape screen the same gutters come off the week. */
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3 md:gap-2">
      {/* No `shadow-card`. The header is a full-width band pinned to the top of
          the workspace, not a card floating on it, and a shadow under something
          that spans the frame reads as a seam rather than as depth. The border
          is what separates it from the board. */}
      {/*
        ── The header is the grid, and the panel inside it is not ──

        `ContextPanel` hands back two siblings — the client row and the line of
        figures — and they are placed here rather than inside a box of their
        own. That is the whole point: a box would have given the figures the
        card's width less the action bar's, which at 768px is not enough for
        five of them, and the allergy fact spent a line on its own.

        Three shapes. One column on a phone: client, figures, actions, stacked.
        Two from `md`, where the four controls need about 18rem once they are
        down to one label and three glyphs and the client row needs about 14rem
        — so they share the first line and the figures run the full width of the
        second. Three at `2xl`, where there is finally room for the figures to
        move up beside the client and the header is one 48px line again; see
        `context-panel.tsx` for why that stop and not `xl`.

        `minmax(21rem, 1fr)` on the client column, because it holds a 44px disc,
        an 11rem name and a 94px pill and a `1fr` will happily hand it less than
        that — which it did at exactly 1280px, and the pill spilled over the
        figures beside it.

        The padding is on this element now rather than on the panel, so the two
        rows and the action bar are spaced by one `gap` instead of by a margin,
        a padding and a self-alignment that all had to be kept in step.
      */}
      <header className="grid gap-2 overflow-hidden rounded-lg border border-border bg-card p-2 md:grid-cols-[minmax(0,1fr)_auto] 2xl:grid-cols-[minmax(21rem,1fr)_minmax(0,2fr)_auto]">
        <h2 className="sr-only">{board.clientName}</h2>
        {children}

        {/* `flex-wrap` only below `md`, where this is still a row of its own and
            a narrow phone may genuinely need two lines. From `md` up it is
            beside the client and must never wrap: a second line here would take
            the header's height back from the board. */}
        <div className="planner-action-bar flex max-w-full flex-wrap items-center justify-end gap-1.5 rounded-lg bg-muted/70 p-1 md:col-start-2 md:row-start-1 md:w-auto md:flex-nowrap md:justify-center md:self-center 2xl:col-start-3">
          {/* Publish leads the bar. It is the only thing here that changes what
              the client sees, and it was sitting second behind a catalog opener —
              a shortcut to a drawer, which is a smaller promise than the one
              control that finishes the week.

              Every button in this bar carries the same 10px radius the `Button`
              base defines. The icon-only ones used to go circular at `2xl`, so
              the row turned into two pills and two discs at exactly the width
              where all four are finally visible together. */}
          <PublishButton
            planId={board.id}
            status={board.status}
            unfilled={board.unfilled}
            locale={locale}
          />

          {/* This app's tooltip, not the browser's `title` — the same swap the
              whole board makes in this pass. A native tip is drawn by the OS in
              its own font and colour, after its own delay, and cannot be
              reached from a keyboard; on a toolbar where every other transient
              surface is a themed popover it reads as a seam. */}
          <TooltipHint label={t('tabs.dishes')}>
            <Button
              type="button"
              size="sm"
              variant="neutral"
              /* Glyph only from `md`, where the label was the difference
                 between this bar fitting beside the client and costing a row.
                 Publish keeps its words — it is the one control here that
                 changes what someone else sees, and a green disc is not a
                 promise anyone should have to guess at. The other three are
                 openers, and the tooltip and the `aria-label` both survive. */
              className="px-3 md:size-10 md:px-0"
              aria-label={t('tabs.dishes')}
              onClick={() => onCatalogOpenChange(true)}
            >
              <Icon name="dishes" />
              <span className="md:sr-only">{t('tabs.dishes')}</span>
            </Button>
          </TooltipHint>

          <NewWeekDialog
            clientId={board.clientId}
            board={board}
            locale={locale}
            newWeek={newWeek}
            triggerVariant="neutral"
            compactTrigger
          />

          <Popover>
            <TooltipHint label={t('moreActions')}>
              <PopoverTrigger
                aria-label={t('moreActions')}
                // `size-10` and the base radius rather than `icon-sm`, which is a
                // disc: the four controls in this bar are one set and share a
                // shape.
                className={cn(buttonVariants({ variant: 'neutral', size: 'sm' }), 'size-10 px-0')}
              >
                <Icon name="moreActions" />
                <span className="sr-only">{t('moreActions')}</span>
              </PopoverTrigger>
            </TooltipHint>
            <PopoverContent
              align="end"
              side="bottom"
              className="max-h-[min(36rem,75dvh)] w-80 overflow-y-auto p-3"
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
                    onClick={() => setComparing((value) => !value)}
                  >
                    <Icon name="history" />
                    {/* Which week it compares against, said in the row rather
                        than hidden in a `title` nobody hovers a menu item long
                        enough to see. */}
                    <span className="min-w-0 flex-1 truncate text-start">
                      {t('compareWith', { date: previous.weekStartDate })}
                    </span>
                  </Button>
                )}

                {/*
                  Deleting the week, at the bottom of the menu and coloured for
                  what it is.

                  Last in the list and under a rule, because it is the one entry
                  here that destroys something: the other rows change what is on
                  screen, and a mis-click on this one takes the plan, its meals
                  and the client's copy of it. `ConfirmDialog` with the
                  destructive tone is the same guard the dish catalog puts on the
                  same kind of act.

                  The rule sits on this wrapper rather than on the button,
                  because `size="sm"` is a fixed 40px box — a border and its
                  padding drawn on the button itself would come out of the
                  label's own height rather than out of the space above it.
                */}
                <div className="mt-1 border-t border-border pt-1">
                  {/* `PopoverClose`, not a `setOpen(false)` of our own: the menu
                      has done its job once this is pressed, and leaving it open
                      behind the modal means cancelling drops you back into a
                      popover you had already finished with. See `PopoverClose`
                      for why the state route does not work here. */}
                  <PopoverClose
                    render={
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={deleting}
                        className="w-full max-w-none justify-start text-destructive hover:bg-destructive-subtle hover:text-destructive"
                        onClick={() => setConfirmingDelete(true)}
                      />
                    }
                  >
                    <Icon name="trash" />
                    {t('deletePlan')}
                  </PopoverClose>
                </div>
              </div>

              {/* The key to the cards' coloured rules. Reference rather than an
                  action, so it sits under the actions and above the history —
                  and inside this popover it costs the board no space at all. */}
              <div className="mt-2 border-t border-border pt-2 empty:hidden">
                <TagColorKey days={board.days} />
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

      {/* A published plan is a record, not a working copy: its nutrition is frozen
          and its composition is locked. Said here rather than left to a control
          that would only fail — the route back to editing is Unpublish, which the
          header already offers. */}
      {board.status === 'published' && <BoardNotice>{t('publishedReadOnly')}</BoardNotice>}

      {board.unfilled > 0 && (
        <BoardNotice>{t('unfilledWarning', { count: board.unfilled })}</BoardNotice>
      )}

      <BoardDayStrip days={orderedDays} selectedDay={selectedDay} onSelect={setSelectedDay} />

      {/* `planner-week-frame` is the board's size container. Every question
          about how wide a day is and how many of them fit is asked of this
          box rather than of the window — see the rules it names in
          `globals.css`. It is on the wrapper and not on the scrollport
          itself, because `container-type` brings `contain: layout` with it
          and the scrollport is the one box on this screen that a
          `position: fixed` drag preview must be free of. */}
      <div className="planner-week-frame flex min-h-0 flex-1">
        {/* Phones render one selected day. Every width above that makes the week
            itself the swipe surface — as many whole days as the frame can hold
            at a readable column width, the rest one gesture away — so the day
            picker no longer spends two rows above the work. How many that is
            per width is decided in `globals.css`, against this frame. */}
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

              Both gutters are declared in `globals.css` and nowhere else. A
              subgrid inherits its parent's, so restating them on the day column
              would let the two drift out of step — and two other rules read
              them as well: the day-width sum needs the column gap to make the
              week land flush, and `.planner-row-cell::before` reaches exactly
              half of each to draw its rule. A gutter this file could change on
              its own is a gutter three other things would be wrong about.

              The seven-track template arrives at `md`, which is where seven
              days start being rendered at all. It is a fallback: from `md` up
              the container rules in `globals.css` replace both tracks with
              measured widths. What it guarantees is that a browser that cannot
              read a `@container` query still gets seven columns sharing the
              frame rather than seven days stacking into one.

              **`min-h-full`, not `h-full`, and the clip is on one axis.** The
              rows need a definite height to stretch into, which is what
              `h-full` was for — but it also pinned the grid to the frame, and
              `overflow-clip` then cut off whatever would not fit. On a 720px
              window that was a whole row of seven meals: drawn nowhere,
              reachable by nothing, with no scrollbar to suggest they existed.
              `min-h-full` keeps the stretch when the week fits and lets the
              grid grow past the frame when the readability floor says it
              must — which is the case the frame's own `overflow-auto` was
              always there to handle.

              The clip stays on the inline axis, because that is the one it was
              for: `.planner-row-cell::before` reaches half into the column
              gutter to draw a continuous rule, and the outermost two reaches
              have to be cut off the board's edge. `overflow-x: clip` beside
              `overflow-y: visible` is a legal pair — unlike `hidden`, `clip`
              does not force the other axis to become a scroll container — so
              the block overflow travels up to the frame the way it should. */}
          <div
            className="planner-week-grid grid min-h-full grid-cols-[auto_minmax(0,1fr)] overflow-x-clip p-2 md:grid-cols-[auto_repeat(7,minmax(0,1fr))]"
            style={{ gridTemplateRows: rowTemplate }}
          >
            <SlotRail rows={rows} editable={editable} />

            {orderedDays.map((day) => (
              <DayColumn
                key={day.dayOfWeek}
                day={day}
                date={columnDates.get(day.dayOfWeek)?.date ?? null}
                namesMonth={columnDates.get(day.dayOfWeek)?.namesMonth ?? false}
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

        {/* The one mark that says the week continues past the edge.

            An exact fit is what the geometry above is for — four whole days,
            the last of them flush with the frame — and the cost of getting it
            right is that the board now looks finished. Nothing is half-drawn at
            the edge any more, the scrollbar is hidden, and a dietitian who has
            never swiped this surface has no reason to think there is anything
            to swipe to. A soft fade on the trailing edge is the ordinary signal
            that a surface runs on, and it costs no height, which is the whole
            currency of this screen.

            A span rather than a pseudo-element on the frame, because the frame
            is the size container and a container query can only reach things
            inside it — this is how the fade knows to switch itself off at the
            width where all seven days fit and there is nothing left to say. */}
        <span aria-hidden className="planner-week-fade" />
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

      {confirmingDelete && (
        <ConfirmDialog
          locale={locale}
          title={t('deletePlanConfirmTitle')}
          description={t('deletePlanConfirmMessage', { date: board.weekStartDate })}
          /* The consequence the title does not carry: a published week is one
             the client is reading right now, and deleting it takes their copy
             with it. Only said when there is one to lose. */
          note={board.status === 'published' ? t('deletePlanPublishedNote') : undefined}
          confirmLabel={tCommon('delete')}
          cancelLabel={tCommon('cancel')}
          tone="destructive"
          onConfirm={() => {
            setConfirmingDelete(false);

            /* The action ends in a `redirect`, so there is no result to read
               and nothing to reset afterwards — the transition exists to keep
               the board interactive while the delete lands, and to hold the
               menu entry disabled so it cannot be fired twice. */
            startDeleting(async () => {
              const formData = new FormData();
              formData.set('locale', locale);
              formData.set('planId', board.id);
              formData.set('clientId', board.clientId);
              await deletePlanAction(formData);
            });
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
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
