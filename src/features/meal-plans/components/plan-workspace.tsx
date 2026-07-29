'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addMealAction } from '@/features/meal-plans/actions';
import { AnalysisPanel } from '@/features/meal-plans/components/analysis-panel';
import { MealBlock } from '@/features/meal-plans/components/meal-block';
/**
 * `import type`, not `import { type … }`. Both erase in TypeScript, but only the
 * top-level form keeps `queries.ts` out of the bundler's client module graph —
 * with the inline form Turbopack follows it to `@/db` and tries to bundle
 * `postgres` for the browser, which fails on `node:net`.
 */
import type { PlanDetail } from '@/features/meal-plans/queries';
import { type Locale } from '@/i18n/routing';

/**
 * The two halves of the meal-plan page: the day's schedule, and the analysis of
 * whatever is currently in focus.
 *
 * This is the only client component that holds state, and it holds exactly one
 * thing — which block is selected. Everything else is server-rendered and
 * re-fetched by `revalidatePath` after each edit, so the totals on screen are
 * always the totals in the database rather than an optimistic guess.
 */
export function PlanWorkspace({
  locale,
  plan,
  categories,
}: {
  locale: Locale;
  plan: PlanDetail;
  categories: string[];
}) {
  const t = useTranslations('mealPlans');

  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);

  /**
   * Resolved from the plan rather than stored, so a block deleted in another tab
   * cannot leave the panel analysing something that no longer exists.
   */
  const selectedMeal = plan.meals.find((meal) => meal.id === selectedMealId) ?? null;

  const totals = selectedMeal ? selectedMeal.totals : plan.totals;
  const itemCount = selectedMeal
    ? selectedMeal.items.length
    : plan.meals.reduce((count, meal) => count + meal.items.length, 0);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {/* Part one: the schedule. */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t('schedule')}</h3>

          {selectedMeal ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setSelectedMealId(null)}>
              {t('analysis.showWholeDay')}
            </Button>
          ) : null}
        </div>

        {plan.meals.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t('emptySchedule')}
          </p>
        ) : (
          plan.meals.map((meal) => (
            <MealBlock
              key={meal.id}
              locale={locale}
              planId={plan.id}
              meal={meal}
              categories={categories}
              selected={meal.id === selectedMealId}
              onSelect={() => setSelectedMealId(meal.id === selectedMealId ? null : meal.id)}
            />
          ))
        )}

        <AddMealForm locale={locale} planId={plan.id} />
      </div>

      {/*
       * Part two: the analysis. Sticky on a wide screen so it stays beside the
       * schedule while scrolling; it simply follows underneath on a narrow one.
       */}
      <aside className="lg:sticky lg:top-6">
        <AnalysisPanel
          locale={locale}
          totals={totals}
          scope={selectedMeal ? `${selectedMeal.timeOfDay} · ${selectedMeal.label}` : null}
          itemCount={itemCount}
        />
      </aside>
    </div>
  );
}

/** Adds a block to the day. Collapsed until asked for, so it does not compete with the schedule. */
function AddMealForm({ locale, planId }: { locale: Locale; planId: string }) {
  const t = useTranslations('mealPlans');
  const tCommon = useTranslations('common');

  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        {t('actions.addMeal')}
      </Button>
    );
  }

  return (
    <form
      action={addMealAction}
      onSubmit={() => setOpen(false)}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="planId" value={planId} />

      <Input
        name="timeOfDay"
        type="time"
        required
        dir="ltr"
        defaultValue="21:00"
        className="w-32"
        aria-label={t('fields.timeOfDay')}
      />
      <Input
        name="label"
        required
        maxLength={60}
        placeholder={t('fields.mealLabel')}
        className="w-44"
        aria-label={t('fields.mealLabel')}
      />

      <Button type="submit" size="sm">
        {t('actions.addMeal')}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
        {tCommon('cancel')}
      </Button>
    </form>
  );
}
