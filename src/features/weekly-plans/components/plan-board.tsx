'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { roundForDisplay } from '@/features/weekly-plans/nutrition';

import { isMember } from '@/lib/enum';

import type { Board, CatalogEntry, ComparisonPlan, SwapCandidate } from '../queries';
import { PLAN_STATUSES } from '../schema';
import { slotFillKey } from '../skeleton';
import type { RecentUse } from '../usage';

import { BoardEditor, useEditor } from './board-dnd';
import { DayColumn } from './day-column';
import { DishCatalog } from './dish-catalog';
import type { GhostMeal } from './meal-card';
import { MealDetailPanel } from './meal-detail-panel';
import { NewWeekMenu } from './new-week-menu';
import { PublishButton } from './publish-button';
import { RailTabs } from './rail-tabs';

/** The rail's panels. */
type RailTab = 'client' | 'dishes' | 'meal' | 'past';

type BoardProps = {
  board: Board;
  candidates: Record<string, SwapCandidate[]>;
  catalog: readonly CatalogEntry[];
  usage: Record<string, RecentUse>;
  /** The plan immediately before this one, for the compare overlay. */
  previous: ComparisonPlan | null;
  locale: string;
  /** The client's earlier weeks, rendered on the server. */
  history: React.ReactNode;
  newWeek: {
    weekStartDate: string;
    previousPlan: { id: string; weekStartDate: string } | null;
    blocked: boolean;
  };
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
  // The optimistic board, not the server one: everything below renders the edit
  // just made, before it has finished being written.
  const { board, editable, pending, error } = useEditor();

  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);
  const [tab, setTab] = useState<RailTab>('client');
  const [comparing, setComparing] = useState(false);

  const selectedMeal = board.days
    .flatMap((day) => day.meals)
    .find((meal) => meal.id === selectedMealId);

  const dailyTarget = Math.round(board.kcalTargetSnapshot);
  const weekKcal = roundForDisplay('kcal', board.totals.kcal.value);

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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">{board.clientName}</h2>

        {isMember(PLAN_STATUSES, board.status) && (
          <Badge variant={board.status === 'published' ? 'default' : 'muted'}>
            {t(`status.${board.status}`)}
          </Badge>
        )}

        <span className="text-xs text-muted-foreground">
          {t('weekOf', { date: board.weekStartDate })}
        </span>

        <span className="text-xs text-muted-foreground">{t('weekTotal', { value: weekKcal })}</span>

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

        {board.model && (
          <span className="text-xs text-muted-foreground" title={t('generatedBy')}>
            {board.model}
          </span>
        )}

        {/* Quiet on success, explicit on failure, announced either way. There is no
            toast primitive in the design system, and this is not a good reason to
            invent one. */}
        <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {error ? (
            <span className="text-destructive">{t(error)}</span>
          ) : pending ? (
            t('savingIndicator')
          ) : null}
        </span>

        <div className="ms-auto flex items-center gap-2">
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

          <NewWeekMenu
            clientId={board.clientId}
            weekStartDate={newWeek.weekStartDate}
            previousPlan={newWeek.previousPlan}
            locale={locale}
            blocked={newWeek.blocked}
            onGenerate={() => setTab('client')}
          />

          <PublishButton
            planId={board.id}
            status={board.status}
            unfilled={board.unfilled}
            locale={locale}
          />
        </div>
      </header>

      {allowPublished && (
        <p className="rounded-md bg-status-attention-bg px-3 py-2 text-xs text-status-attention-fg">
          {t('editPublishedWarning')}
        </p>
      )}

      {board.unfilled > 0 && (
        <p className="rounded-md bg-status-attention-bg px-3 py-2 text-xs text-status-attention-fg">
          {t('unfilledWarning', { count: board.unfilled })}
        </p>
      )}

      <div className="flex min-h-0 flex-1 gap-3">
        {/* Seven equal columns. `minmax(0,1fr)` rather than `1fr` so a long dish
            name wraps instead of widening its column past the others. */}
        <div className="grid min-w-0 flex-1 auto-rows-min grid-cols-7 gap-2 overflow-y-auto">
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
              }}
              ghosts={ghostsByDay?.[day.dayOfWeek]}
              compareDate={previous?.weekStartDate}
            />
          ))}
        </div>

        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-s border-border ps-3">
          <RailTabs
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

          <div
            role="tabpanel"
            id={`rail-panel-${tab}`}
            aria-labelledby={`rail-tab-${tab}`}
            className="min-h-0 flex-1"
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
                  onClose={() => {
                    setSelectedMealId(null);
                    setTab('client');
                  }}
                />
              ) : (
                <p className="text-xs text-muted-foreground">{t('selectMeal')}</p>
              )
            ) : tab === 'past' ? (
              history
            ) : (
              children
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
