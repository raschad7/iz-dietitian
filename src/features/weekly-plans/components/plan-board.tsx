'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { roundForDisplay } from '@/features/weekly-plans/nutrition';

import { isMember } from '@/lib/enum';

import type { Board, SwapCandidate } from '../queries';
import { PLAN_STATUSES } from '../schema';

import { DayColumn } from './day-column';
import { MealDetailPanel } from './meal-detail-panel';
import { NewWeekMenu } from './new-week-menu';
import { PublishButton } from './publish-button';
import { RailTabs } from './rail-tabs';

/** The rail's panels. `meal` is empty until a card is opened. */
type RailTab = 'client' | 'meal' | 'past';

/**
 * The board: seven day columns, and an end-side rail that shows the client's context
 * until a meal is opened.
 *
 * A client component because selecting a meal is local state — no fetch, no
 * navigation. The whole plan arrives in one server query, so switching days or
 * opening a card costs nothing.
 *
 * The panel and the context share one rail rather than stacking: at laptop width
 * there is room for seven columns and one sidebar, not two.
 */
export function PlanBoard({
  board,
  candidates,
  locale,
  history,
  newWeek,
  children,
}: {
  board: Board;
  candidates: Record<string, SwapCandidate[]>;
  locale: string;
  /** The client's earlier weeks, rendered on the server. */
  history: React.ReactNode;
  /**
   * What the New week menu needs. Passed as data rather than as rendered markup
   * because its generate entry has to reach back into the rail, which is state
   * only this component holds.
   */
  newWeek: {
    weekStartDate: string;
    previousPlan: { id: string; weekStartDate: string } | null;
    blocked: boolean;
  };
  /** The context panel, rendered on the server and shown when no meal is open. */
  children: React.ReactNode;
}) {
  const t = useTranslations('weeklyPlans');
  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);
  const [tab, setTab] = useState<RailTab>('client');

  // A published plan is read-only. Editing what a client is already following would
  // be the worst kind of surprise; `unpublish` is the deliberate way back.
  const editable = board.status === 'draft';

  const selectedMeal = board.days
    .flatMap((day) => day.meals)
    .find((meal) => meal.id === selectedMealId);

  const dailyTarget = Math.round(board.kcalTargetSnapshot);
  const weekKcal = roundForDisplay('kcal', board.totals.kcal.value);

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

        <span className="text-xs text-muted-foreground">
          {t('weekTotal', { value: weekKcal })}
        </span>

        {board.model && (
          <span className="text-xs text-muted-foreground" title={t('generatedBy')}>
            {board.model}
          </span>
        )}

        <div className="ms-auto flex items-center gap-2">
          <NewWeekMenu
            clientId={board.clientId}
            weekStartDate={newWeek.weekStartDate}
            previousPlan={newWeek.previousPlan}
            locale={locale}
            blocked={newWeek.blocked}
            // The generate form lives in the client tab, under the context panel.
            // Switching to it is the whole of "open the generate panel".
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

      {board.unfilled > 0 && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
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
                // Clicking the open card closes it, which is what a toggle should do.
                setSelectedMealId((current) => (current === mealId ? null : mealId));
                // Opening a card is a request to read it, so the rail follows.
                setTab('meal');
              }}
            />
          ))}
        </div>

        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-s border-border ps-3">
          <RailTabs
            label={t('title')}
            active={tab}
            onSelect={setTab}
            tabs={[
              { id: 'client', label: t('tabs.client') },
              { id: 'meal', label: t('tabs.meal') },
              { id: 'past', label: t('tabs.past') },
            ]}
          />

          <div
            role="tabpanel"
            id={`rail-panel-${tab}`}
            aria-labelledby={`rail-tab-${tab}`}
            className="min-h-0 flex-1"
          >
            {tab === 'meal' ? (
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
