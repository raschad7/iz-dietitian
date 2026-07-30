import { useLocale, useTranslations } from 'next-intl';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  MACRO_KEYS,
  NUTRIENT_KEYS,
  NUTRIENT_UNITS,
  roundForDisplay,
  type NutrientTotals,
} from '@/features/meal-plans/nutrition';
import { type PlanDay, type PlanDetail, type PlanMeal } from '@/features/meal-plans/queries';
import { DAYS_OF_WEEK, dayKey } from '@/features/meal-plans/schema';
import { Link } from '@/i18n/navigation';
import { formatNumber } from '@/lib/format';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The client's own view of their plan: one day at a time.
 *
 * The dietitian's workspace shows the week and lets them edit it. A client
 * reading their plan on a phone wants one question answered — "what am I eating
 * today?" — so this opens on today and the other days are one tap away.
 *
 * Which day is showing lives in the URL (`?day=3`), not in component state, so
 * there is no client-side JavaScript here at all and a day is a shareable,
 * back-button-able address.
 *
 * Every number comes from `PlanDetail`, computed by the meal-plans feature's own
 * `nutrition.ts`. The portal does no arithmetic of its own: a client and their
 * dietitian must never see two different totals for one meal.
 */

type MealPlanViewProps = {
  plan: PlanDetail;
  /** 0 = Sunday … 6 = Saturday. */
  selectedDay: number;
};

export function MealPlanView({ plan, selectedDay }: MealPlanViewProps) {
  const t = useTranslations('portal');
  const tPlans = useTranslations('mealPlans');

  const day = plan.days[selectedDay];

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{plan.title}</h2>
        {plan.notes ? <p className="text-sm whitespace-pre-line text-muted-foreground">{plan.notes}</p> : null}
      </header>

      <nav
        aria-label={t('plan.chooseDay')}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"
      >
        {DAYS_OF_WEEK.map((dayOfWeek) => {
          const active = dayOfWeek === selectedDay;

          return (
            <Link
              key={dayOfWeek}
              href={`/portal/meal-plan?day=${dayOfWeek}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-lg border px-3 py-2 text-sm transition-colors',
                active ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted',
              )}
            >
              {tPlans(`days.${dayKey(dayOfWeek)}`)}
            </Link>
          );
        })}
      </nav>

      {day === undefined || day.meals.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tPlans('emptyDay')}</p>
      ) : (
        <>
          <DayTotals day={day} />

          <ul className="space-y-3">
            {day.meals.map((meal) => (
              <li key={meal.id}>
                <MealCard meal={meal} />
              </li>
            ))}
          </ul>

          <NutrientTable totals={day.totals} />
        </>
      )}
    </div>
  );
}

/** Energy and the three macros for the whole day — the headline the page opens with. */
function DayTotals({ day }: { day: PlanDay }) {
  const t = useTranslations('portal');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('plan.dayTotals')}</CardTitle>
      </CardHeader>
      <CardContent>
        <MacroRow totals={day.totals} />
      </CardContent>
    </Card>
  );
}

/** One meal: what is in it, how much, and what it comes to. */
function MealCard({ meal }: { meal: PlanMeal }) {
  const t = useTranslations('portal');
  const tPlans = useTranslations('mealPlans');

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-2">
          <span>{meal.label}</span>
          {/* Stored as `HH:MM`, shown as stored — a wall clock reads the same in both languages. */}
          <span className="text-sm font-normal tabular-nums text-muted-foreground" dir="ltr">
            {meal.timeOfDay}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {meal.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tPlans('emptyMeal')}</p>
        ) : (
          <ul className="space-y-1.5">
            {meal.items.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span>{item.food.description}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground" dir="ltr">
                  {t('plan.grams', { grams: item.quantityGrams })}
                </span>
              </li>
            ))}
          </ul>
        )}

        <MacroRow totals={meal.totals} />
      </CardContent>
    </Card>
  );
}

/** Energy plus protein/carbohydrate/fat, the four numbers anyone actually reads. */
function MacroRow({ totals }: { totals: NutrientTotals }) {
  const locale = useLocale() as Locale;
  const tPlans = useTranslations('mealPlans');

  return (
    <dl className="grid grid-cols-4 gap-2 border-t border-border pt-3 text-center">
      {(['kcal', ...MACRO_KEYS] as const).map((key) => (
        <div key={key} className="space-y-0.5">
          <dt className="text-xs text-muted-foreground">{tPlans(`nutrients.${key}`)}</dt>
          <dd className="text-sm font-medium tabular-nums" dir="ltr">
            {formatNumber(locale, roundForDisplay(key, totals[key].value))}
            <span className="ms-0.5 text-xs font-normal text-muted-foreground">{NUTRIENT_UNITS[key]}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Every nutrient for the day, folded away behind a `<details>`.
 *
 * Open by default it would bury the meals on a phone; removed entirely it would
 * withhold the part of the plan a client with a medical reason to read it needs
 * most. A native `<details>` costs no JavaScript and is accessible as it stands.
 */
function NutrientTable({ totals }: { totals: NutrientTotals }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal');
  const tPlans = useTranslations('mealPlans');

  const anyUnmeasured = NUTRIENT_KEYS.some((key) => totals[key].unmeasured > 0);

  return (
    <details className="rounded-xl ring-1 ring-foreground/10">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{t('plan.allNutrients')}</summary>

      <dl className="space-y-2 px-4 pb-4">
        {NUTRIENT_KEYS.map((key) => (
          <div key={key} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-muted-foreground">
              {tPlans(`nutrients.${key}`)}
              {totals[key].unmeasured > 0 ? <span aria-hidden> *</span> : null}
            </dt>
            <dd className="tabular-nums" dir="ltr">
              {formatNumber(locale, roundForDisplay(key, totals[key].value))} {NUTRIENT_UNITS[key]}
            </dd>
          </div>
        ))}
      </dl>

      {anyUnmeasured ? (
        <p className="px-4 pb-4 text-xs text-muted-foreground">{tPlans('analysis.unmeasuredNote')}</p>
      ) : null}
    </details>
  );
}
