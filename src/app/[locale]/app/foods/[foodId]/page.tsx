import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  MACRO_KEYS,
  NUTRIENT_KEYS,
  NUTRIENT_UNITS,
  energySplit,
  roundForDisplay,
  sumNutrients,
} from '@/features/meal-plans/nutrition';
import { getFood } from '@/features/meal-plans/queries';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { formatNumber, formatPercent } from '@/lib/format';
import { requireStaffSession } from '@/lib/session';

type FoodPageProps = {
  params: Promise<{ locale: string; foodId: string }>;
};

export async function generateMetadata({ params }: FoodPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'foods' });
  return { title: t('title') };
}

export default async function FoodPage({ params }: FoodPageProps) {
  const locale = await resolveLocale(params);
  await requireStaffSession(locale);

  const { foodId } = await params;
  const food = await getFood(foodId);

  if (!food) {
    notFound();
  }

  const t = await getTranslations('foods');

  /**
   * Reuses the meal-plan arithmetic at exactly 100 g, so this page and the
   * analysis panel can never disagree about what a food contains.
   */
  const totals = sumNutrients([{ food, quantityGrams: 100 }]);
  const split = energySplit(totals);

  return (
    <div className="space-y-6 text-start">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">{food.description}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="muted">{food.category}</Badge>
          <span className="text-sm text-muted-foreground">{t('per100g')}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('sections.macros')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-3xl font-semibold tabular-nums" dir="ltr">
                {formatNumber(locale, roundForDisplay('kcal', food.kcal))}
              </p>
              <p className="text-xs text-muted-foreground">{t('nutrients.kcal')} (kcal)</p>
            </div>

            {MACRO_KEYS.map((key) => (
              <div key={key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span>{t(`nutrients.${key}`)}</span>
                  <span className="tabular-nums text-muted-foreground" dir="ltr">
                    {formatNumber(locale, roundForDisplay(key, split[key].grams))} g ·{' '}
                    {formatPercent(locale, split[key].percent)}
                  </span>
                </div>
                {/* Sized with `inline-size` so the bar mirrors itself in Arabic. */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground/70"
                    style={{ inlineSize: `${(split[key].percent * 100).toFixed(1)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('sections.allNutrients')}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full border-collapse text-sm">
              <tbody>
                {NUTRIENT_KEYS.map((key) => (
                  <tr key={key} className="border-t border-border/60 first:border-t-0">
                    <td className="py-1.5 text-start">{t(`nutrients.${key}`)}</td>
                    <td className="py-1.5 text-end tabular-nums" dir="ltr">
                      {/*
                       * Null is "never measured", not zero — so it renders as a
                       * dash rather than as a claim the source does not make.
                       */}
                      {food[key] === null ? (
                        <span className="text-muted-foreground">{t('notMeasured')}</span>
                      ) : (
                        `${formatNumber(locale, roundForDisplay(key, food[key]))} ${NUTRIENT_UNITS[key]}`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t('sections.source')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-muted-foreground">{t('fields.portion')}</span>
              <span className="font-medium" dir="ltr">
                {food.portionGrams === null ? (
                  <span className="font-normal text-muted-foreground">{t('noPortion')}</span>
                ) : (
                  `${food.portionLabel} = ${formatNumber(locale, food.portionGrams)} g`
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-muted-foreground">{t('fields.fdcId')}</span>
              {/*
               * Straight to the published record this row was derived from —
               * the point of keeping `fdc_id` as the natural key.
               */}
              <a
                href={`https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline-offset-4 hover:underline"
                dir="ltr"
              >
                {food.fdcId}
              </a>
            </div>

            <p className="text-xs text-muted-foreground">{t('dataSource')}</p>
          </CardContent>
        </Card>
      </div>

      <Link href="/app/foods" className="inline-block text-sm underline-offset-4 hover:underline">
        {t('backToList')}
      </Link>
    </div>
  );
}
