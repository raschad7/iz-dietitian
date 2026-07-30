import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { roundForDisplay } from '@/features/meal-plans/nutrition';

import type { Board } from '../queries';
import { dayKey } from '../schema';
import { weekDates } from '../week';

/**
 * The client's own view of their published week.
 *
 * Stacked days rather than seven columns: this is read on a phone, and a 7×5 grid at
 * 375px is unreadable. The dietitian's board is a planning tool; this is a shopping
 * list and a daily reminder, so it optimises for one day at a time.
 *
 * Read-only by design. The alternatives are shown as "you can eat this instead" —
 * the feature that makes a plan survive a real week — but nothing writes back, so
 * the plan the dietitian published stays the plan of record.
 */
export function PortalPlan({ board }: { board: Board }) {
  const t = useTranslations('portal.plan');
  const tDays = useTranslations('mealPlans.days');

  const dates = weekDates(board.weekStartDate);

  return (
    <div className="space-y-6 text-start">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('weekOf', { date: board.weekStartDate })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t('dailyTarget', { value: board.kcalTargetSnapshot })}
        </p>
      </header>

      <div className="space-y-5">
        {board.days.map((day, index) => {
          if (!day.meals.length) return null;

          const kcal = roundForDisplay('kcal', day.totals.kcal.value);

          return (
            <section key={day.dayOfWeek} className="space-y-2">
              <h3 className="flex flex-wrap items-baseline gap-2 border-b border-border pb-1.5">
                <span className="text-base font-semibold">{tDays(dayKey(day.dayOfWeek))}</span>
                {dates[index] && (
                  <span className="text-xs text-muted-foreground">{dates[index]}</span>
                )}
                <span className="ms-auto text-xs text-muted-foreground">
                  {t('kcalValue', { value: kcal })}
                </span>
              </h3>

              <ul className="space-y-3">
                {day.meals.map((meal) => (
                  <li key={meal.id} className="rounded-lg p-3 ring-1 ring-foreground/10">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        {meal.label} · {meal.timeOfDay}
                      </span>
                      <span className="ms-auto text-xs text-muted-foreground">
                        {t('kcalValue', { value: roundForDisplay('kcal', meal.totals.kcal.value) })}
                      </span>
                    </div>

                    {meal.dish ? (
                      <>
                        <p className="mt-1 font-medium">{meal.dish.nameAr}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('portion', {
                            servings: meal.dish.servings,
                            label: meal.dish.baseServingLabel,
                          })}
                        </p>

                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-primary">
                            {t('showIngredients')}
                          </summary>
                          <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                            {meal.dish.ingredients.map((ingredient) => (
                              <li key={ingredient.food.id}>
                                {roundForDisplay(
                                  'protein',
                                  ingredient.quantityGrams * meal.dish!.servings,
                                )}{' '}
                                g · {ingredient.food.description}
                              </li>
                            ))}
                          </ul>
                        </details>

                        {meal.rationaleAr && (
                          <p className="mt-2 border-s-2 border-primary/40 ps-2.5 text-xs leading-relaxed text-muted-foreground">
                            {meal.rationaleAr}
                          </p>
                        )}

                        {meal.options.length > 0 && (
                          <div className="mt-2.5">
                            <p className="text-xs font-medium">{t('orInstead')}</p>
                            <ul className="mt-1 flex flex-wrap gap-1.5">
                              {meal.options.map((option) => (
                                <li key={option.id}>
                                  <Badge variant="muted">
                                    {option.nameAr} ·{' '}
                                    {t('kcalValue', {
                                      value: roundForDisplay('kcal', option.kcal),
                                    })}
                                  </Badge>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">{t('noMeal')}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
